import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clearQnetCache } from '../src/qnet-chain.js';
import { fakeNet, startUi, WEBHOOK, USER_ID } from './helpers/ui-harness.js';
import { updateEnvText } from '../src/ui/settings.js';

let net, ui;
beforeEach(async () => { clearQnetCache(); net = fakeNet(); ui = await startUi(net); });
afterEach(() => ui.close());

const TOKEN_PART = 'SECRET_webhook-token_abc';
const save = (b) => ui.call('/api/secrets', b);

test('비밀값: .env 에만 저장, 응답은 "저장됨"과 개수뿐 (값을 되돌려 주지 않음)', async () => {
  const r = await save({ webhook: WEBHOOK, mentionUsers: `${USER_ID}, 111111111111111111` });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json(), { webhookSet: true, mentionCount: 2 });
  assert.ok(!r.text.includes(TOKEN_PART) && !r.text.includes(USER_ID));
  const env = fs.readFileSync(ui.file('.env'), 'utf8');
  assert.match(env, new RegExp(`QNET_DISCORD_WEBHOOK=${WEBHOOK}`));
  assert.match(env, /QNET_MENTION_USERS=987654321098765432,111111111111111111/);
  assert.ok(!fs.existsSync(ui.file('config.json')));
  // 이후 어떤 조회에도 값이 없다
  for (const p of ['/api/state', '/api/status', '/api/history']) {
    const g = await ui.call(p);
    assert.ok(!g.text.includes(TOKEN_PART) && !g.text.includes(USER_ID), p);
  }
});

test('잘못된 값은 거부하고, 오류 메시지에 입력값을 담지 않는다', async () => {
  for (const b of [{ webhook: 'http://discord.com/api/webhooks/1/x' }, { webhook: 'https://evil.example/api/webhooks/123/abc' }, { webhook: `https://discord.com/api/webhooks/123/abc\nQNET_X=1` }, { mentionUsers: 'nickname' }, { mentionUsers: '12345' }]) {
    const r = await save(b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.ok(!r.text.includes('nickname') && !r.text.includes('evil.example'));
  }
  assert.ok(!fs.existsSync(ui.file('.env')));
});

test('.env 갱신: 다른 줄/주석은 보존, 키는 중복 없이 한 번, 빈 값은 그대로 둠', async () => {
  fs.writeFileSync(ui.file('.env'), '# 메모\nQNET_SLACK_WEBHOOK=keep\nQNET_MENTION_USERS=222222222222222222\n');
  await save({ webhook: WEBHOOK });
  await save({ webhook: '', mentionUsers: '' });
  const env = fs.readFileSync(ui.file('.env'), 'utf8');
  assert.match(env, /^# 메모\nQNET_SLACK_WEBHOOK=keep\nQNET_MENTION_USERS=222222222222222222\nQNET_DISCORD_WEBHOOK=/);
  assert.equal(updateEnvText('A=1\nA=2\n', { A: 'x' }), 'A=x\n');
  await save({ clearWebhook: true });
  assert.match(fs.readFileSync(ui.file('.env'), 'utf8'), /QNET_DISCORD_WEBHOOK=\n/);
  assert.equal((await ui.call('/api/state')).json().secrets.webhookSet, false);
});

test('테스트 알림: 저장된 웹훅으로 전송(멘션 포함), 응답/로그에 웹훅 없음, 연타 제한', async () => {
  const none = await ui.call('/api/test-alert', {});
  assert.equal(none.status, 409);
  await save({ webhook: WEBHOOK, mentionUsers: USER_ID });
  const r = await ui.call('/api/test-alert', {});
  assert.equal(r.status, 200);
  assert.equal(r.json().delivered, 1);
  assert.equal(net.discord.length, 1);
  assert.equal(net.discord[0].url, WEBHOOK);
  assert.match(net.discord[0].body, new RegExp(`<@${USER_ID}>`));
  assert.ok(!r.text.includes(TOKEN_PART));
  assert.equal((await ui.call('/api/test-alert', {})).status, 429);
  assert.equal(net.discord.length, 1);
  ui.clock.now += 11000;
  net.discordStatus = 500;
  const bad = await ui.call('/api/test-alert', {});
  assert.equal(bad.json().delivered, 0);
  assert.ok(!bad.text.includes(TOKEN_PART));
});
