import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, hasAllKeys, langOf, usernameOf } from '../src/i18n.js';
import { buildAlertPayload } from '../src/engine.js';
import { decide } from '../src/watcher.js';
import { buildHeartbeatPayload } from '../src/heartbeat.js';
import { buildDigestPayload } from '../src/digest.js';
import { validateConfig } from '../src/validate.js';

test('영어 사전에 모든 키가 있다', () => assert.equal(hasAllKeys('en'), true));
test('t: 치환, 모르는 언어는 ko, 모르는 키는 키 그대로', () => {
  assert.equal(t('en', 'decide.available', { n: 3 }), '3 seats open');
  assert.equal(t('xx', 'decide.available', { n: 3 }), '빈자리 3석');
  assert.equal(t('en', 'nope.key'), 'nope.key');
  assert.equal(langOf({ lang: 'fr' }), 'ko');
  assert.equal(usernameOf({ lang: 'en' }), 'Q-Net seat alert');
  assert.equal(usernameOf({ username: 'X' }), 'X');
});
test('알림 페이로드/판정 사유가 영어로 나온다', () => {
  const w = { name: 'Elec', url: 'https://q.net' };
  const r = { available: 4, reason: 'x', detail: { applied: 26, capacity: 30 } };
  const p = buildAlertPayload(w, r, { lang: 'en' });
  assert.equal(p.title, '🔔 Elec: change detected');
  assert.equal(p.fields[0].name, 'Seats open');
  assert.equal(p.linkLabel, 'Open Q-Net');
  assert.equal(buildAlertPayload(w, r, {}).title, '🔔 Elec 변화 감지');
  assert.match(decide({ signal: 0 }, { kind: 'seats', signal: 4 }, {}, 'en').reason, /Seats opened: 4 \(was 0\)/);
  assert.match(decide(null, { kind: 'seats', signal: 4 }, {}).reason, /미확인/);
});
test('하트비트/다이제스트 영어, lang 검증', () => {
  assert.match(buildHeartbeatPayload([], 7200000, 'en').description, /up 2 h/);
  assert.match(buildDigestPayload([{ watcher: { name: 'A' }, r: { available: 2, reason: 'r' } }], 'en').description, /2 seats/);
  const base = { notifiers: [{ type: 'webhook', url: 'https://a.b/c' }], watchers: [{ name: 'a', url: 'https://a.b', type: 'seats' }] };
  assert.equal(validateConfig({ ...base, lang: 'en' }).ok, true);
  assert.equal(validateConfig({ ...base, lang: 'jp' }).ok, false);
});
