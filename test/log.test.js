import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/log.js';
import { parseEnv } from '../src/env.js';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';

test('logger --json: 한 줄 JSON', () => {
  const lines = [];
  const l = createLogger({ json: true, out: (x) => lines.push(x), now: () => new Date('2026-01-01T00:00:00Z') });
  l.result({ ok: true, name: 'A', signal: 3, available: 3, shouldAlert: true, alerted: true, reason: '열림' });
  const o = JSON.parse(lines[0]);
  assert.equal(o.watcher, 'A');
  assert.equal(o.available, 3);
  assert.equal(o.ts, '2026-01-01T00:00:00.000Z');
});

test('logger --quiet: 변화 없는 정상 결과는 생략', () => {
  const lines = [];
  const l = createLogger({ quiet: true, out: (x) => lines.push(x) });
  l.result({ ok: true, name: 'A', signal: 0, shouldAlert: false });
  l.result({ ok: false, name: 'A', error: 'x' });
  assert.equal(lines.length, 1);
});

test('parseEnv: 주석·따옴표·export', () => {
  const e = parseEnv('# c\nA=1\nexport B="two words"\nC=\'x\'\n\nbad');
  assert.deepEqual(e, { A: '1', B: 'two words', C: 'x' });
});

test('runOnce: 연속 실패가 임계치에 닿으면 감시 이상 알림 1회', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    if (url.includes('hooks.slack.com')) { sent.push(JSON.parse(init.body).text); return new Response('ok'); }
    throw new Error('down');
  };
  const config = {
    failureAlertAfter: 2,
    notifiers: [{ type: 'slack', url: 'https://hooks.slack.com/services/T0/B0/X' }],
    watchers: [{ id: 'w', name: '감시', type: 'seats', url: 'https://q.test/' }],
  };
  const store = memoryStore();
  for (let i = 0; i < 4; i++) await runOnce(config, { store, fetchImpl, retries: 0 });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /연속 실패/);
});
