const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

// Unique tag used to identify dataLayer push console.log calls via CDP
const DL_TAG = '__DS_DL_PUSH__';

// Injected into every page before page scripts run via addScriptToEvaluateOnNewDocument.
// Intercepts window.dataLayer.push and reports each call via console.log so
// the CDP Runtime.consoleAPICalled event can relay it to the renderer.
const DATA_LAYER_SCRIPT = `(function () {
  var TAG = '${DL_TAG}';
  function intercept(arr) {
    if (arr[TAG]) return;
    Object.defineProperty(arr, TAG, { value: true, enumerable: false, writable: false });
    var orig = Array.prototype.push;
    arr.push = function () {
      var args = Array.from(arguments);
      try { console.log(TAG, JSON.stringify({ p: args, u: location.href })); } catch(e) {}
      return orig.apply(arr, args);
    };
  }
  var _dl = Array.isArray(window.dataLayer) ? window.dataLayer : [];
  intercept(_dl);
  Object.defineProperty(window, 'dataLayer', {
    get: function () { return _dl; },
    set: function (v) { _dl = v; if (Array.isArray(_dl)) intercept(_dl); },
    configurable: true,
    enumerable: true,
  });
})();`;

// ── CSV export ────────────────────────────────────────────────────────────────

function flattenObject(obj, prefix, out) {
  if (!prefix) prefix = '';
  if (!out) out = {};
  if (obj === null || obj === undefined) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenObject(v, key, out);
    } else {
      out[key] = Array.isArray(v) ? JSON.stringify(v) : String(v != null ? v : '');
    }
  }
  return out;
}

function escapeCSV(val) {
  const s = String(val != null ? val : '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Session-scoped state — reset each time the app starts
const csvSessionStart = new Date()
  .toISOString()
  .replace(/:/g, '-')
  .replace('T', '_')
  .slice(0, 19);
let csvPath = null;
const csvHeaders = ['timestamp', 'url'];
const csvRows = [];

function getCsvPath() {
  if (!csvPath) {
    const fileName = `datalayer-${csvSessionStart}.csv`;
    const dir = app.isPackaged
      ? app.getPath('userData')
      : path.join(__dirname, '../dist');
    fs.mkdirSync(dir, { recursive: true });
    csvPath = path.join(dir, fileName);
  }
  return csvPath;
}

function writeCsvFile() {
  const p = getCsvPath();
  const lines = [csvHeaders.map(escapeCSV).join(',')];
  for (const row of csvRows) {
    lines.push(csvHeaders.map((h) => escapeCSV(row[h] != null ? row[h] : '')).join(','));
  }
  fs.writeFileSync(p, lines.join('\r\n') + '\r\n', 'utf8');
}

ipcMain.on('csv-export-event', (_e, data) => {
  const flat = {
    timestamp: new Date(data.ts).toISOString(),
    url: data.url || '',
  };

  if (Array.isArray(data.payload)) {
    for (const item of data.payload) {
      if (item && typeof item === 'object') {
        flattenObject(item, '', flat);
      }
    }
  }

  let headersChanged = false;
  for (const key of Object.keys(flat)) {
    if (!csvHeaders.includes(key)) {
      csvHeaders.push(key);
      headersChanged = true;
    }
  }

  csvRows.push(flat);

  // Rewrite on header change (keeps columns consistent); otherwise append.
  if (headersChanged || csvRows.length === 1) {
    writeCsvFile();
  } else {
    const line = csvHeaders.map((h) => escapeCSV(flat[h] != null ? flat[h] : '')).join(',');
    fs.appendFileSync(getCsvPath(), line + '\r\n', 'utf8');
  }
});

function setupWebviewCDP(contents) {
  try {
    contents.debugger.attach('1.3');
  } catch (err) {
    console.error('Debugger attach failed:', err.message);
    return;
  }

  // Network domain — request/response logging
  contents.debugger
    .sendCommand('Network.enable', {
      maxTotalBufferSize: 10_000_000,
      maxResourceBufferSize: 5_000_000,
    })
    .catch((err) => console.error('Network.enable failed:', err.message));

  // Runtime + Page domains — dataLayer interception
  contents.debugger.sendCommand('Runtime.enable').catch(() => {});
  contents.debugger.sendCommand('Page.enable').catch(() => {});
  contents.debugger
    .sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: DATA_LAYER_SCRIPT })
    .catch((err) => console.error('addScriptToEvaluateOnNewDocument failed:', err.message));

  contents.debugger.on('message', (_e, method, params) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Forward all Network domain events for request logging
    if (method.startsWith('Network.')) {
      mainWindow.webContents.send('network-event', { method, params });
      return;
    }

    // Pick up dataLayer pushes that were reported via console.log
    if (method === 'Runtime.consoleAPICalled') {
      const args = params.args || [];
      if (params.type === 'log' && args.length >= 2 && args[0].value === DL_TAG) {
        try {
          const raw = JSON.parse(args[1].value);
          mainWindow.webContents.send('datalayer-event', {
            payload: raw.p,
            url: raw.u,
            ts: Date.now(),
          });
        } catch (_) {}
      }
    }
  });

  contents.on('destroyed', () => {
    try { contents.debugger.detach(); } catch (_) {}
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// web-contents-created is the earliest event fired for a new WebContents —
// before any navigation starts, so the debugger is attached before requests fire.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;
  setupWebviewCDP(contents);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
