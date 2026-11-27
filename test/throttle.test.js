import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours, takeRateSlot } from '../src/throttle.js';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { validateConfig } from '../src/validate.js';

const at = (h, m = 0) => new Date(2026, 0, 5, h, m);

test('inQuietHours: 자정을 넘는 구간과 일반 구간', () => {
  const q = { start: '23:00', end: '07:00' };
  assert.equal(inQuietHours(q, at(23, 30)), true);
  assert.equal(inQuietHours(q, at(3)), true);
  assert.equal(inQuietHours(q, at(7)), false);
  assert.equal(inQuietHours(q, at(12)), false);
  assert.equal(inQuietHours({ start: '09:00', end: '10:00' }, at(9, 59)), true);
  assert.equal(inQuietHours(undefined, at(3)), false);
});

test('timezone 지정 시 해당 시간대 기준', () => {
  const utcNoon = new Date(Date.UTC(2026, 0, 5, 15, 0)); // 서울 00:00
  assert.equal(inQuietHours({ start: '23:00', end: '07:00', timezone: 'Asia/Seoul' }, utcNoon), true);
});

test('takeRateSlot: 시간당 상한', () => {
  const s = memoryStore();
  const cfg = { rateLimit: { maxPerHour: 2 } };
  assert.equal(takeRateSlot(cfg, s, 1000), true);
  assert.equal(takeRateSlot(cfg, s, 2000), true);
  assert.equal(takeRateSlot(cfg, s, 3000), false);
  assert.equal(takeRateSlot(cfg, s, 3600 * 1000 + 1500), true);
});

function setup(openCount) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    if (url.includes('hooks')) { sent.push(JSON.parse(init.body)); return { ok: true, status: 204, text: async () => '' }; }
    return { status: 200, text: async () => `잔여 ${openCount.n}` };
  };
  return { sent, fetchImpl };
}

test('조용한 시간 동안 보류했다가 끝나면 전송', async () => {
  const n = { n: 0 };
  const { sent, fetchImpl } = setup(n);
  const store = memoryStore();
  const config = {
    quietHours: { start: '23:00', end: '07:00' },
    notifiers: [{ type: 'webhook', url: 'https://example.com/hooks' }],
    watchers: [{ name: 'w', id: 'w', type: 'seats', url: 'https://example.com/page' }],
  };
  await runOnce(config, { store, fetchImpl, now: () => at(1).getTime() }); // 0석 기준
  n.n = 3;
  const r = await runOnce(config, { store, fetchImpl, now: () => at(2).getTime() });
  assert.equal(sent.length, 0);
  assert.match(r[0].alertError, /조용한/);
  await runOnce(config, { store, fetchImpl, now: () => at(8).getTime() });
  assert.equal(sent.length, 1);
  await runOnce(config, { store, fetchImpl, now: () => at(9).getTime() });
  assert.equal(sent.length, 1);
});

test('설정 검증', () => {
  const base = { notifiers: [{ type: 'webhook', url: 'https://a.b/c' }], watchers: [{ name: 'a', url: 'https://a.b', type: 'seats' }] };
  assert.equal(validateConfig({ ...base, quietHours: { start: '25:00', end: '07:00' } }).ok, false);
  assert.equal(validateConfig({ ...base, rateLimit: { maxPerHour: 0 } }).ok, false);
  assert.equal(validateConfig({ ...base, quietHours: { start: '23:00', end: '07:00' }, rateLimit: { maxPerHour: 5 } }).ok, true);
});
