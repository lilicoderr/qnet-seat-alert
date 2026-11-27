import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDelayMs, POLITE_UA, MIN_INTERVAL_MIN, DEFAULT_JITTER } from '../src/polite.js';
import { validateConfig } from '../src/validate.js';
import { runWatcher } from '../src/engine.js';
import { memoryStore } from '../src/store.js';

test('nextDelayMs: 지터 범위와 최소 간격', () => {
  assert.equal(nextDelayMs(5, 0.1, () => 0.5), 300000);
  assert.equal(nextDelayMs(5, 0.1, () => 0), 270000);
  assert.equal(nextDelayMs(5, 0.1, () => 1), 330000);
  assert.equal(nextDelayMs(5, 0, () => 0.9), 300000);
  assert.equal(nextDelayMs(1, 0.5, () => 0), MIN_INTERVAL_MIN * 60000); // 하한 보장
  assert.equal(nextDelayMs(undefined, 0, () => 0.5), 300000);
  assert.equal(DEFAULT_JITTER, 0.1);
});

test('jitter 는 0~0.5 만 허용', () => {
  const base = { webhookUrl: 'https://discord.com/api/webhooks/' + '1/abc', watchers: [{ url: 'https://x.test/', name: 'a' }] };
  assert.equal(validateConfig({ ...base, jitter: 0.2 }).ok, true);
  assert.equal(validateConfig({ ...base, jitter: 0.9 }).ok, false);
  assert.equal(validateConfig({ ...base, jitter: -1 }).ok, false);
});

test('User-Agent 는 도구/저장소를 밝히고, 워처 headers 로 덮어쓸 수 있다', async () => {
  assert.match(POLITE_UA, /^qnet-seat-alert\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\//);
  const seen = [];
  const fetchImpl = async (u, o) => { seen.push(o.headers['User-Agent']); return { status: 200, text: async () => '잔여 1석' }; };
  await runWatcher({ name: 'a', type: 'seats', url: 'https://x.test/' }, { store: memoryStore(), fetchImpl });
  await runWatcher({ name: 'b', type: 'seats', url: 'https://x.test/', headers: { 'User-Agent': 'mine' } }, { store: memoryStore(), fetchImpl });
  assert.equal(seen[0], POLITE_UA);
  assert.equal(seen[1], 'mine');
});

test('최소 간격은 60초: 1분 허용, 그 아래는 1분으로 올림 + 경고', () => {
  assert.equal(MIN_INTERVAL_MIN, 1);
  assert.equal(nextDelayMs(1, 0, () => 0.5), 60000);
  assert.equal(nextDelayMs(0.2, 0, () => 0.5), 60000);
  assert.equal(nextDelayMs(1, 0.5, () => 0), 60000); // 지터로도 60초 미만이 되지 않는다
  const base = { webhookUrl: 'https://discord.com/api/webhooks/' + '1/abc', watchers: [{ url: 'https://x.test/', name: 'a' }] };
  assert.ok(!validateConfig({ ...base, intervalMin: 1 }).warnings.some((w) => /intervalMin/.test(w)));
  assert.match(validateConfig({ ...base, intervalMin: 0.5 }).warnings.join(), /1분/);
});

test('간격 하한: 60초 (1분 허용, 그 미만은 1분으로 올림)', () => {
  assert.equal(MIN_INTERVAL_MIN, 1);
  assert.equal(nextDelayMs(1, 0, () => 0.5), 60000);
  assert.equal(nextDelayMs(0.1, 0.5, () => 0), 60000);
  const base = { webhookUrl: 'https://discord.com/api/webhooks/' + '1/abc', watchers: [{ url: 'https://x.test/', name: 'a' }] };
  const ok = validateConfig({ ...base, intervalMin: 1 });
  assert.equal(ok.ok, true);
  assert.equal(ok.warnings.some((w) => w.includes('intervalMin')), false);
  const low = validateConfig({ ...base, intervalMin: 0.5 });
  assert.ok(low.warnings.some((w) => w.includes('1분')));
});
