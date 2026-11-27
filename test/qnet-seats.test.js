import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { real } from './helpers/real.js';
import { parseExamList, parseQualForm, parseSidoOptions, parseVenueTable, parseSeatCell, parsePeriod, QnetLayoutError } from '../src/qnet-seats.js';
import { runWatcher } from '../src/engine.js';
import { clearQnetCache } from '../src/qnet-chain.js';
import { memoryStore } from '../src/store.js';
import { parseTable } from '../src/table.js';
import { readBody } from '../src/body.js';

const NOW = Date.parse('2026-11-27T06:30:00Z'); // 15:30 KST, 107회 접수 중
const bytes = (n) => fs.readFileSync(new URL(`./fixtures/real/${n}`, import.meta.url));
beforeEach(() => clearQnetCache());

test('parseExamList: 이름/접수기간/현황보기 인자', () => {
  const [a] = parseExamList(real('rcv00301-2026-11-27.html'));
  assert.equal(a.name, '2026년 상시 기능사 107회 실기');
  assert.deepEqual([a.gId, a.implYY, a.implSeq, a.seqNo, a.qualGb], ['04', '2026', '107', '2', 'T']);
  assert.ok(a.start < a.end);
  assert.equal(parsePeriod(a.period).start, Date.parse('2026-11-27T10:00:00+09:00'));
});

test('parseQualForm / parseSidoOptions', () => {
  const f = parseQualForm(real('rcv00302-schfrm.html'));
  assert.deepEqual(f.jongmok.map((j) => j.name), ['건축도장기능사', '방수기능사']);
  assert.equal(f.rs[1].rsJmCd, '7030');
  assert.ok(parseSidoOptions(real('rcv00303-filters.html')).some((o) => o.text === '서울특별시'));
  assert.throws(() => parseQualForm('<html>x</html>'), QnetLayoutError);
});

test('parseVenueTable: 실제 표(전부 마감) 와 데이터 없음', () => {
  const t = parseVenueTable(real('rcv00303s03-closed.html'));
  assert.equal(t.rows.length, 10);
  assert.equal(t.pages, 2);
  assert.deepEqual([t.rows[0].region, t.rows[0].org, t.rows[0].date, t.rows[0].capacity, t.rows[0].open], ['경기도', '경기남부지사', '2026-12-07', 18, 0]);
  assert.match(t.rows[0].place, /안성국가자격시험장/);
  assert.equal(parseVenueTable(real('rcv00303s03-nodata.html')).noData, true);
});

test('parseSeatCell: 숫자/마감/알 수 없음, 레이아웃 변경은 오류', () => {
  assert.deepEqual([parseSeatCell('마감 (작업형)'), parseSeatCell('7'), parseSeatCell('접수가능')], [0, 7, null]);
  assert.throws(() => parseVenueTable('<table><thead><tr><th>x</th></tr></thead></table>'), QnetLayoutError);
  const odd = real('rcv00303s03-closed.html').replace('마감</font>', '문의</font>');
  assert.throws(() => parseVenueTable(odd), /알 수 없는 잔여/);
});

test('EUC-KR JSON (실제 헤더 charset) 디코드', async () => {
  const res = new Response(bytes('rcv00303s02.euckr.json'), { headers: { 'content-type': 'application/x-json;charset=EUC-KR' } });
  assert.equal(JSON.parse(await readBody(res)).recptList[0].id, 'A');
});

// 가짜 Q-Net: URL 의 id 로 단계별 응답. 호출 기록을 남긴다.
function fake({ list = real('rcv00301-2026-11-27.html'), venue = real('rcv00303s03-closed.html') } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const id = new URL(url).searchParams.get('id');
    calls.push({ id, method: init.method, ua: init.headers?.['User-Agent'] });
    const html = { rcv00301: list, rcv00302: real('rcv00302-schfrm.html'), rcv00303: real('rcv00303-filters.html'), rcv00303s03: venue }[id];
    if (id === 'rcv00303s02') return new Response(bytes('rcv00303s02.euckr.json'), { headers: { 'content-type': 'application/x-json;charset=EUC-KR' } });
    return new Response(html, { status: 200 });
  };
  return { calls, fetchImpl };
}
const W = { name: 'q', type: 'qnet', url: 'https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301', examPattern: '기능사', jongmok: '건축도장' };
const run = (f, w = W, store = memoryStore()) => runWatcher(w, { store, fetchImpl: f.fetchImpl, retries: 0 });

