import React, { useState, useMemo } from 'react';
import { findMatchingRequests, getEventName } from '../utils/matching';
import { detectGa4Request, isDlPushGa4, groupGa4Params } from '../utils/ga4';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function KVTable({ data }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <table className="ri-kv-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="ri-kv-row">
            <td className="ri-kv-name">{k}</td>
            <td className="ri-kv-value">
              {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GA4PayloadDetail({ req, ga4, payload }) {
  const { params, source } = ga4;

  // For URL or form-encoded source: show grouped GA4 params
  if ((source === 'url' || source === 'body-form') && params && typeof params === 'object') {
    const groups = groupGa4Params(params);
    return (
      <div className="ga4-payload">

        {groups.map(({ label, data }) => (
          <div key={label} className="ga4-group">
            <div className="ga4-group-label">{label}</div>
            <KVTable data={data} />
          </div>
        ))}
      </div>
    );
  }

  // For JSON body: show events array nicely, rest as grouped JSON
  if (source === 'body-json' && params) {
    return (
      <div className="ga4-payload">
        {payload && payload.length > 0 && (
          <div className="ga4-group">
            <div className="ga4-group-label">Original DL Push Payload</div>
            <KVTable data={payload[0]} />
          </div>
        )}
        {params.measurement_id && (
          <div className="ga4-group">
            <div className="ga4-group-label">Identity</div>
            <KVTable data={{
              measurement_id: params.measurement_id,
              ...(params.client_id ? { client_id: params.client_id } : {}),
              ...(params.user_id ? { user_id: params.user_id } : {}),
            }} />
          </div>
        )}
        {Array.isArray(params.events) && params.events.length > 0 && (
          <div className="ga4-group">
            <div className="ga4-group-label">Events</div>
            {params.events.map((ev, i) => (
              <div key={i} className="ga4-event-block">
                <div className="ga4-event-name">{ev.name || '(unnamed)'}</div>
                {ev.params && <KVTable data={ev.params} />}
              </div>
            ))}
          </div>
        )}
        {params.user_properties && Object.keys(params.user_properties).length > 0 && (
          <div className="ga4-group">
            <div className="ga4-group-label">User Properties</div>
            <KVTable data={params.user_properties} />
          </div>
        )}
      </div>
    );
  }

  // Fallback: raw
  return (
    <div className="ga4-payload">
      <pre className="dl-json">{JSON.stringify(params, null, 2)}</pre>
    </div>
  );
}

function GA4Row({ entry, index }) {
  const [expanded, setExpanded] = useState(false);
  const { dlEvent, req, ga4 } = entry;
  const dlName = getEventName(dlEvent.payload);

  // Extract event name from the GA4 payload itself if available
  const ga4EventName = (() => {
    if (ga4.source === 'url' || ga4.source === 'body-form') {
      return ga4.params?.en || null;
    }
    if (ga4.source === 'body-json' && Array.isArray(ga4.params?.events)) {
      return ga4.params.events.map((e) => e.name).filter(Boolean).join(', ') || null;
    }
    return null;
  })();

  const trackingId = (() => {
    if (!ga4.params) return null;
    const flat = ga4.source === 'url' || ga4.source === 'body-form'
      ? ga4.params
      : { tid: ga4.params?.measurement_id };
    return flat.tid || flat.measurement_id || null;
  })();

  const statusOk = req.status >= 200 && req.status < 300;

  return (
    <div className="ct-row">
      <div className="ct-summary" onClick={() => setExpanded((v) => !v)}>
        <span className="ct-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="ct-index">#{index}</span>
        <span className="ct-time">{formatTime(dlEvent.ts)}</span>

        {/* GA4 event name takes priority over DL event name */}
        <span className="dl-name-custom ct-event-name" title={dlName}>
          {ga4EventName || dlName}
        </span>

        {trackingId && (
          <span className="ga4-tid">{trackingId}</span>
        )}

        <span className={`ct-confirmed-badge ${statusOk ? 'ct-badge-ok' : req.status ? 'ct-badge-err' : 'ct-badge-pending'}`}>
          {statusOk ? '✓' : req.status ? '✗' : '⋯'}
        </span>
      </div>

      {expanded && (
        <div className="ct-detail">
          <div className="ct-section-label">GA4 Payload — {req.method} {req.status ?? '…'}</div>
          <div className="ga4-req-url">{req.url}</div>
          <GA4PayloadDetail req={req} ga4={ga4} payload={dlEvent.payload} />
        </div>
      )}
    </div>
  );
}

export default function GA4Console({ events, requests, onClear }) {
  // Derive GA4 entries: confirmed DL→network matches where the network request
  // is detected as GA4 purely from its payload content (no domain check).
  const ga4Entries = useMemo(() => {
    const out = [];
    const seenReqIds = new Set();  // each network request appears at most once
    const seenDlKeys = new Set();  // each DL event appears at most once

    for (const dlEvent of events) {
      // Deduplicate DL events by timestamp + serialised payload
      const dlKey = `${dlEvent.ts}:${JSON.stringify(dlEvent.payload)}`;
      if (seenDlKeys.has(dlKey)) continue;

      const matches = findMatchingRequests(dlEvent, requests);
      for (const { req } of matches) {
        if (seenReqIds.has(req.id)) continue;
        const ga4 = detectGa4Request(req);
        if (ga4.isGa4) {
          seenDlKeys.add(dlKey);
          seenReqIds.add(req.id);
          out.push({ dlEvent, req, ga4 });
          break; // one entry per DL push (best match already first)
        }
      }
    }
    // Newest first (events are already newest-first)
    return out;
  }, [events, requests]);

  return (
    <div className="datalayer-console">
      <div className="console-toolbar">
        <button className="icon-btn" onClick={onClear} title="Clear">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5" />
          </svg>
        </button>
        <span className="request-count">{ga4Entries.length} GA4 hit{ga4Entries.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="dl-body">
        {ga4Entries.length === 0 ? (
          <div className="empty-state">
            GA4 / GTM hits will appear here when detected by payload signature — works with any endpoint including server-side Tag Gateway.
          </div>
        ) : (
          ga4Entries.map((entry, i) => (
            <GA4Row
              key={`${entry.dlEvent.ts}-${entry.req.id}`}
              entry={entry}
              index={ga4Entries.length - i}
            />
          ))
        )}
      </div>
    </div>
  );
}
