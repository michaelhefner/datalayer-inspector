import React, { useEffect, useRef, useState } from 'react';

export default function BrowserPanel({ webviewRef, onUrlChange, onCanGoBackChange, onCanGoForwardChange }) {
  const localRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const wv = localRef.current;
    if (!wv) return;

    webviewRef.current = wv;

    const updateNavState = () => {
      onCanGoBackChange(wv.canGoBack());
      onCanGoForwardChange(wv.canGoForward());
    };

    const onDomReady = () => {
      onUrlChange(wv.getURL());
      updateNavState();
    };

    const onDidNavigate = (e) => {
      onUrlChange(e.url || wv.getURL());
      updateNavState();
    };

    const onDidNavigateInPage = (e) => {
      if (e.isMainFrame) {
        onUrlChange(e.url || wv.getURL());
        updateNavState();
      }
    };

    const onStartLoading = () => setIsLoading(true);
    const onStopLoading = () => setIsLoading(false);

    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-navigate', onDidNavigate);
    wv.addEventListener('did-navigate-in-page', onDidNavigateInPage);
    wv.addEventListener('did-start-loading', onStartLoading);
    wv.addEventListener('did-stop-loading', onStopLoading);

    return () => {
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-navigate', onDidNavigate);
      wv.removeEventListener('did-navigate-in-page', onDidNavigateInPage);
      wv.removeEventListener('did-start-loading', onStartLoading);
      wv.removeEventListener('did-stop-loading', onStopLoading);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="browser-panel">
      {isLoading && <div className="loading-bar" />}
      <webview
        ref={localRef}
        src="about:blank"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}

