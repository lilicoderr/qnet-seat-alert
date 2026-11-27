import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerNotifier, clearPlugins, loadPlugins } from '../src/plugins.js';
import { sendTo, notifyAll, validateNotifier } from '../src/notify.js';
import { validateConfig } from '../src/validate.js';

beforeEach(() => clearPlugins());

test('플러그인 채널로 전송된다', async () => {
  const got = [];
  registerNotifier({ type: 'mine', send: async (n, p) => got.push([n.x, p.title]) });
  await sendTo({ type: 'mine', x: 1 }, { title: 'hi' });
  assert.deepEqual(got, [[1, 'hi']]);
});

test('validate 결과와 내장 이름 충돌 처리', () => {
  registerNotifier({ type: 'v', validate: () => 'bad', send: async () => {} });
  assert.equal(validateNotifier({ type: 'v' }), 'bad');
  assert.throws(() => registerNotifier({ type: 'slack', send() {} }), /겹칩/);
  assert.throws(() => registerNotifier({ type: 'nosend' }), /send/);
});

test('플러그인 실패는 notifyAll 에서 격리된다', async () => {
  registerNotifier({ type: 'boom', send: async () => { throw new Error('x'); } });
  const r = await notifyAll([{ type: 'boom' }], { title: 't' });
  assert.equal(r.delivered, 0);
  assert.equal(r.errors.length, 1);
});

test('예제 플러그인 로드 + config 검증', async () => {
  const types = await loadPlugins(['./examples/console-notifier.js']);
  assert.deepEqual(types, ['console']);
  const v = validateConfig({ plugins: ['./x'], notifiers: [{ type: 'console' }], watchers: [{ name: 'a', url: 'https://a.b', type: 'seats' }] });
  assert.equal(v.ok, true, v.errors.join());
});
