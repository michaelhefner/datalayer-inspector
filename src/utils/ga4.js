/**
 * GA4 / GTM payload detection — domain-agnostic.
 * Works with first-party / server-side / Google Tag Gateway endpoints.
 */

// Tracking ID patterns in parameter values
const TRACKING_ID_RE = /\b(G-[A-Z0-9]+|UA-\d+-\d+|AW-\d+|DC-\d+)\b/;

// GA4 Measurement Protocol v2 — URL-encoded params sent to collect endpoints
// A request is GA4 if it has a tracking ID OR has ≥2 of these params together
const GA4_PARAM_KEYS = new Set([
  'tid', 'v', 'en', 'cid', '_p', '_et', '_fv', '_ss', 'seg', 'sct',
  '_s', 'dl', 'dr', 'dt', 'sr', 'ul', 'sid', 'uid', 'uip',
]);

// GA4 JSON Measurement Protocol body keys (server-side / sGTM forwarded)
const GA4_JSON_BODY_KEYS = new Set([
  'measurement_id', 'client_id', 'user_id', 'timestamp_micros',
  'non_personalized_ads', 'user_properties', 'events', 'event_name',
]);

// GTM dataLayer push keys
const GTM_DL_KEYS = new Set([
  'gtm.start', 'gtm.uniqueEventId', 'gtm.load', 'gtm.dom',
  'gtm.historyChangeSource', 'gtm.oldUrl', 'gtm.newUrl',
  'gtm.scrollThreshold', 'gtm.scrollUnits', 'gtm.scrollDirection',
  'gtm.elementUrl', 'gtm.elementClasses', 'gtm.elementId',
  'gtm.elementTarget', 'gtm.elementType', 'gtm.element', 'gtm.triggers',
]);

// GA4 recommended event names
const GA4_EVENT_NAMES = new Set([
  'page_view', 'first_visit', 'session_start', 'user_engagement',
  'scroll', 'click', 'view_search_results', 'add_to_cart',
  'remove_from_cart', 'view_item', 'view_item_list', 'select_item',
  'add_to_wishlist', 'begin_checkout', 'add_payment_info',
  'add_shipping_info', 'purchase', 'refund', 'view_promotion',
  'select_promotion', 'generate_lead', 'login', 'sign_up', 'share',
  'search', 'exception', 'timing_complete', 'level_start', 'level_end',
  'level_up', 'earn_virtual_currency', 'spend_virtual_currency',
  'unlock_achievement', 'post_score', 'tutorial_begin', 'tutorial_complete',
]);

/**
 * Parse a URL-encoded body or URL search string into a plain object.
 * Returns null if unparseable.
 */
function parseUrlEncoded(text) {
  try {
    const p = new URLSearchParams(text);
    const out = {};
    p.forEach((v, k) => { out[k] = v; });
    return Object.keys(out).length > 0 ? out : null;
  } catch { return null; }
}

/**
 * Parse a JSON body into a plain object.
 * Returns null if unparseable.
 */
function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Return a GA4-signal score for a flat param object.
 * Score ≥ 2 → treat as GA4.
 */
function scoreParams(params) {
  if (!params) return 0;
  let score = 0;
  for (const [k, v] of Object.entries(params)) {
    // Tracking ID in any value
    if (TRACKING_ID_RE.test(String(v))) { score += 3; break; }
    // Known GA4 param key
    if (GA4_PARAM_KEYS.has(k)) score += 1;
    // ep.* / up.* are GA4 event/user param namespaces
    if (k.startsWith('ep.') || k.startsWith('up.') || k.startsWith('epn.')) score += 1;
  }
  return score;
}

/**
 * Determine if a network request looks like GA4/GTM traffic
 * purely from its payload — no domain check.
 *
 * Returns { isGa4: boolean, params: object|null, source: 'url'|'body-form'|'body-json'|null }
 */
