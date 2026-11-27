// 종단 간: 가짜 Q-Net 서버를 감시하면서 Discord 웹훅 POST 를 가로챈다. 체크당 메시지 1통(이미지 첨부, 멘션 1회).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { startFakeQnet } from './helpers/fake-qnet.js';

const WH = 'https://discord.com/api/webhooks/123456789012345678/abc-token';
const USER = '111111111111111111';
const ROLE = '222222222222222222';
const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const T0 = Date.parse('2026-11-27T05:00:00Z'); // 14:00 KST

async function scenario(extra, steps = 3) {
  const fake = await startFakeQnet('table-open.html');
  const posts = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('discord.com')) { posts.push({ url, init }); return { ok: true, status: 204, text: async () => '' }; }
    return globalThis.fetch(url, init);
  };
  const config = {
    webhookUrl: WH, politeDelayMs: 0, mentions: { users: [USER], roles: [ROLE] }, tableImage: { every: true }, ...extra,
    watchers: [{ name: '전기기능사 서울', type: 'seats', alertOn: 'open', url: fake.url, include: ['서울'] }],
  };
  const store = memoryStore();
  try {
    for (let i = 0; i < steps; i++) await runOnce(config, { store, fetchImpl, now: () => T0 + i * 60000, renderImpl: async () => FAKE_PNG });
  } finally { await fake.close(); }
  return posts.map((p) => ({ form: p.init.body, body: p.init.body instanceof FormData ? JSON.parse(p.init.body.get('payload_json')) : null }));
}

const pings = (b) => (b.content.match(/<@&?\d+>/g) || []).length;

test('체크 3번, 빈자리+멘션: POST 3번, 각각 이미지 첨부 + 멘션 정확히 1회', async () => {
  const posts = await scenario({});
  assert.equal(posts.length, 3);
  for (const { form, body } of posts) {
    assert.ok(form instanceof FormData);
    assert.equal(form.get('files[0]').type, 'image/png');
    assert.equal(body.embeds[0].image.url, 'attachment://qnet-status.png');
    assert.equal(body.content, `<@${USER}> <@&${ROLE}>`);
    assert.equal(pings(body), 2); // 사용자 1 + 역할 1, 각 ID 는 한 번씩
    assert.deepEqual(body.allowed_mentions, { parse: [], users: [USER], roles: [ROLE] });
  }
});

test('cooldownMin 2: 1·3번째만 핑, 이미지는 3번 모두 (every)', async () => {
  const posts = await scenario({ mentions: { users: [USER], cooldownMin: 2 } });
  assert.equal(posts.length, 3);
  assert.deepEqual(posts.map((p) => pings(p.body)), [1, 0, 1]);
  assert.ok(posts.every((p) => p.form.get('files[0]')));
  assert.deepEqual(posts[1].body.allowed_mentions, { parse: [], users: [], roles: [] });
  assert.ok(!posts[1].body.embeds); // 알림 없는 체크: 이미지 전용 메시지
});

test('조용한 시간: POST 0번 (이미지 포함)', async () => {
  const posts = await scenario({ quietHours: { start: '13:00', end: '15:00', timezone: 'Asia/Seoul' } });
  assert.equal(posts.length, 0);
});

test('rateLimit 는 합친 메시지에 적용된다', async () => {
  const posts = await scenario({ rateLimit: { maxPerHour: 2 } });
  assert.equal(posts.length, 2);
});
