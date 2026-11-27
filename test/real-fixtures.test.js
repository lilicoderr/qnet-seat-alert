// 실제 Q-Net 공개 페이지(로그인 불필요)에서 받아 정리한 fixture 로 하는 테스트.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTable } from '../src/table.js';
import { evaluate } from '../src/extract.js';

export const real = (n) => fs.readFileSync(new URL(`./fixtures/real/${n}`, import.meta.url), 'utf8');

test('real rcv00301: 목록 행을 이름/접수기간으로 추출', () => {
  const t = parseTable(real('rcv00301-2026-11-27.html'));
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].cells[0], '2026년 상시 기능사 107회 실기');
  assert.match(t.rows[0].cells[1], /^2026년 11월 27일\(금\) 10:00 ~/);
});

test('real rcv00301: 좌석 수는 없으므로 seats 신호는 null', () => {
  assert.equal(evaluate({ type: 'seats' }, real('rcv00301-2026-11-27.html')).signal, null);
});

test('real fixture 에 세션/계획 ID 가 없다', () => {
  const h = real('rcv00301-2026-11-27.html');
  assert.ok(!/JSESSIONID|PL20\d+/.test(h));
});

test('real rcv00301: 표에는 버튼 열과 빈 빈자리 열이 없다', () => {
  const t = parseTable(real('rcv00301-2026-11-27.html'));
  assert.deepEqual(t.columns, ['응시시험', '접수기간']);
  assert.equal(t.rows[0].cells.length, 2);
});

// ── newrows: 새 항목이 생길 때 한 번만 알림 ──
import { runWatcher } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { validateConfig } from '../src/validate.js';

const page = (...names) => `<table><thead><tr><th>응시시험</th><th>접수기간</th></tr></thead><tbody>${names
  .map((n) => `<tr><td>${n}</td><td>2026년 12월 1일(화) 10:00 ~ 2026년 12월 5일(토) 18:00</td></tr>`).join('')}</tbody></table>`;
const fetchOf = (body) => async () => new Response(body, { status: 200 });
const W = { name: 'w', type: 'newrows', pattern: '기능사.*필기', url: 'https://example.test/' };

test('newrows: 첫 실행은 기준선만(알림 없음), 새 필기 항목이 생기면 한 번만 알림', async () => {
  const store = memoryStore();
  const run = (body) => runWatcher(W, { store, fetchImpl: fetchOf(body), retries: 0 });
  const r1 = await run(real('rcv00301-2026-11-27.html'));
  assert.equal(r1.shouldAlert, false);
  assert.equal(r1.signal, '[]');
  const withWritten = page('2026년 상시 기능사 107회 실기', '2027년 정기 기능사 1회 필기');
  const r2 = await run(withWritten);
  assert.equal(r2.shouldAlert, true);
  assert.deepEqual(r2.newRows, ['2027년 정기 기능사 1회 필기']);
  assert.equal((await run(withWritten)).shouldAlert, false);          // 같은 항목 재알림 없음
  assert.equal((await run(page('2026년 상시 기능사 107회 실기'))).shouldAlert, false); // 사라짐
  assert.equal((await run(withWritten)).shouldAlert, false);          // 다시 나타나도 재알림 없음
});

test('newrows: 표가 없는 응답(점검 페이지)은 신호 없음으로 취급', async () => {
  const r = await runWatcher(W, { store: memoryStore(), fetchImpl: fetchOf('<html>서비스 점검중</html>'), retries: 0 });
  assert.equal(r.signal, null);
  assert.equal(r.shouldAlert, false);
});

test('newrows: 설정 검증', () => {
  const bad = validateConfig({ watchers: [{ name: 'a', url: 'https://x.test/', type: 'newrows' }] });
  assert.ok(bad.errors.some((e) => /needle 또는 pattern/.test(e)));
  assert.equal(validateConfig({ watchers: [W] }, { requireWebhook: false }).errors.length, 0);
});
