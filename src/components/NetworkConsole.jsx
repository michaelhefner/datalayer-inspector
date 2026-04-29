import React, { useState, useMemo, useRef } from 'react';
import RequestDetail from './RequestDetail';

const FILTERS = ['All', 'XHR', 'JS', 'CSS', 'Img', 'Media', 'Font', 'Doc', 'WS', 'Other'];

const TYPE_BUCKETS = {
  XHR: ['XHR', 'Fetch'],
  JS: ['Script'],
  CSS: ['Stylesheet'],
  Img: ['Image'],
  Media: ['Media'],
  Font: ['Font'],
  Doc: ['Document'],
  WS: ['WebSocket'],
  Other: ['Other', 'TextTrack', 'EventSource', 'Manifest', 'Ping', 'Preflight'],
};

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function statusClass(status, state) {
  if (state === 'failed' || state === 'canceled') return 'status-error';
  if (!status) return 'status-pending';
  if (status >= 200 && status < 300) return 'status-2xx';
  if (status >= 300 && status < 400) return 'status-3xx';
  if (status >= 400) return 'status-4xx';
  return '';
}

function displayName(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : u.hostname;
  } catch {
    return url;
  }
}

export default function NetworkConsole({ requests, selectedRequestId, onSelectRequest, onClear }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const tableBodyRef = useRef(null);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return requests.filter((req) => {
      if (activeFilter !== 'All') {
        const allowed = TYPE_BUCKETS[activeFilter] ?? [];
        if (!allowed.includes(req.type)) return false;
      }
      if (q && !req.url.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, activeFilter, searchQuery]);

  const selectedRequest = selectedRequestId
    ? requests.find((r) => r.id === selectedRequestId)
    : null;

  return (
    <div className="network-console">
      {/* ── Toolbar ── */}
      <div className="console-toolbar">
        <button className="icon-btn clear-btn" onClick={onClear} title="Clear log">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5" />
          </svg>
        </button>

        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-tab ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <input
          className="search-input"
          type="text"
          placeholder="Filter by URL…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <span className="request-count">
          {filteredRequests.length} / {requests.length} requests
        </span>
      </div>

      {/* ── Main content: table + optional detail ── */}
      <div className="console-content">
        <div className={`requests-panel ${selectedRequest ? 'with-detail' : ''}`}>
          {/* Table header */}
          <div className="table-header">
            <div className="col col-index">#</div>
            <div className="col col-method">Method</div>
            <div className="col col-status">Status</div>
            <div className="col col-type">Type</div>
            <div className="col col-url">Name</div>
            <div className="col col-size">Size</div>
            <div className="col col-time">Time</div>
          </div>

          {/* Table body */}
          <div
            className="table-body"
            ref={tableBodyRef}
          >
            {filteredRequests.length === 0 ? (
              <div className="empty-state">
                {requests.length === 0
                  ? 'Navigate to a URL to start recording network requests.'
                  : 'No requests match the current filter.'}
              </div>
            ) : (
              filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className={`table-row
                    ${req.state === 'failed' || req.state === 'canceled' ? 'row-error' : ''}
                    ${selectedRequestId === req.id ? 'row-selected' : ''}
                  `}
                  onClick={() => onSelectRequest(selectedRequestId === req.id ? null : req.id)}
                  title={req.url}
                >
                  <div className="col col-index">{req.index}</div>
                  <div className={`col col-method method-${req.method.toLowerCase()}`}>
                    {req.method}
                  </div>
                  <div className={`col col-status ${statusClass(req.status, req.state)}`}>
                    {req.state === 'failed' || req.state === 'canceled' ? (
                      <span className="badge-error">{req.state}</span>
                    ) : req.status ? (
                      req.status
                    ) : (
                      <span className="badge-pending">…</span>
                    )}
                  </div>
                  <div className="col col-type">{req.type}</div>
                  <div className="col col-url">
                    <span className="name-text">{displayName(req.url)}</span>
                    <span className="domain-text">{req.domain}</span>
                  </div>
                  <div className="col col-size">{formatSize(req.size)}</div>
                  <div className="col col-time">{formatTime(req.duration)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {selectedRequest && (
          <RequestDetail request={selectedRequest} onClose={() => onSelectRequest(null)} />
        )}
      </div>
    </div>
  );
}
