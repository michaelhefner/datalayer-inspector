// This preload script runs in the webview's MAIN WORLD before any page scripts.
// Because webview preloads are not context-isolated by default, we can directly
// manipulate window.dataLayer without any script injection or postMessage dance.

const { ipcRenderer } = require('electron');

(function () {
  function sendPush(args) {
    try {
      ipcRenderer.sendToHost('datalayer-push', {
        payload: JSON.parse(JSON.stringify(Array.from(args))),
        ts: Date.now(),
        url: location.href,
      });
    } catch (_) {
      // ignore serialisation errors (circular refs, functions, etc.)
    }
  }

  function wrapArray(arr) {
    if (arr.__dlWrapped) return;
    Object.defineProperty(arr, '__dlWrapped', { value: true, writable: false, enumerable: false });
    const origPush = Array.prototype.push;
    arr.push = function () {
      sendPush(arguments);
      return origPush.apply(arr, arguments);
    };
  }

  let _dl = [];

  // Intercept future window.dataLayer = [...] assignments
  Object.defineProperty(window, 'dataLayer', {
    get: function () { return _dl; },
    set: function (v) {
      _dl = Array.isArray(v) ? v : v;
      if (Array.isArray(_dl)) wrapArray(_dl);
    },
    configurable: true,
    enumerable: true,
  });

  // Wrap any dataLayer that already exists (set before this preload ran)
  if (Array.isArray(window.dataLayer)) {
    _dl = window.dataLayer;
    wrapArray(_dl);
  }
})();

