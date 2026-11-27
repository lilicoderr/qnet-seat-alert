import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { buildDigestPayload } from '../src/digest.js';
import { validateConfig } from '../src/validate.js';

function harness(seats) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    if (url.includes('hooks')) { sent.push(JSON.parse(init.body)); return { ok: true, status: 204, text: async () => '' }; }
    return { status: 200, text: async () => `잔여 ${seats[url]}` };
  };
  return { sent, fetchImpl };
}
const cfg = (digest) => ({
  digest,
  notifiers: [{ type: 'webhook', url: 'https://example.com/hooks' }],
  watchers: [
    { name: 'A', id: 'a', type: 'seats', url: 'https://x.io/a' },
    { name: 'B', id: 'b', type: 'seats', url: 'https://x.io/b', mention: '@me' },
  ],
});

test('digest: 동시에 열린 2건이 1통으로 묶인다', async () => {
  const seats = { 'https://x.io/a': 0, 'https://x.io/b': 0 };
  const { sent, fetchImpl } = harness(seats);
  const store = memoryStore();
  await runOnce(cfg(true), { store, fetchImpl });
  seats['https://x.io/a'] = 2; seats['https://x.io/b'] = 5;
  const r = await runOnce(cfg(true), { store, fetchImpl });
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /2건/);
  assert.ok(r.every((x) => x.alerted));
});

test('digest 꺼짐: 각각 따로, 1건이면 일반 알림', async () => {
  const seats = { 'https://x.io/a': 0, 'https://x.io/b': 0 };
  const { sent, fetchImpl } = harness(seats);
  const store = memoryStore();
  await runOnce(cfg(false), { store, fetchImpl });
  seats['https://x.io/a'] = 2; seats['https://x.io/b'] = 5;
  await runOnce(cfg(false), { store, fetchImpl });
  assert.equal(sent.length, 2);
  const s2 = memoryStore();
  const h2 = harness({ 'https://x.io/a': 0, 'https://x.io/b': 0 });
  await runOnce(cfg(true), { store: s2, fetchImpl: h2.fetchImpl });
  await runOnce(cfg(true), { store: s2, fetchImpl: h2.fetchImpl });
  assert.equal(h2.sent.length, 0);
});

test('buildDigestPayload + 검증', () => {
  const p = buildDigestPayload([{ watcher: { name: 'A', mention: '@x' }, r: { available: 3, reason: 'r' } }]);
  assert.equal(p.content, '@x');
  assert.equal(validateConfig({ ...cfg('yes') }).ok, false);
});
