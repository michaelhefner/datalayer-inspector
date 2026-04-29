# Datalayer Inspector

A desktop browser built with Electron and React that intercepts and inspects `dataLayer` pushes, network requests, and GA4 hits in real time — without browser extensions or DevTools.

---

## Features

### Built-in Browser
- Full Chromium browser via Electron `<webview>`
- Address bar with back, forward, and reload controls
- `https://` is added automatically if omitted from the URL

### DataLayer Console
- Intercepts every `window.dataLayer.push()` call on the inspected page
- Displays event name, timestamp, and full JSON payload
- New events appear at the top in real time

### Network Console
- Captures all network requests made by the browsed page (XHR, Fetch, scripts, images, etc.)
- Shows method, status code, URL, type, size, and duration
- Click any request to open a detail panel with:
  - **Params** — URL query parameters
  - **Headers** — request and response headers
  - **Payload** — form data, JSON body, or raw payload
  - **Timing** — start time, duration, and a visual timing bar

### Confirmed Tracking Console
- Correlates `dataLayer` pushes with matching network requests by comparing payload values
- Highlights events where a network request fired within 5 seconds of the push
- Shows a badge count of confirmed hits
- Click any matched request to open the full request inspector

### GA4 Console
- Automatically detects GA4 Measurement Protocol requests (supports URL-encoded, form-encoded, and JSON body formats)
- Displays the GA4 event name and Tracking ID in the summary row
- Expands to show:
  - **Form Data** — raw flat key-value pairs sent in the request
  - Grouped parameter sections (identity, event params, user params, etc.)
- Works with first-party, server-side, and Google Tag Gateway endpoints

### CSV Export
- Every `dataLayer` push is automatically appended to a CSV file in real time
- Nested payload objects are flattened using dot-notation keys (e.g. `ecommerce.purchase.revenue`)
- Column headers grow dynamically as new keys are seen; the file is rewritten to stay consistent
- **Dev mode**: saved to `dist/datalayer-<timestamp>.csv` in the project folder
- **Packaged app**: saved to the OS user data directory:
  - macOS: `~/Library/Application Support/Datalayer Inspector/`
  - Linux: `~/.config/Datalayer Inspector/`
  - Windows: `%APPDATA%\Datalayer Inspector\`

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

---

## Installation

```bash
# Clone the repository
git clone https://github.com/michaelhefner/datalayer-inspector.git
cd datalayer-inspector

# Install dependencies
npm install
```

---

## Running in Development

```bash
npm run dev
```

This starts the Vite dev server and launches Electron simultaneously. Hot-reload is active for the React UI.

---

## Building a Distributable

```bash
npm run dist
```

This runs `vite build` followed by `electron-builder` and outputs a platform-native installer to the `release/` folder.

| Platform | Output format |
|----------|---------------|
| Windows  | NSIS installer (`.exe`) |
| macOS    | Disk image (`.dmg`) |
| Linux    | AppImage (`.AppImage`) |

> **Note:** Electron apps must be built on the target platform. To build for macOS you need a Mac; for Linux, a Linux machine or container.

### Build for a specific platform

```bash
npx electron-builder --win
npx electron-builder --mac
npx electron-builder --linux
```
