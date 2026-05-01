import React, { useState } from 'react';
import RequestInspector from './RequestInspector';
import { findMatchingRequests, getEventName } from '../utils/matching';
import { formatTime, parseBody } from '../utils/global-functions';
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

function onlyEPKeys(obj) {
  if (obj === null || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  return keys.length > 0 && keys.filter(k => ['ep'].includes(k)).length > 0;  
}

function EventRow({ event, index, requests }) {
  const [expanded, setExpanded] = useState(false);
  const [inspecting, setInspecting] = useState(null); // req being inspected
  const name = getEventName(event.payload);
  const isGtmInternal = name === 'gtm.init' || name?.startsWith('gtm.');
  const matches = findMatchingRequests(event, requests);
  const matchTag = getMatchTag(matches);
  const matchesWithBodies = matches.filter(m => m.req.postData);
  const matchesWithParams = matches.filter(m => m.req.url && m.req.url.includes('?'));
  const bodyMatches = matchesWithBodies.length > 0
    ? matchesWithBodies.map(m => ({ body: parseBody(m.req.postData) }))
    : matchesWithParams.length > 0
      ? matchesWithParams.map(m => ({ body: onlyEPKeys(parseBody(m.req.url)) ? parseBody(m.req.url) : parseBody(m.req.url) }))
      : [];
  return (
    <div className={`dl-row ${isGtmInternal ? 'dl-row-gtm' : ''}`}>
      <div className="dl-summary" onClick={() => setExpanded((v) => !v)}>
        <span className="dl-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="dl-index">#{index}</span>
        <span className="dl-time">{formatTime(event.ts)}</span>
        <span className={`dl-event-name ${isGtmInternal ? 'dl-name-gtm' : 'dl-name-custom'}`}>
          {name}
        </span>
        {isGtmInternal && <span className="dl-tag-gtm">GTM</span>}
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

function UrlGroup({ url, events, requests, globalOffset }) {
  const [collapsed, setCollapsed] = useState(false);
  let displayUrl;
  try {
    const u = new URL(url);
    displayUrl = u.pathname + u.search + u.hash || u.href;
  } catch {
    displayUrl = url;
  }
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }
  return (
    <div className="dl-url-group">
      <div className="dl-url-group-header" onClick={() => setCollapsed((v) => !v)}>
        <span className="dl-toggle">{collapsed ? '▸' : '▾'}</span>
        <span className="dl-url-group-host">{hostname}</span>
        <span className="dl-url-group-path" title={url}>{displayUrl}</span>
        <span className="dl-url-group-count">{events.length}</span>
      </div>
      {!collapsed && events.map((event, i) => (
        <EventRow
          key={`${event.ts}-${i}`}
          event={event}
          index={globalOffset + events.length - i}
          requests={requests}
        />
      ))}
    </div>
  );
}

function isGtmInternalEvent(e) {
  const name = getEventName(e.payload);
  return name === 'gtm.init' || name?.startsWith('gtm.');
}

export default function DataLayerConsole({ events, requests, onClear }) {
  const [onlyWithEvent, setOnlyWithEvent] = useState(true);
  const [hideGtm, setHideGtm] = useState(false);

  const visibleEvents = events.filter((e) => {
    if (onlyWithEvent && !(Array.isArray(e.payload) && e.payload.length > 0 && e.payload[0]?.event)) return false;
    if (hideGtm && isGtmInternalEvent(e)) return false;
    return true;
  });

  // Group events by URL, preserving insertion order of first appearance
  const groups = [];
  const urlIndex = new Map();
  for (const event of visibleEvents) {
    const key = event.url;
    if (!urlIndex.has(key)) {
      urlIndex.set(key, groups.length);
      groups.push({ url: key, events: [] });
    }
    groups[urlIndex.get(key)].events.push(event);
  }

  // Compute per-group offsets so event indices remain globally consistent
  const offsets = [];
  let running = 0;
  for (const g of groups) {
    offsets.push(running);
    running += g.events.length;
  }

  const filteredCount = events.length - visibleEvents.length;

  return (
    <div className="datalayer-console">
      <div className="console-toolbar">
        <button className="icon-btn" onClick={onClear} title="Clear log">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5" />
          </svg>
        </button>
        <span className="request-count">{visibleEvents.length} push{visibleEvents.length !== 1 ? 'es' : ''}{filteredCount > 0 ? ` (${filteredCount} hidden)` : ''}</span>
        <button
          className={`icon-btn dl-filter-btn${onlyWithEvent ? ' dl-filter-btn-active' : ''}`}
          onClick={() => setOnlyWithEvent((v) => !v)}
          title={onlyWithEvent ? 'Showing only pushes with "event" — click to show all' : 'Filter: only show pushes with "event" attribute'}
        >
          event
        </button>
        <button
          className={`icon-btn dl-filter-btn${hideGtm ? ' dl-filter-btn-active' : ''}`}
          onClick={() => setHideGtm((v) => !v)}
          title={hideGtm ? 'GTM internal events hidden — click to show' : 'Hide GTM internal events'}
        >
          hide GTM
        </button>
      </div>

      <div className="dl-body">
        {events.length === 0 ? (
          <div className="empty-state">
            Navigate to a page with GTM or a custom dataLayer implementation to see pushes.
          </div>
        ) : (
          groups.map((group, gi) => (
            <UrlGroup
              key={group.url}
              url={group.url}
              events={group.events}
              requests={requests}
              globalOffset={offsets[gi]}
            />
          ))
        )}
      </div>
    </div>
  );
}
