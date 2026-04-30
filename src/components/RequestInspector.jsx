import React, { useState } from 'react';
import { parseQueryParams, parseBody, formatBytes } from '../utils/global-functions';
import KVTable from './KVTable';

const TABS = ['Params', 'Headers', 'Payload', 'Timing'];

function HeadersSection({ title, headers }) {
  if (!headers) return null;
  return (
    <div className="ri-section">
      <div className="ri-section-title">{title}</div>
      <KVTable data={headers} />
    </div>
  );
}

export default function RequestInspector({ request, onClose, tabs: allowedTabs, defaultTab }) {
  const activeTabs = allowedTabs || TABS;
  const [activeTab, setActiveTab] = useState(defaultTab || activeTabs[0]);

  const queryParams = parseQueryParams(request.url);
  const hasQueryParams = queryParams && Object.keys(queryParams).length > 0;
  const body = parseBody(request.postData);
  const hasPayload = !!body;

  return (
    <div className="ri-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ri-panel">
        {/* Header */}
        <div className="ri-header">
          <div className="ri-title-row">
            <span className={`ri-method ri-method-${(request.method || 'GET').toLowerCase()}`}>
              {request.method || 'GET'}
            </span>
            <span className={`ri-status ${request.status >= 200 && request.status < 300 ? 'ri-status-ok' : request.status ? 'ri-status-err' : 'ri-status-pending'}`}>
              {request.status
                ? `${request.status} ${request.statusText ?? ''}`
                : request.state === 'pending'
                ? 'Pending…'
                : request.state}
            </span>
            <span className="ri-duration">
              {request.duration != null ? `${request.duration} ms` : ''}
            </span>
            <button className="ri-close" onClick={onClose} title="Close">✕</button>
          </div>
          <div className="ri-url" title={request.url}>{request.url}</div>

          <div className="ri-tabs">
            {activeTabs.map((tab) => {
              if (tab === 'Payload' && !hasPayload) return null;
              return (
                <button
                  key={tab}
                  className={`ri-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="ri-body">
          { body && body.value && (
          <div className="ri-section">
            <div className="ri-section-title">GTM Return Values</div>
            <KVTable data={body.value} />
          </div>)}
          {activeTab === 'Params' && (
            <>
              {hasQueryParams ? (
                <div className="ri-section">
                  <div className="ri-section-title">Query Parameters</div>
                  <KVTable data={queryParams} />
                </div>
              ) : (
                <div className="ri-empty-state">No query parameters</div>
              )}
            </>
          )}

          {activeTab === 'Headers' && (
            <>
              <div className="ri-section">
                <div className="ri-section-title">General</div>
                <KVTable data={{
                  'Request URL': request.url,
                  'Request Method': request.method || 'GET',
                  'Status Code': request.status ? `${request.status} ${request.statusText ?? ''}` : '—',
                  'Resource Type': request.type || '—',
                  ...(request.mimeType ? { 'MIME Type': request.mimeType } : {}),
                  ...(request.size != null ? { 'Transfer Size': formatBytes(request.size) } : {}),
                }} />
              </div>
              <HeadersSection title="Response Headers" headers={request.responseHeaders} />
              <HeadersSection title="Request Headers" headers={request.requestHeaders} />
            </>
          )}

          {activeTab === 'Payload' && body && (
            <div className="ri-section">
              {body.kind === 'json' && (
                <>
                  <div className="ri-section-title">Request Body (JSON)</div>
                  <pre className="ri-json">{JSON.stringify(body.value, null, 2)}</pre>
                </>
              )}
              {body.kind === 'form' && (
                <>
                  <div className="ri-section-title">Form Data</div>
                  <KVTable data={body.value} />
                </>
              )}
              {body.kind === 'raw' && (
                <>
                  <div className="ri-section-title">Raw Payload</div>
                  <pre className="ri-json">{body.value}</pre>
                </>
              )}
            </div>
          )}

          {activeTab === 'Timing' && (
            <div className="ri-section">
              <div className="ri-section-title">Timing</div>
              <KVTable data={{
                'Started At': request.wallTime
                  ? new Date(request.wallTime).toLocaleTimeString(undefined, {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      fractionalSecondDigits: 3,
                    })
                  : '—',
                'Duration': request.duration != null ? `${request.duration} ms` : request.state === 'pending' ? 'In progress…' : '—',
                'State': request.state || '—',
                ...(request.errorText ? { 'Error': request.errorText } : {}),
              }} />

              {request.duration != null && (
                <div className="ri-timing-bar-wrap">
                  <div className="ri-timing-bar" style={{ width: `${Math.min(100, (request.duration / 5000) * 100)}%` }} />
                  <span className="ri-timing-label">{request.duration} ms</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
