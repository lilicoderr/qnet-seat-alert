import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveNotifiers, validateNotifier, sendTo, notifyAll, buildSlackBody, buildTelegramBody, notifiersFromEnv,
} from '../src/notify.js';

const DISCORD = 'https://discord.com/api/webhooks/123456/abc-DEF_1';
const SLACK = 'https://hooks.slack.com/services/T000/B000/XXXX';
const payload = { title: '제목', description: '설명', url: 'https://q-net.or.kr/', fields: [{ name: '빈자리', value: '3석' }] };

function fakeFetch(status = 200) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('', { status }); };
  f.calls = calls;
  return f;
}

test('notifiersFromEnv: 환경변수 → 채널 목록', () => {
  const l = notifiersFromEnv({ QNET_SLACK_WEBHOOK: SLACK, QNET_TELEGRAM_TOKEN: 't', QNET_TELEGRAM_CHAT: '1' });
  assert.deepEqual(l.map((n) => n.type), ['slack', 'telegram']);
});

test('resolveNotifiers: 구버전 webhookUrl 은 discord, 워처 지정이 우선', () => {
  assert.equal(resolveNotifiers({ webhookUrl: DISCORD }, {}, {})[0].type, 'discord');
  const own = resolveNotifiers({ webhookUrl: DISCORD }, { webhookUrl: 'https://discord.com/api/webhooks/9/z' }, {});
  assert.equal(own.length, 1);
  assert.match(own[0].url, /webhooks\/9/);
});

test('validateNotifier: 형식 검사', () => {
  assert.equal(validateNotifier({ type: 'slack', url: SLACK }), null);
  assert.match(validateNotifier({ type: 'slack', url: 'https://evil.example/x' }), /slack/);
  assert.match(validateNotifier({ type: 'telegram', token: 't' }), /chatId/);
  assert.match(validateNotifier({ type: 'nope' }), /알 수 없는/);
});

test('sendTo: slack / telegram / webhook 페이로드', async () => {
  const f = fakeFetch();
  await sendTo({ type: 'slack', url: SLACK }, payload, { fetchImpl: f });
  assert.equal(f.calls[0].body.blocks[0].type, 'header');
  await sendTo({ type: 'telegram', token: 'TOK', chatId: '42' }, payload, { fetchImpl: f });
  assert.match(f.calls[1].url, /api\.telegram\.org\/botTOK\/sendMessage/);
  assert.equal(f.calls[1].body.chat_id, '42');
  await sendTo({ type: 'webhook', url: 'https://example.com/hook' }, payload, { fetchImpl: f });
  assert.equal(f.calls[2].body.source, 'qnet-seat-alert');
});

test('notifyAll: 일부 실패해도 나머지 전송, 비밀값은 로그에서 제거', async () => {
  const f = async (url) => {
    if (url.includes('telegram')) throw new Error(`boom ${url}`);
    return new Response('', { status: 200 });
  };
  const r = await notifyAll(
    [{ type: 'slack', url: SLACK }, { type: 'telegram', token: 'SECRETTOKEN', chatId: '1' }],
    payload, { fetchImpl: f },
  );
  assert.equal(r.delivered, 1);
  assert.equal(r.errors.length, 1);
  assert.ok(!r.errors[0].includes('SECRETTOKEN'));
});

test('build 바디: 슬랙 버튼/텔레그램 길이 제한', () => {
  assert.equal(buildSlackBody(payload).blocks.at(-2).type, 'actions');
  assert.ok(buildTelegramBody('1', { title: 'x'.repeat(9000) }).text.length <= 4000);
});
