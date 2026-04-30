import React, { useState } from 'react';
import RequestInspector from './RequestInspector';
import { findMatchingRequests, getEventName } from '../utils/matching';
import { parseBody } from '../utils/global-functions';
import KVTable from './KVTable';

function getMatchTag(matches) {
  if (matches.length === 0) return null;
  const { req } = matches[0];
  const status = req.status;
  if (req.state === 'pending' || (!status && req.state !== 'failed' && req.state !== 'canceled')) {
    return { kind: 'pending', label: '⋯ matched' };
  }
  const isSuccess = status >= 200 && status < 300;
  return {
    kind: isSuccess ? 'success' : 'failed',
    label: isSuccess ? `✓ ${status}` : `✗ ${status || req.state}`,
  };
}

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
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function EventRow({ event, index, requests }) {
  const [expanded, setExpanded] = useState(false);
  const [inspecting, setInspecting] = useState(null); // req being inspected
  const name = getEventName(event.payload);
  const isGtmInternal = name === 'gtm.init' || name?.startsWith('gtm.');
  const matches = findMatchingRequests(event, requests);
  const matchTag = getMatchTag(matches);
  const matchesWithBodies = matches.filter(m => m.req.postData);
  const bodyMatches = matchesWithBodies ? matchesWithBodies.map(m => ({ body: parseBody(m.req.postData) })) : [];
  return (
    <div className={`dl-row ${isGtmInternal ? 'dl-row-gtm' : ''}`}>
      <div className="dl-summary" onClick={() => setExpanded((v) => !v)}>
        <span className="dl-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="dl-index">#{index}</span>
        <span className="dl-time">{formatTime(event.ts)}</span>
        <span className={`dl-event-name ${isGtmInternal ? 'dl-name-gtm' : 'dl-name-custom'}`}>
          {name}
        </span>
        <span className="dl-domain">{getDomain(event.url)}</span>
        {matchTag && (
          <span className={`dl-match-tag dl-match-${matchTag.kind}`}>
            {matchTag.label}
          </span>
        )}
      </div>

      {expanded && (
        <div className="dl-detail">
          <div className="dl-detail-url">{event.url}</div>
          {event.payload.map((item, i) => (
            <pre key={i} className="dl-json">
              {JSON.stringify(item, null, 2)}
            </pre>
          ))}
          {bodyMatches.length > 0 && (
            <div className="dl-matched-bodies">
              <div className="dl-matched-label">Transmitted Values</div>
              {bodyMatches.map((m, i) => (
                <KVTable key={i} data={m.body.value} />
              ))}
            </div>
          )}

          {matches.length > 0 && (
            <div className="dl-matched-requests">
              <div className="dl-matched-label">Matched network request{matches.length > 1 ? 's' : ''}</div>
              {matches.map(({ req, hitCount }) => {
                const statusOk = req.status >= 200 && req.status < 300;
                return (
                  <>
                  <div
                    key={req.id}
                    className="dl-matched-req dl-matched-req-clickable"
                    onClick={() => setInspecting(req)}
                    title="Click to inspect this request"
                  >
                    <span className={`dl-matched-method dl-method-${(req.method || 'GET').toLowerCase()}`}>
                      {req.method || 'GET'}
                    </span>
                    <span className={`dl-matched-status ${statusOk ? 'dl-status-ok' : req.status ? 'dl-status-err' : 'dl-status-pending'}`}>
                      {req.status || (req.state === 'pending' ? '…' : req.state)}
                    </span>
                    <span className="dl-matched-url" title={req.url}>{req.url}</span>
                    <span className="dl-matched-hits" title={`${hitCount} matching value${hitCount !== 1 ? 's' : ''} found`}>
                      {hitCount}↑
                    </span>
                    <span className="dl-inspect-icon">›</span>
                  </div>
                  </>
                );
              })}
            </div>
          )}
        </div>
      )}
      {inspecting && (
        <RequestInspector request={inspecting} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}

export default function DataLayerConsole({ events, requests, onClear }) {
  return (
    <div className="datalayer-console">
      <div className="console-toolbar">
        <button className="icon-btn" onClick={onClear} title="Clear log">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5" />
          </svg>
        </button>
        <span className="request-count">{events.length} push{events.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="dl-body">
        {events.length === 0 ? (
          <div className="empty-state">
            Navigate to a page with GTM or a custom dataLayer implementation to see pushes.
          </div>
        ) : (
          events.map((event, i) => (
            <EventRow key={`${event.ts}-${i}`} event={event} index={events.length - i} requests={requests} />
          ))
        )}
      </div>
    </div>
  );
}
