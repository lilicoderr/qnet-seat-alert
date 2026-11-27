// 오프라인 종단 점검: 저장해 둔 페이지(fixture)에 설정의 watcher 를 적용해
// 신호 추출 / 현황표(PNG 에 들어갈 열·행) / 알림 여부를 네트워크·전송 없이 보여준다.
import { evaluate } from './extract.js';
import { filterRows } from './filter.js';
import { parseTable, formatKst } from './table.js';
import { isMaintenancePage } from './body.js';

// 반환: [{ level, msg }]
export function checkFixture(config, html, { now = Date.now() } = {}) {
  const out = [];
  const add = (level, msg) => out.push({ level, msg });
  if (isMaintenancePage(html)) add('warn', 'fixture looks like a maintenance page');
  const watchers = (config.watchers || []).filter((w) => w.enabled !== false);
  if (!watchers.length) add('fail', 'no enabled watchers');
  for (const w of watchers) {
    const name = w.name || w.url;
    let cur;
    try { cur = evaluate(w, w.type === 'jsonseats' ? html : filterRows(html, w).text); } catch (e) { add('fail', `${name}: ${e.message}`); continue; }
    if (cur.signal === null || cur.signal === undefined) { add('fail', `${name}: no signal could be extracted from the fixture (${cur.detail})`); continue; }
    const hits = cur.kind === 'newrows' ? JSON.parse(cur.signal).length : null;
    add('ok', `${name}: type ${w.type || 'seats'} -> signal ${hits === null ? cur.signal : `${hits} matching entr${hits === 1 ? 'y' : 'ies'} (baseline, no alert on first run)`}`);
    const table = parseTable(html, w, cur.kind === 'seats' ? cur : null);
    if (!table.rows.length) { add('warn', `${name}: no table rows, so the PNG image would be skipped`); continue; }
    add('ok', `${name}: table image would show ${table.rows.length} row(s): ${table.columns.join(' | ')} (header: ${formatKst(now)} KST)`);
    if (table.rows.length) add('ok', `first row: ${table.rows[0].cells.join(' | ')}`);
  }
  return out;
}
