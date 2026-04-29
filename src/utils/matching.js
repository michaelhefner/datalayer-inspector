/**
 * Recursively collect all leaf string/number values from a DL payload that
 * are long enough to be meaningful matches (avoids false positives on short
 * values like "1" or "en").
 */
export function extractValues(val, out = new Set(), depth = 0) {
  if (depth > 6 || val === null || val === undefined) return out;
  if (typeof val === 'string') {
    if (val.length >= 4) out.add(val);
  } else if (typeof val === 'number' && isFinite(val)) {
    const s = String(val);
    if (s.length >= 4) out.add(s);
  } else if (Array.isArray(val)) {
    val.forEach((v) => extractValues(v, out, depth + 1));
  } else if (typeof val === 'object') {
    Object.values(val).forEach((v) => extractValues(v, out, depth + 1));
  }
  return out;
}

/**
 * For a given DL push event, find network requests that:
 * 1. Fired within 5 seconds after (or 0.5 s before) the push
 * 2. Have at least one DL value present in the request URL or POST body
 *
 * Returns an array sorted by number of matched values (highest first).
 * Each item: { req, hitCount }
 */
export function findMatchingRequests(dlEvent, requests) {
  if (!requests || requests.length === 0) return [];

  const values = extractValues(dlEvent.payload);
  if (values.size === 0) return [];

  const matches = [];
  for (const req of requests) {
    if (req.wallTime === undefined) continue;
    const dt = req.wallTime - dlEvent.ts;
    if (dt < -500 || dt > 5000) continue;

    const searchText = (req.url || '') + '\n' + (req.postData || '');
    let hitCount = 0;
    for (const val of values) {
      if (searchText.includes(val)) hitCount++;
    }
    if (hitCount > 0) matches.push({ req, hitCount });
  }

  return matches.sort((a, b) => b.hitCount - a.hitCount);
}

export function getEventName(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return 'push';
  const first = payload[0];
  if (first && typeof first === 'object') {
    if (first.eventCategory) return first.eventCategory;
    if (first.event) return first.event;
    if (first.hitType) return first.hitType;
    if (first['gtm.start'] !== undefined) return 'gtm.init';
  }
  return 'push';
}
