import React, { useState, useEffect } from 'react';

export default function Toolbar({
  currentUrl,
  canGoBack,
  canGoForward,
  onNavigate,
  onBack,
  onForward,
  onReload,
}) {
  const [urlInput, setUrlInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Keep the URL bar in sync with browser navigation when not being edited
  useEffect(() => {
    if (!isFocused) setUrlInput(currentUrl);
  }, [currentUrl, isFocused]);

  const handleFocus = (e) => {
    setIsFocused(true);
    e.target.select();
  };

  const handleBlur = () => setIsFocused(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onNavigate(urlInput);
      e.target.blur();
    }
    if (e.key === 'Escape') {
      setUrlInput(currentUrl);
      e.target.blur();
    }
  };

  return (
    <div className="toolbar">
      <button className="nav-btn" onClick={onBack} disabled={!canGoBack} title="Go back (Alt+←)">
        ←
      </button>
      <button className="nav-btn" onClick={onForward} disabled={!canGoForward} title="Go forward (Alt+→)">
        →
      </button>
      <button className="nav-btn" onClick={onReload} title="Reload (F5)">
        ↺
      </button>
      <div className="url-bar-container">
        <input
          className="url-bar"
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Enter a URL and press Enter…"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
      <button className="go-btn" onClick={() => onNavigate(urlInput)} title="Navigate">
        Go
      </button>
    </div>
  );
}
