// 현황표 추출 + HTML 렌더링. 이미지(PNG)는 render.js 가 이 HTML 을 찍는다.
import { stripTags, filterRows, hasFilter } from './filter.js';
import { extractSeats } from './extract.js';
import { esc } from './dashboard.js';

const CELL_RE = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;

const L = {
  ko: { asOf: (t) => `${t} KST 기준`, seats: '빈자리', closed: '마감', seatsVal: (n) => `${n}석`, target: '감시 대상', cap: '정원', applied: '접수', footer: '알림 전용 · 자동 접수 없음', none: '표시할 행이 없습니다' },
  en: { asOf: (t) => `As of ${t} KST`, seats: 'Seats open', closed: 'Full', seatsVal: (n) => String(n), target: 'Watcher', cap: 'Capacity', applied: 'Applied', footer: 'alert only · no auto-registration', none: 'No rows to show' },
};

// 2026-11-27 14:03 (Asia/Seoul)
export function formatKst(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const toNum = (x) => (/^[0-9,]+$/.test(String(x).trim()) ? Number(String(x).replace(/,/g, '')) : null);

// 헤더가 있으면 열(정원/접수/잔여)로, 없으면 행 텍스트에서 잔여석을 계산한다.
function rowSeats(texts, columns) {
  const idx = (re) => columns.findIndex((c) => re.test(c));
  const [rem, cap, app] = [idx(/잔여|여석|remain/i), idx(/정원|모집|capacity/i), idx(/접수|신청|applied/i)];
  if (rem >= 0 && toNum(texts[rem]) !== null) return toNum(texts[rem]);
  if (cap >= 0 && app >= 0 && toNum(texts[cap]) !== null && toNum(texts[app]) !== null) return Math.max(0, toNum(texts[cap]) - toNum(texts[app]));
  const s = extractSeats(texts.join(' '));
  return s ? s.available : null;
}

// 셀 정리: Q-Net 의 모바일용 라벨(<em class="mSort">)을 제거하고 공백/개행을 하나로 합친다.
const cleanCell = (html) => stripTags(String(html).replace(/<em[^>]*class=["'][^"']*mSort[^"']*["'][^>]*>[\s\S]*?<\/em>/gi, ' ')).replace(/\s+/g, ' ').trim();

// 원문(HTML/텍스트)에서 표를 뽑는다. 표가 없으면 평가 결과(detail)로 한 줄을 만든다.
export function parseTable(rawText, watcher = {}, cur = null, lang = 'ko') {
  const l = L[lang] || L.ko;
  let columns = [];
  const rows = [];
  for (const tr of String(rawText).split(/<\/tr>/i)) {
    const cells = [...tr.matchAll(CELL_RE)].map((m) => ({ tag: m[1].toLowerCase(), text: cleanCell(m[2]) }));
    if (!cells.length) continue;
    if (cells.every((c) => c.tag === 'th')) { if (!columns.length) columns = cells.map((c) => c.text); continue; }
    const texts = cells.map((c) => c.text);
    const line = texts.join(' ');
    if (hasFilter(watcher) && !filterRows(line, watcher).rows?.length) continue;
    rows.push({ cells: texts, available: rowSeats(texts, columns) });
  }
  if (rows.length) {
    const width = Math.max(...rows.map((r) => r.cells.length));
    while (columns.length < width) columns.push('');
    return { columns: [...columns.slice(0, width), l.seats], rows: rows.map((r) => ({ ...r, cells: [...r.cells, seatLabel(r.available, l)] })) };
  }
  if (cur && cur.available != null) {
    const d = cur.detail && typeof cur.detail === 'object' ? cur.detail : {};
    return {
      columns: [l.target, l.cap, l.applied, l.seats],
      rows: [{ cells: [watcher.name || 'Q-Net', d.capacity ?? '-', d.applied ?? '-', seatLabel(cur.available, l)], available: cur.available }],
    };
  }
  return { columns: [], rows: [] };
}

const seatLabel = (n, l) => (n == null ? '-' : n > 0 ? l.seatsVal(n) : l.closed);

// 변화 감지용 지문(시간 정보 제외)
export function tableFingerprint(table) {
  return JSON.stringify(table.rows.map((r) => r.cells));
}

const CSS = `*{box-sizing:border-box}body{margin:0;padding:28px 32px;background:#fff;color:#1f2933;font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR",system-ui,sans-serif}
.asof{font-size:30px;font-weight:700;color:#0b4f8a;margin:0 0 4px}.title{font-size:18px;color:#52606d;margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:18px}th{background:#e4ecf5;text-align:left;padding:10px 12px;border-bottom:2px solid #9fb3c8}
td{padding:10px 12px;border-bottom:1px solid #d9e2ec}tr.open td{background:#d3f9d8;font-weight:700;color:#1b5e20}tr.full td{color:#7b8794}
.foot{margin-top:14px;font-size:13px;color:#9aa5b1}`;

export function renderTableHtml({ columns, rows }, { checkedAt = Date.now(), title = '', lang = 'ko' } = {}) {
  const l = L[lang] || L.ko;
  const head = columns.length ? `<tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` : '';
  const body = rows.length
    ? rows.map((r) => `<tr class="${r.available > 0 ? 'open' : 'full'}">${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n')
    : `<tr><td>${esc(l.none)}</td></tr>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>qnet-alert</title><style>${CSS}</style></head><body>
<p class="asof">${esc(l.asOf(formatKst(checkedAt)))}</p>
<p class="title">${esc(title)}</p>
<table><thead>${head}</thead><tbody>
${body}
</tbody></table>
<p class="foot">qnet-seat-alert · ${esc(l.footer)}</p></body></html>`;
}

// 렌더 높이 추정(px, 1x). 실제 측정이 실패했을 때의 대비책: 긴 글이 줄바꿈되는 만큼 행 높이를 키운다.
export function estimateHeight(table, width = 960) {
  const n = Math.max(1, table.columns.length || Math.max(0, ...table.rows.map((r) => r.cells.length)));
  const colW = Math.max(60, (width - 64) / n - 24);
  const lines = (txt) => Math.max(1, Math.ceil([...String(txt)].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 18 : 10), 0) / colW));
  const rowH = (cells) => 22 * Math.max(1, ...cells.map(lines)) + 24;
  return 190 + rowH(table.columns) + table.rows.reduce((h, r) => h + rowH(r.cells), 0);
}
