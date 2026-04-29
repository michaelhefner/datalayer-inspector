import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Toolbar from './components/Toolbar';
import BrowserPanel from './components/BrowserPanel';
import NetworkConsole from './components/NetworkConsole';
import DataLayerConsole from './components/DataLayerConsole';
import ConfirmedTrackingConsole from './components/ConfirmedTrackingConsole';
import GA4Console from './components/GA4Console';
import { findMatchingRequests } from './utils/matching';
import { detectGa4Request } from './utils/ga4';
import './App.css';

function parseUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return { domain: u.hostname, path: u.pathname + u.search };
  } catch {
    return { domain: rawUrl, path: '' };
  }
}

function guessTypeFromMime(mimeType) {
  if (!mimeType) return 'Other';
  if (mimeType.includes('javascript') || mimeType.includes('ecmascript')) return 'Script';
  if (mimeType.includes('css')) return 'Stylesheet';
  if (mimeType.includes('html')) return 'Document';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('font/') || mimeType.includes('woff') || mimeType.includes('ttf')) return 'Font';
  if (mimeType.includes('json') || mimeType.includes('xml')) return 'XHR';
  return 'Other';
}

export default function App() {
  const webviewRef = useRef(null);

  // Browser navigation state
  const [currentUrl, setCurrentUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Network request storage
  const requestMapRef = useRef({});
  const requestOrderRef = useRef([]);
  const requestCountRef = useRef(0);
  const [requestVersion, setRequestVersion] = useState(0);

  const requests = useMemo(
    () => [...requestOrderRef.current].reverse().map((id) => requestMapRef.current[id]).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestVersion]
  );

  const [selectedRequestId, setSelectedRequestId] = useState(null);

  // DataLayer events
  const [dataLayerEvents, setDataLayerEvents] = useState([]);
  const handleClearDataLayer = useCallback(() => setDataLayerEvents([]), []);
  const handleClearAll = useCallback(() => {
    setDataLayerEvents([]);
    requestMapRef.current = {};
    requestOrderRef.current = [];
    requestCountRef.current = 0;
    setSelectedRequestId(null);
    setRequestVersion((v) => v + 1);
  }, []);

  // Confirmed tracking count (DL events with ≥1 matched request) for badge
  const confirmedCount = useMemo(
    () => dataLayerEvents.filter((ev) => findMatchingRequests(ev, requests).length > 0).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataLayerEvents, requests]
  );

  // GA4 hit count for badge
  const ga4Count = useMemo(() => {
    let count = 0;
    for (const dlEvent of dataLayerEvents) {
      const matches = findMatchingRequests(dlEvent, requests);
      if (matches.some(({ req }) => detectGa4Request(req).isGa4)) count++;
    }
    return count;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLayerEvents, requests]);

  // Right panel tab
  const [activeTab, setActiveTab] = useState('network');

  // Resizable console panel
  const [consoleWidth, setConsoleWidth] = useState(480);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  // ── Network event subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onNetworkEvent(({ method, params }) => {
      if (method === 'Network.requestWillBeSent') {
        const { requestId, request, timestamp, type } = params;
        // Avoid duplicate entries for the same requestId (e.g. redirect chains
        // emit a new requestWillBeSent with the same id).
        if (requestMapRef.current[requestId]) {
          requestMapRef.current[requestId] = {
            ...requestMapRef.current[requestId],
            url: request.url,
            ...parseUrl(request.url),
            requestHeaders: request.headers,
            postData: request.postData || null,
            wallTime: Date.now(),
            startTime: timestamp,
            status: null,
            statusText: null,
            mimeType: null,
            responseHeaders: null,
            endTime: null,
            duration: null,
            size: null,
            state: 'pending',
            errorText: null,
          };
        } else {
          const { domain, path } = parseUrl(request.url);
          requestMapRef.current[requestId] = {
            id: requestId,
            index: ++requestCountRef.current,
            method: request.method,
            url: request.url,
            domain,
            path,
            status: null,
            statusText: null,
            type: type || 'Other',
            mimeType: null,
            requestHeaders: request.headers,
            postData: request.postData || null,
            responseHeaders: null,
            startTime: timestamp,
            wallTime: Date.now(),
            endTime: null,
            duration: null,
            size: null,
            state: 'pending',
            errorText: null,
          };
          requestOrderRef.current.push(requestId);
        }
        setRequestVersion((v) => v + 1);
      } else if (method === 'Network.responseReceived') {
        const { requestId, response } = params;
        const req = requestMapRef.current[requestId];
        if (req) {
          requestMapRef.current[requestId] = {
            ...req,
            status: response.status,
            statusText: response.statusText,
            mimeType: response.mimeType,
            responseHeaders: response.headers,
            type:
              req.type === 'Other' || req.type === 'other'
                ? guessTypeFromMime(response.mimeType)
                : req.type,
          };
          setRequestVersion((v) => v + 1);
        }
      } else if (method === 'Network.loadingFinished') {
        const { requestId, timestamp, encodedDataLength } = params;
        const req = requestMapRef.current[requestId];
        if (req) {
          requestMapRef.current[requestId] = {
            ...req,
            endTime: timestamp,
            duration: Math.round((timestamp - req.startTime) * 1000),
            size: encodedDataLength,
            state: 'complete',
          };
          setRequestVersion((v) => v + 1);
        }
      } else if (method === 'Network.loadingFailed') {
        const { requestId, timestamp, errorText, canceled } = params;
        const req = requestMapRef.current[requestId];
        if (req) {
          // If a valid HTTP response was already received (status is set), this
          // loadingFailed is a spurious Chromium event (e.g. 204 No Content has
          // no body so loading "fails"). Treat it as complete instead.
          if (req.status) {
            requestMapRef.current[requestId] = {
              ...req,
              endTime: timestamp,
              duration: Math.round((timestamp - req.startTime) * 1000),
              state: 'complete',
            };
          } else {
            requestMapRef.current[requestId] = {
              ...req,
              endTime: timestamp,
              duration: Math.round((timestamp - req.startTime) * 1000),
              state: canceled ? 'canceled' : 'failed',
              errorText: errorText || 'Unknown error',
            };
          }
          setRequestVersion((v) => v + 1);
        }
      }
    });

    return unsubscribe;
  }, []);

  // ── DataLayer event subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onDataLayerEvent) return;
    const unsubscribe = window.electronAPI.onDataLayerEvent((event) => {
      setDataLayerEvents((prev) => [event, ...prev]);
      window.electronAPI.exportEventToCsv?.(event);
    });
    return unsubscribe;
  }, []);

  // ── Navigation handlers ───────────────────────────────────────────────────
  const handleNavigate = useCallback((url) => {
    const wv = webviewRef.current;
    if (!wv) return;
    const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    wv.loadURL(fullUrl);
  }, []);

  const handleBack = useCallback(() => webviewRef.current?.goBack(), []);
  const handleForward = useCallback(() => webviewRef.current?.goForward(), []);
  const handleReload = useCallback(() => webviewRef.current?.reload(), []);

  const handleClearRequests = useCallback(() => {
    requestMapRef.current = {};
    requestOrderRef.current = [];
    requestCountRef.current = 0;
    setSelectedRequestId(null);
    setRequestVersion((v) => v + 1);
  }, []);

  // ── Divider resize ────────────────────────────────────────────────────────
  const handleDividerMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      isResizingRef.current = true;
      resizeStartXRef.current = e.clientX;
      resizeStartWidthRef.current = consoleWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    },
    [consoleWidth]
  );

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartXRef.current - e.clientX;
      const next = Math.max(240, Math.min(resizeStartWidthRef.current + delta, window.innerWidth - 300));
      setConsoleWidth(next);
    };

    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar
        currentUrl={currentUrl}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
      />
      <div className="content">
        <BrowserPanel
          webviewRef={webviewRef}
          onUrlChange={setCurrentUrl}
          onCanGoBackChange={setCanGoBack}
          onCanGoForwardChange={setCanGoForward}
        />
        <div className="divider" onMouseDown={handleDividerMouseDown} />
        <div className="right-panel" style={{ width: consoleWidth }}>
          <div className="panel-tabs">
            <button
              className={`panel-tab ${activeTab === 'network' ? 'active' : ''}`}
              onClick={() => setActiveTab('network')}
            >
              Network
            </button>
            <button
              className={`panel-tab ${activeTab === 'datalayer' ? 'active' : ''}`}
              onClick={() => setActiveTab('datalayer')}
            >
              DataLayer
              {dataLayerEvents.length > 0 && (
                <span className="tab-badge">{dataLayerEvents.length}</span>
              )}
            </button>
            {/* <button
              className={`panel-tab ${activeTab === 'confirmed' ? 'active' : ''}`}
              onClick={() => setActiveTab('confirmed')}
            >
              Confirmed
              {confirmedCount > 0 && (
                <span className="tab-badge tab-badge-confirmed">{confirmedCount}</span>
              )}
            </button>
            <button
              className={`panel-tab ${activeTab === 'ga4' ? 'active' : ''}`}
              onClick={() => setActiveTab('ga4')}
            >
              GA4
              {ga4Count > 0 && (
                <span className="tab-badge tab-badge-ga4">{ga4Count}</span>
              )}
            </button> */}
          </div>
          {activeTab === 'network' ? (
            <NetworkConsole
              requests={requests}
              selectedRequestId={selectedRequestId}
              onSelectRequest={setSelectedRequestId}
              onClear={handleClearRequests}
            />
          ) : activeTab === 'datalayer' ? (
            <DataLayerConsole
              events={dataLayerEvents}
              requests={requests}
              onClear={handleClearDataLayer}
            />
          ) : activeTab === 'confirmed' ? (
            <ConfirmedTrackingConsole
              events={dataLayerEvents}
              requests={requests}
              onClear={handleClearAll}
            />
          ) : (
            <GA4Console
              events={dataLayerEvents}
              requests={requests}
              onClear={handleClearAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
