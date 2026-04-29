import React, { useState, useMemo } from 'react';
import { findMatchingRequests, getEventName } from '../utils/matching';
import RequestInspector from './RequestInspector';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function StatusBadge({ req }) {
  if (!req.status) {
    return <span className="ct-status ct-status-pending">{req.state === 'pending' ? '…' : req.state}</span>;
  }
  const ok = req.status >= 200 && req.status < 300;
  return (
    <span className={`ct-status ${ok ? 'ct-status-ok' : 'ct-status-err'}`}>
      {req.status}
    </span>
  );
}

function ConfirmedRow({ entry, index }) {
  const [expanded, setExpanded] = useState(false);
  const [inspecting, setInspecting] = useState(null);

  const { dlEvent, matches } = entry;
  const name = getEventName(dlEvent.payload);
  const isGtmInternal = name === 'gtm.init' || name?.startsWith('gtm.');
  const bestReq = matches[0].req;
  const bestOk = bestReq.status >= 200 && bestReq.status < 300;

  return (
    <div className="ct-row">
      {/* Summary row */}
      <div className="ct-summary" onClick={() => setExpanded((v) => !v)}>
        <span className="ct-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="ct-index">#{index}</span>
        <span className="ct-time">{formatTime(dlEvent.ts)}</span>

        {/* DL event name */}
        <span className={`ct-event-name ${isGtmInternal ? 'dl-name-gtm' : 'dl-name-custom'}`}>
          {name}
        </span>

        <span className="ct-arrow">→</span>

        {/* Best matched request summary */}
        <span className={`ct-method dl-method-${(bestReq.method || 'GET').toLowerCase()}`}>
          {bestReq.method || 'GET'}
        </span>
        <StatusBadge req={bestReq} />
        <span className="ct-req-url" title={bestReq.url}>{bestReq.url}</span>

        {matches.length > 1 && (
          <span className="ct-extra-count" title={`${matches.length - 1} more matched request${matches.length - 1 !== 1 ? 's' : ''}`}>
            +{matches.length - 1}
          </span>
        )}

        <span className={`ct-confirmed-badge ${bestOk ? 'ct-badge-ok' : bestReq.status ? 'ct-badge-err' : 'ct-badge-pending'}`}>
          {bestOk ? '✓' : bestReq.status ? '✗' : '⋯'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="ct-detail">
          {/* DL payload */}
          <div className="ct-section-label">DataLayer Push</div>
          <div className="ct-dl-source">{getDomain(dlEvent.url)}</div>
          {dlEvent.payload.map((item, i) => (
            <pre key={i} className="dl-json">{JSON.stringify(item, null, 2)}</pre>
          ))}

          {/* Matched requests */}
          <div className="ct-section-label" style={{ marginTop: 10 }}>
            Matched Network Request{matches.length > 1 ? 's' : ''}
          </div>
          <div className="dl-matched-requests" style={{ margin: 0 }}>
            {matches.map(({ req, hitCount }) => {
              const ok = req.status >= 200 && req.status < 300;
              return (
                <div
                  key={req.id}
                  className="dl-matched-req dl-matched-req-clickable"
                  onClick={() => setInspecting(req)}
                  title="Click to inspect"
                >
                  <span className={`dl-matched-method dl-method-${(req.method || 'GET').toLowerCase()}`}>
                    {req.method || 'GET'}
                  </span>
                  <span className={`dl-matched-status ${ok ? 'dl-status-ok' : req.status ? 'dl-status-err' : 'dl-status-pending'}`}>
                    {req.status || (req.state === 'pending' ? '…' : req.state)}
                  </span>
                  <span className="dl-matched-url" title={req.url}>{req.url}</span>
                  <span className="dl-matched-hits" title={`${hitCount} matching values`}>{hitCount}↑</span>
                  <span className="dl-inspect-icon">›</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {inspecting && <RequestInspector request={inspecting} onClose={() => setInspecting(null)} tabs={['Payload']} defaultTab="Payload" />}
    </div>
  );
}

export default function ConfirmedTrackingConsole({ events, requests, onClear }) {
  // Derive confirmed entries: DL events that have ≥1 matched network request
  const confirmed = useMemo(() => {
    return events
      .map((dlEvent) => ({ dlEvent, matches: findMatchingRequests(dlEvent, requests) }))
      .filter(({ matches }) => matches.length > 0);
  }, [events, requests]);

  return (
    <div className="datalayer-console">
      <div className="console-toolbar">
        <button className="icon-btn" onClick={onClear} title="Clear">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5" />
          </svg>
        </button>
        <span className="request-count">{confirmed.length} confirmed</span>
      </div>

      <div className="dl-body">
        {confirmed.length === 0 ? (
          <div className="empty-state">
            Confirmed tracking hits will appear here when dataLayer pushes are matched to network requests.
          </div>
        ) : (
          confirmed.map((entry, i) => (
            <ConfirmedRow
              key={`${entry.dlEvent.ts}-${i}`}
              entry={entry}
              index={confirmed.length - i}
            />
          ))
        )}
      </div>
    </div>
  );
}
