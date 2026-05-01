
// Parse URL query string into a sorted object
function parseQueryParams(url) {
  try {
    const u = new URL(url);
    const out = {};
    u.searchParams.forEach((v, k) => {
      // If the same key appears multiple times, turn it into an array
      if (k in out) {
        out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
      } else {
        out[k] = v;
      }
    });
    return out;
  } catch {
    return null;
  }
}

// Parse POST body — tries JSON, then URLSearchParams, then raw
function parseBody(postData) {
  if (!postData) return null;
  try {
    return { kind: 'json', value: JSON.parse(postData) };
  } catch {}
  try {
    const p = new URLSearchParams(postData);
    const out = {};
    p.forEach((v, k) => { out[k] = v; });
    if (Object.keys(out).length > 0) return { kind: 'form', value: out };
  } catch {}
  return { kind: 'raw', value: postData };
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

export { parseQueryParams, parseBody, formatBytes, formatTime };