import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBody, isMaintenancePage } from '../src/body.js';
import { runWatcher } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { real } from './helpers/real.js';

// EUC-KR 바이트: "접수" = 0xC1 0xA2 0xBC 0xF6
const EUC_JEOPSU = Uint8Array.from([0xc1, 0xa2, 0xbc, 0xf6]);
const MAINT = '<html><body><h1>시스템 점검 안내</h1><p>더 나은 서비스를 위해 점검 중입니다.</p></body></html>';
const W = { name: 'w', type: 'newrows', pattern: '기능사.*필기', url: 'https://example.test/' };

test('readBody: 헤더가 euc-kr 이면 EUC-KR 로 디코드', async () => {
  const res = new Response(EUC_JEOPSU, { headers: { 'content-type': 'text/html; charset=EUC-KR' } });
  assert.equal(await readBody(res), '접수');
});

test('readBody: 헤더 없이 <meta charset=euc-kr> 이면 EUC-KR', async () => {
  const head = Buffer.from('<meta charset="euc-kr">');
  const res = new Response(Buffer.concat([head, EUC_JEOPSU]));
  assert.equal(await readBody(res), '<meta charset="euc-kr">접수');
});

test('readBody: 선언 없이 UTF-8 이 아닌 바이트면 EUC-KR 폴백, UTF-8 은 그대로', async () => {
  assert.equal(await readBody(new Response(EUC_JEOPSU)), '접수');
  assert.equal(await readBody(new Response('접수 기능사')), '접수 기능사');
  assert.equal(await readBody({ text: async () => 'legacy' }), 'legacy');
});

test('isMaintenancePage: 점검 안내만 true, 실제 목록(표 있음)은 false', () => {
  assert.equal(isMaintenancePage(MAINT), true);
  assert.equal(isMaintenancePage(real('rcv00301-2026-11-27.html')), false);
  assert.equal(isMaintenancePage('<table>점검 중</table>'), false);
});

test('점검 페이지(HTTP 200): 실패로 처리되고 저장된 신호는 보존', async () => {
  const store = memoryStore();
  store.set('w', { signal: '["a"]', kind: 'newrows', failures: 0, nullStreak: 0 });
  const r = await runWatcher(W, { store, fetchImpl: async () => new Response(MAINT, { status: 200 }), retries: 0 });
  assert.equal(r.ok, false);
  assert.match(r.error, /maintenance/);
  assert.equal(store.get('w').signal, '["a"]');
  assert.equal(store.get('w').failures, 1);
});

test('HTTP 503 점검: 재시도 후 실패, 본문은 파싱하지 않음', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(MAINT, { status: 503 }); };
  const r = await runWatcher(W, { store: memoryStore(), fetchImpl, retries: 2, backoffBaseMs: 0, sleepImpl: async () => {} });
  assert.equal(calls, 3);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'HTTP 503');
});

test('EUC-KR 로 내려온 목록도 파싱된다', async () => {
  const body = new TextEncoder().encode('<meta charset="euc-kr"><table><tr><td>x</td></tr></table>');
  const r = await runWatcher(W, { store: memoryStore(), fetchImpl: async () => new Response(body), retries: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.signal, '[]');
});
