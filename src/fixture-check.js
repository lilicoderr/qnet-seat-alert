// 오프라인 종단 점검: 저장해 둔 페이지(fixture)에 설정의 watcher 를 적용해
// 신호 추출 / 현황표(PNG 에 들어갈 열·행) / 알림 여부를 네트워크·전송 없이 보여준다.
import { evaluate } from './extract.js';
import { filterRows } from './filter.js';
import { parseTable, formatKst } from './table.js';
import { isMaintenancePage } from './body.js';
import fs from 'node:fs';
import path from 'node:path';
import { fetchQnetSeats, clearQnetCache } from './qnet-chain.js';

// 저장된 fixture 가 찍힌 시각(접수 기간 판정용): 2026-11-27 15:30 KST
export const FIXTURE_NOW = Date.parse('2026-11-27T15:30:00+09:00');

// qnet 워처용: 단계별 fixture 폴더(rcv00301-*.html, rcv00302-schfrm.html, rcv00303-filters.html, rcv00303s02.euckr.json, rcv00303s03-closed.html)로 흐름 전체를 오프라인 실행
export async function checkQnetFixtureDir(w, dir, now) {
  const name = w.name || w.url;
  const files = fs.readdirSync(dir);
  const pick = (re) => fs.readFileSync(path.join(dir, files.find((f) => re.test(f))));
  const map = { rcv00301: /^rcv00301/, rcv00302: /^rcv00302/, rcv00303: /^rcv00303-filters/, rcv00303s02: /^rcv00303s02/, rcv00303s03: /^rcv00303s03-closed/ };
  const fetchText = async ({ url }) => { const id = new URL(url).searchParams.get('id'); return new TextDecoder(id === 'rcv00303s02' ? 'euc-kr' : 'utf-8').decode(pick(map[id])); };
  try {
    clearQnetCache();
    const r = await fetchQnetSeats(w, fetchText, { now });
    const t = parseTable(r.text, w);
    return [{ level: 'ok', msg: `${name}: qnet chain ran offline (${r.note || 'exam open'}); table image would show ${t.rows.length} venue row(s): ${t.columns.join(' | ')}` }];
  } catch (e) {
    // 저장된 샘플에는 일부 종목/지역만 있다: 실제 확인 방법을 함께 알려 준다
    if (/^(종목|지역) '.*' 없음/.test(e.message)) return [{ level: 'fail', msg: `${name}: ${e.message} → 저장된 샘플 페이지에는 일부 종목(건축도장/방수)만 있어 다른 값은 오프라인으로 확인할 수 없습니다. 실제 확인: node bin/qnet-alert.js --dry (접수 중인 시험이 있을 때 오타면 가능한 이름 목록이 나옵니다)` }];
    return [{ level: 'fail', msg: `${name}: ${e.message}` }];
  }
}

// 반환: [{ level, msg }]
export function checkFixture(config, html, { now = Date.now() } = {}) {
  const out = [];
  const add = (level, msg) => out.push({ level, msg });
  if (isMaintenancePage(html)) add('warn', 'fixture looks like a maintenance page');
  const watchers = (config.watchers || []).filter((w) => w.enabled !== false && w.type !== 'qnet');
  if (!watchers.length && !(config.watchers || []).some((w) => w.type === 'qnet')) add('fail', 'no enabled watchers');
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

// 파일 하나(+ 같은 폴더의 단계별 fixture)로 모든 워처를 점검한다.
export async function checkFixtureFile(config, file, { now = Date.now() } = {}) {
  const items = checkFixture(config, fs.readFileSync(file, 'utf8'), { now });
  for (const w of (config.watchers || []).filter((x) => x.enabled !== false && x.type === 'qnet')) {
    items.push(...await checkQnetFixtureDir(w, path.dirname(file), now));
  }
  return items;
}
