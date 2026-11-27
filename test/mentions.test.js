import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentionsFromConfig, discordMentionText, allowedMentionsFor, mentionDue, validateMentions } from '../src/mentions.js';
import { buildDiscordBody } from '../src/discord.js';
import { buildSlackBody } from '../src/notify.js';
import { runOnce, buildAlertPayload } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { matchSnapshot } from './snapshot-util.js';

const U = '123456789012345678';
const R = '345678901234567890';
const NOW = new Date('2026-12-01T03:00:00.000Z');
const cfg = { mentions: { users: [U], roles: [R], slack: ['U0123ABCD'] } };

test('mentionsFromConfig: 설정 + 환경변수 병합, 잘못된 ID 제외', () => {
  const m = mentionsFromConfig(cfg, { QNET_MENTION_USERS: `${U}, 999888777666555444, not-an-id`, QNET_MENTION_SLACK: 'u123,W9ZZZ' });
  assert.deepEqual(m.users, [U, '999888777666555444']);
  assert.deepEqual(m.roles, [R]);
  assert.deepEqual(m.slack, ['U0123ABCD', 'W9ZZZ']);
  assert.equal(mentionsFromConfig({}, {}).any, false);
});

test('Discord 멘션 골든: content 와 allowed_mentions (everyone/here 차단)', () => {
  const payload = { title: 'T', description: 'd', mentions: mentionsFromConfig(cfg, {}), content: '@everyone <@999888777666555444>' };
  const body = buildDiscordBody(payload, { now: NOW });
  assert.equal(body.content, `<@${U}> <@&${R}> @everyone <@999888777666555444>`);
  assert.deepEqual(body.allowed_mentions, { parse: [], users: [U, '999888777666555444'], roles: [R] });
  matchSnapshot('discord-mention', body);
  assert.deepEqual(allowedMentionsFor('@everyone @here'), { parse: [], users: [], roles: [] });
});

test('Slack 멘션 골든', () => {
  const body = buildSlackBody({ title: 'T', description: 'd', mentions: mentionsFromConfig(cfg, {}) });
  assert.equal(body.blocks[1].text.text, '<@U0123ABCD>');
  matchSnapshot('slack-mention', body);
});

test('쿨다운: 0 이면 매 체크, N분이면 간격 적용', () => {
  const store = memoryStore();
  assert.equal(mentionDue({ cooldownMin: 0 }, store, 'a', 1000), true);
  store.set('__mention:a', { last: 1 });
  assert.equal(mentionDue({ cooldownMin: 10 }, store, 'a', 5 * 60000), false);
  assert.equal(mentionDue({ cooldownMin: 10 }, store, 'a', 1 + 10 * 60000), true);
});

test('엔진: 빈자리가 계속 보이면 매 체크 멘션, 닫히면 멘션 없음, 쿨다운 반영', async () => {
  const sent = [];
  let open = true;
  const fetchImpl = async (u, o) => {
    if (u.startsWith('https://discord')) { sent.push(JSON.parse(o.body)); return { ok: true, status: 204 }; }
    return { status: 200, text: async () => (open ? '잔여 3석' : '잔여 0석') };
  };
  const hook = 'https://discord.com/api/webhooks/' + '1/abc';
  const base = { notifiers: [{ type: 'discord', url: hook }], watchers: [{ name: 'A', type: 'seats', url: 'https://q.test/' }] };
  const store = memoryStore();
  let t = 1_000_000;
  const run = (config) => runOnce(config, { store, fetchImpl, now: () => t });
  await run({ ...base, ...cfg });
  t += 60000; await run({ ...base, ...cfg });
  assert.equal(sent.length, 2); // 전환 + 계속 열림
  assert.ok(sent.every((b) => b.content.includes(`<@${U}>`)));
  assert.match(sent[1].embeds[0].description, /계속 열려 있음/);
  open = false; t += 60000; await run({ ...base, ...cfg });
  assert.equal(sent.length, 2);
  open = true; t += 60000;
  const cool = { ...base, mentions: { ...cfg.mentions, cooldownMin: 10 } };
  await run(cool); // 닫혔다 열림(전환) → 알림
  const n = sent.length;
  t += 60000; await run(cool); // 쿨다운 중
  assert.equal(sent.length, n);
  t += 10 * 60000; await run(cool);
  assert.equal(sent.length, n + 1);
  t += 60000; await run(base); // mentions 없는 설정은 기존 동작(전환 때만)
  assert.equal(sent.length, n + 1);
});

test('mentions 없으면 payload 에도 없고, 닫힘 알림은 멘션하지 않는다', () => {
  assert.equal(buildAlertPayload({ name: 'A', url: 'https://x/' }, { available: 0, reason: 'r' }, cfg).mentions, undefined);
  assert.equal(discordMentionText(undefined), '');
});

test('validateMentions: ID 형식과 옵션 검증', () => {
  const errs = [];
  const warns = [];
  validateMentions({ mentions: { users: ['abc'], roles: 'x', slack: ['lowercase'], cooldownMin: -1, foo: 1 } }, errs, warns);
  assert.equal(errs.length, 4);
  assert.match(warns[0], /foo/);
  const ok = [];
  validateMentions(cfg, ok, []);
  assert.deepEqual(ok, []);
});