export function detectGa4Request(req) {
  // 1. Try URL query string
  try {
    const u = new URL(req.url);
    const urlParams = {};
    u.searchParams.forEach((v, k) => { urlParams[k] = v; });
    if (scoreParams(urlParams) >= 2) {
      return { isGa4: true, params: urlParams, source: 'url' };
    }
    // Also check if tracking ID appears literally in the URL path/query
    if (TRACKING_ID_RE.test(req.url)) {
      return { isGa4: true, params: urlParams, source: 'url' };
    }
  } catch {}

  // 2. Try POST body
  const body = req.postData;
  if (body) {
    // Try JSON first
    const json = parseJson(body);
    if (json && typeof json === 'object') {
      const keys = Object.keys(json);
      const hits = keys.filter((k) => GA4_JSON_BODY_KEYS.has(k)).length;
      if (hits >= 2 || (hits >= 1 && TRACKING_ID_RE.test(body))) {
        return { isGa4: true, params: json, source: 'body-json' };
      }
    }

    // Try URL-encoded form body
    const form = parseUrlEncoded(body);
    if (scoreParams(form) >= 2) {
      return { isGa4: true, params: form, source: 'body-form' };
    }
  }

  return { isGa4: false, params: null, source: null };
}

/**
 * Check whether a dataLayer push itself looks GA4/GTM related
 * (either by event name or by keys in the first payload object).
 */
export function isDlPushGa4(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  const first = payload[0];
  if (!first || typeof first !== 'object') return false;

  // GTM internal key present
  if (Object.keys(first).some((k) => GTM_DL_KEYS.has(k))) return true;

  // Event name is a GA4 recommended event
  if (first.event && GA4_EVENT_NAMES.has(first.event)) return true;

  // event starts with 'gtm.'
  if (typeof first.event === 'string' && first.event.startsWith('gtm.')) return true;

  return false;
}

/**
 * Pretty-print GA4 URL-encoded params into logical groups:
 *  - Identity  (tid, cid, uid, v)
 *  - Event     (en, _p, _et, _s, _fv, _ss, seg, sct, sid)
 *  - Event params (ep.* / epn.* — strip prefix)
 *  - User props (up.* — strip prefix)
 *  - Page      (dl, dr, dt, sr, ul)
 *  - Other
 */
export function groupGa4Params(params) {
  const identity = {};
  const event = {};
  const eventParams = {};
  const userProps = {};
  const page = {};
  const other = {};

  const identityKeys = new Set(['tid', 'cid', 'uid', 'v', 'uip', 'aip']);
  const eventKeys = new Set(['en', '_p', '_et', '_s', '_fv', '_ss', 'seg', 'sct', 'sid', '_c', '_lc']);
  const pageKeys = new Set(['dl', 'dr', 'dt', 'sr', 'ul']);

  for (const [k, v] of Object.entries(params)) {
    if (identityKeys.has(k)) { identity[k] = v; }
    else if (eventKeys.has(k)) { event[k] = v; }
    else if (k.startsWith('ep.') || k.startsWith('epn.')) {
      eventParams[k.replace(/^ep[n]?\./, '')] = v;
    } else if (k.startsWith('up.')) {
      userProps[k.replace(/^up\./, '')] = v;
    } else if (pageKeys.has(k)) { page[k] = v; }
    else { other[k] = v; }
  }

  const groups = [];
  if (Object.keys(identity).length) groups.push({ label: 'Identity', data: identity });
  if (Object.keys(event).length)    groups.push({ label: 'Event', data: event });
  if (Object.keys(eventParams).length) groups.push({ label: 'Event Parameters', data: eventParams });
  if (Object.keys(userProps).length) groups.push({ label: 'User Properties', data: userProps });
  if (Object.keys(page).length)     groups.push({ label: 'Page', data: page });
  if (Object.keys(other).length)    groups.push({ label: 'Other', data: other });
  return groups;
}