test('qnet: 전체 흐름(실제 fixture) - 잔여 0, 표에 지역/시험장/잔여 열', async () => {
  const f = fake();
  const realNow = Date.now; Date.now = () => NOW;
  let r; try { r = await run(f); } finally { Date.now = realNow; }
  assert.equal(r.ok, true);
  assert.equal(r.available, 0);
  assert.equal(r.detail.venues, 20); // 2 페이지 x 10행 (같은 fixture 를 두 번 돌려줌)
  assert.deepEqual(f.calls.map((c) => c.id), ['rcv00301', 'rcv00302', 'rcv00303', 'rcv00303s02', 'rcv00303s03', 'rcv00303s03']);
  assert.ok(f.calls.every((c) => /^qnet-seat-alert\//.test(c.ua)));
  assert.ok(f.calls.every((c) => !/rcv202|man001/.test(c.id)));
  const t = parseTable(r.rawText, W, r);
  assert.deepEqual(t.columns, ['지역', '시험장', '시험일자', '정원', '잔여', '빈자리']);
  assert.equal(t.rows[0].cells.at(-1), '마감');
});

const withNow = async (fn) => { const o = Date.now; Date.now = () => NOW; try { return await fn(); } finally { Date.now = o; } };
const OPEN = real('rcv00303s03-closed.html').replaceAll('<font color=\'blue\'>마감</font><br />(작업형)', '5');

test('qnet: 마감 -> 잔여 5 로 바뀌면 알림, 정적 단계는 캐시되어 체크당 s03 만 호출', async () => {
  const store = memoryStore();
  const f = fake();
  const r1 = await withNow(() => run(f, W, store));
  assert.equal(r1.shouldAlert, false);
  const f2 = fake({ venue: OPEN });
  const r2 = await withNow(() => run(f2, W, store));
  assert.equal(r2.shouldAlert, true);
  assert.equal(r2.available, 5 * 20);
  assert.deepEqual(f2.calls.map((c) => c.id), ['rcv00303s03', 'rcv00303s03']); // 캐시: 목록/폼 재요청 없음
});

test('qnet: region 은 시도 select 값으로 서버 쪽 필터, 없는 지역은 오류 메시지', async () => {
  const r = await withNow(() => run(fake(), { ...W, region: '서울' }));
  assert.equal(r.ok, true);
  clearQnetCache();
  const bad = await withNow(() => run(fake(), { ...W, region: '화성' }));
  assert.equal(bad.signal, null); // 레이아웃/설정 오류는 신호 없음 -> parser broken 경로
  assert.match(bad.detail, /지역 '화성' 없음/);
});

test('qnet: 접수 중인 시험이 없거나 아직 시작 전이면 잔여 0, 호출은 목록 1번', async () => {
  const f = fake();
  const r = await run(f, { ...W, examPattern: '기능사 필기' });
  assert.equal(r.available, 0);
  assert.equal(r.ok, true);
  assert.deepEqual(f.calls.map((c) => c.id), ['rcv00301']);
  const before = fake();
  const early = Date.parse('2026-11-25T00:00:00Z'); const o = Date.now; Date.now = () => early;
  try { assert.equal((await run(before)).available, 0); } finally { Date.now = o; }
  assert.equal(before.calls.length, 1);
});

test('qnet: 레이아웃 변경(목록 표 없음 / 점검 / 5xx)', async () => {
  const f = fake({ list: '<html>new layout</html>' });
  const r = await withNow(() => run(f));
  assert.equal(r.ok, true);
  assert.equal(r.signal, null);
  const m = await withNow(() => run({ fetchImpl: async () => new Response('<html>시스템 점검 중입니다</html>') }));
  assert.equal(m.ok, false);
  clearQnetCache();
  const e = await withNow(() => run({ fetchImpl: async () => new Response('x', { status: 503 }) }));
  assert.equal(e.error, 'HTTP 503');
});
