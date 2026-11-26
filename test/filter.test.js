import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRows, datesIn, splitRows } from '../src/filter.js';
import { runWatcher } from '../src/engine.js';
import { memoryStore } from '../src/store.js';

const PAGE = `<table>
<tr><td>서울</td><td>전기기능사</td><td>2026.12.05</td><td>정원 30 접수인원 30</td></tr>
<tr><td>부산</td><td>전기기능사</td><td>2026.12.06</td><td>정원 30 접수인원 10</td></tr>
<tr><td>서울</td><td>용접기능사</td><td>2027.01.10</td><td>정원 20 접수인원 5</td></tr>
</table>`;

test('datesIn: 여러 날짜 표기', () => {
  assert.deepEqual(datesIn('2026.12.5 / 2026-1-09 / 2027년 3월 4일'), ['2026-12-05', '2026-01-09', '2027-03-04']);
});

test('splitRows: tr 단위 분리 + 태그 제거', () => {
  assert.equal(splitRows(PAGE).filter((r) => r.includes('접수인원')).length, 3);
});

test('filterRows: 지역+종목 include', () => {
  const { rows } = filterRows(PAGE, { include: ['서울', '전기기능사'] });
  assert.equal(rows.length, 1);
  assert.match(rows[0], /접수인원 30/);
});

test('filterRows: exclude / 날짜 범위', () => {
  assert.equal(filterRows(PAGE, { exclude: ['서울'] }).rows.length, 1);
  assert.equal(filterRows(PAGE, { dateFrom: '2026-12-06', dateTo: '2026-12-31' }).rows.length, 1);
  assert.equal(filterRows(PAGE, { dateFrom: '2027-01-01' }).rows.length, 1);
});

test('filterRows: 필터 없으면 원문 그대로', () => {
  assert.equal(filterRows(PAGE, {}).text, PAGE);
});

test('runWatcher: include 로 고른 행의 빈자리만 계산', async () => {
  const fetchImpl = async () => new Response(PAGE, { status: 200 });
  const w = { id: 'a', type: 'seats', url: 'https://x.test/', include: ['부산'] };
  const r = await runWatcher(w, { store: memoryStore(), fetchImpl });
  assert.equal(r.available, 20);
});

test('runWatcher: 5xx 는 백오프 재시도 후 성공', async () => {
  let n = 0;
  const waits = [];
  const fetchImpl = async () => (++n < 3 ? new Response('', { status: 503 }) : new Response('잔여 4석', { status: 200 }));
  const r = await runWatcher({ id: 'b', type: 'seats', url: 'https://x.test/' }, {
    store: memoryStore(), fetchImpl, sleepImpl: async (ms) => waits.push(ms),
  });
  assert.equal(r.available, 4);
  assert.deepEqual(waits, [1000, 2000]);
});

test('runWatcher: 계속 실패하면 failures 누적, 성공하면 초기화', async () => {
  const store = memoryStore();
  const bad = async () => { throw new Error('ECONNRESET'); };
  const w = { id: 'c', type: 'seats', url: 'https://x.test/' };
  const opts = { store, retries: 1, sleepImpl: async () => {} };
  await runWatcher(w, { ...opts, fetchImpl: bad });
  const r2 = await runWatcher(w, { ...opts, fetchImpl: bad });
  assert.equal(r2.ok, false);
  assert.equal(r2.failures, 2);
  await runWatcher(w, { ...opts, fetchImpl: async () => new Response('잔여 1석') });
  assert.equal(store.get('c').failures, 0);
});
