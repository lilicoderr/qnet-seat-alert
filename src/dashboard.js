// 읽기 전용 로컬 대시보드. 127.0.0.1 에만 바인딩하고 비밀값(웹훅/토큰)은 절대 렌더링하지 않는다.
import fs from 'node:fs';
import http from 'node:http';
import { readHistory, summarize } from './history.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function sparkSvg(values, w = 160, h = 28) {
  const v = values.filter((x) => typeof x === 'number').slice(-60);
  if (v.length < 2) return '<span class="muted">-</span>';
  const max = Math.max(...v, 1);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - (x / max) * (h - 4)).toFixed(1)}`);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><polyline fill="none" stroke="#2b8a3e" stroke-width="1.5" points="${pts.join(' ')}"/></svg>`;
}

function ago(ms, now) {
  if (!ms) return '-';
  const m = Math.round((now - ms) / 60000);
  return m < 1 ? 'just now' : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function buildView(config, state, history, now = Date.now()) {
  const sums = new Map(summarize(history).map((s) => [s.id, s]));
  return (config.watchers || []).map((w) => {
    const id = w.id || w.name || w.url;
    const st = state[id] || {};
    const sum = sums.get(id);
    return {
      name: w.name || id, type: w.type || 'seats', enabled: w.enabled !== false,
      signal: st.signal ?? null, failures: st.failures || 0, last: st.at || null,
      status: !st.at ? 'unknown' : st.failures > 0 ? 'error' : 'ok',
      series: sum ? sum.series : [], lastAgo: ago(st.at, now),
    };
  });
}

const CSS = 'body{font:14px system-ui,sans-serif;margin:24px;background:#fff;color:#222}table{border-collapse:collapse;width:100%}'
  + 'th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #ddd}.ok{color:#2b8a3e}.error{color:#e03131}.muted,.unknown{color:#888}'
  + '@media(prefers-color-scheme:dark){body{background:#16181c;color:#e6e6e6}th,td{border-color:#333}}';

export function renderPage(rows) {
  const body = rows.map((r) => `<tr><td>${esc(r.name)}${r.enabled ? '' : ' <span class="muted">(off)</span>'}</td><td>${esc(r.type)}</td>`
    + `<td class="${r.status}">${esc(r.status)}${r.failures ? ` (${r.failures} fails)` : ''}</td>`
    + `<td>${esc(r.signal ?? '-')}</td><td>${esc(r.lastAgo)}</td><td>${sparkSvg(r.series)}</td></tr>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30"><title>qnet-alert dashboard</title><style>${CSS}</style></head>
<body><h1>qnet-alert</h1><p class="muted">Read-only. Alert-only watcher; it never registers for exams.</p>
<table><thead><tr><th>Watcher</th><th>Type</th><th>Status</th><th>Signal</th><th>Last check</th><th>History</th></tr></thead>
<tbody>\n${body || '<tr><td colspan="6">No watchers configured.</td></tr>'}\n</tbody></table></body></html>`;
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

// 요청마다 파일을 다시 읽으므로 감시 프로세스와 별개로 실행해도 된다.
export function createDashboardServer({ config, statePath = 'state.json', historyPath, now = () => Date.now() }) {
  return http.createServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    const rows = buildView(config, readJson(statePath), historyPath ? readHistory(historyPath) : [], now());
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
      return res.end(renderPage(rows));
    }
    if (url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(rows));
    }
    res.writeHead(404); res.end();
  });
}

export function startDashboard(opts, port = 8787) {
  const server = createDashboardServer(opts);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server)); // localhost 전용
  });
}
