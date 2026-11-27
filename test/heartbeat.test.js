import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heartbeatDue, buildHeartbeatPayload, maybeHeartbeat } from '../src/heartbeat.js';

function fakeStore(initial = {}) {
  const m = { ...initial };
  return { get: (k) => m[k] ?? null, set: (k, v) => { m[k] = { ...v, at: Date.now() }; }, raw: m };
}

const H = 3600 * 1000;
const cfg = (over = {}) => ({ heartbeatHours: 6, notifiers: [{ type: 'webhook', url: 'https://e.com/h' }], ...over });

test('heartbeatHours 가 없거나 0 이면 항상 skip', () => {
  assert.deepEqual(heartbeatDue({}, fakeStore()), { due: false, first: false });
  assert.deepEqual(heartbeatDue({ heartbeatHours: 0 }, fakeStore()), { due: false, first: false });
});

test('첫 실행은 기준 시각만 기록 (보내지 않음)', async () => {
  const store = fakeStore();
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, text: async () => '' }; };
  assert.equal(await maybeHeartbeat(cfg(), { store, results: [], fetchImpl }), 'first');
  assert.equal(calls, 0);
  assert.ok(store.raw.__heartbeat);
});

test('간격 미만이면 skipped, 이상이면 sent', async () => {
  const now = 10 * H;
  const fresh = fakeStore({ __heartbeat: { at: now - 1 * H } });
  const stale = fakeStore({ __heartbeat: { at: now - 7 * H } });
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, text: async () => '' }; };
  assert.equal(await maybeHeartbeat(cfg(), { store: fresh, results: [], fetchImpl, now: () => now }), 'skipped');
  assert.equal(calls, 0);
  assert.equal(await maybeHeartbeat(cfg(), { store: stale, results: [{ ok: true, name: 'a', signal: 0 }], fetchImpl, now: () => now }), 'sent');
  assert.equal(calls, 1);
});

test('전송 실패면 failed 이고 기준 시각을 갱신하지 않음', async () => {
  const now = 10 * H;
  const store = fakeStore({ __heartbeat: { at: now - 7 * H } });
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'x' });
  assert.equal(await maybeHeartbeat(cfg(), { store, results: [], fetchImpl, now: () => now }), 'failed');
  assert.equal(store.raw.__heartbeat.at, now - 7 * H);
});

test('채널이 없으면 skipped', async () => {
  const store = fakeStore({ __heartbeat: { at: 1 } });
  const r = await maybeHeartbeat({ heartbeatHours: 1 }, { store, results: [], fetchImpl: async () => ({}), now: () => 99 * H });
  assert.equal(r, 'skipped');
});

test('buildHeartbeatPayload: 요약 문구와 색상', () => {
  const p = buildHeartbeatPayload([{ ok: true, name: 'a', signal: 1 }, { ok: false, name: 'b', error: 'HTTP 500' }], 5 * H);
  assert.match(p.description, /정상 1, 오류 1/);
  assert.match(p.description, /가동 5시간/);
  assert.match(p.description, /❌ b · HTTP 500/);
  assert.equal(p.color, 0xf08c00);
});
