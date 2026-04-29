import React, { useState } from 'react';

const TABS = ['Headers', 'Timing'];

function HeadersSection({ title, headers }) {
  if (!headers) return null;
  const entries = Object.entries(headers);
  return (
    <div className="section-group">
      <div className="section-title">{title}</div>
      {entries.length === 0 ? (
        <div className="section-empty">No headers</div>
      ) : (
        entries.map(([name, value]) => (
          <div key={name} className="header-row">
            <span className="header-name">{name}:</span>
            <span className="header-value">{value}</span>
          </div>
        ))
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function RequestDetail({ request, onClose }) {
  const [activeTab, setActiveTab] = useState('Headers');

  return (
    <div className="request-detail">
      <div className="detail-header">
        <div className="detail-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <button className="close-detail-btn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'Headers' && (
          <div className="detail-sections">
            {/* General */}
            <div className="section-group">
              <div className="section-title">General</div>
              <div className="header-row">
                <span className="header-name">Request URL:</span>
                <span className="header-value url-wrap">{request.url}</span>
              </div>
              <div className="header-row">
                <span className="header-name">Request Method:</span>
                <span className={`header-value method-${request.method.toLowerCase()}`}>
                  {request.method}
                </span>
              </div>
              <div className="header-row">
                <span className="header-name">Status Code:</span>
                <span className="header-value">
                  {request.status
                    ? `${request.status} ${request.statusText ?? ''}`
                    : request.state === 'failed'
                    ? `Failed — ${request.errorText}`
                    : request.state === 'canceled'
                    ? 'Canceled'
                    : 'Pending…'}
                </span>
              </div>
              <div className="header-row">
                <span className="header-name">Resource Type:</span>
                <span className="header-value">{request.type}</span>
              </div>
              {request.mimeType && (
                <div className="header-row">
                  <span className="header-name">MIME Type:</span>
                  <span className="header-value">{request.mimeType}</span>
                </div>
              )}
              {request.size != null && (
                <div className="header-row">
                  <span className="header-name">Transfer Size:</span>
                  <span className="header-value">{formatBytes(request.size)}</span>
                </div>
              )}
            </div>

            <HeadersSection title="Response Headers" headers={request.responseHeaders} />
            <HeadersSection title="Request Headers" headers={request.requestHeaders} />
          </div>
        )}

        {activeTab === 'Timing' && (
          <div className="detail-sections">
            <div className="section-group">
              <div className="section-title">Timing</div>
              <div className="header-row">
                <span className="header-name">Started At:</span>
                <span className="header-value">
                  {request.startTime
                    ? new Date(request.startTime * 1000).toLocaleTimeString(undefined, {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3,
                      })
                    : '—'}
                </span>
              </div>
              <div className="header-row">
                <span className="header-name">Duration:</span>
                <span className="header-value">
                  {request.duration != null
                    ? `${request.duration} ms`
                    : request.state === 'pending'
                    ? 'In progress…'
                    : '—'}
                </span>
              </div>
              <div className="header-row">
                <span className="header-name">State:</span>
                <span className="header-value">{request.state}</span>
              </div>
              {request.errorText && (
                <div className="header-row">
                  <span className="header-name">Error:</span>
                  <span className="header-value status-error">{request.errorText}</span>
                </div>
              )}
            </div>

            {/* Simple visual timing bar */}
            {request.duration != null && (
              <div className="section-group">
                <div className="section-title">Waterfall</div>
                <div className="timing-bar-container">
                  <div
                    className="timing-bar"
                    style={{ width: `${Math.min(100, (request.duration / 5000) * 100)}%` }}
                  />
                  <span className="timing-label">{request.duration} ms</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
