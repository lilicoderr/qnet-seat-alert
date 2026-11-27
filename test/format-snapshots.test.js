import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscordBody } from '../src/discord.js';
import { buildSlackBody } from '../src/notify.js';
import { matchSnapshot } from './snapshot-util.js';

const NOW = new Date('2026-12-01T03:00:00.000Z');
const open = {
  title: '🎯 전기기능사 서울 — 3석', description: '0 → 3석으로 늘었습니다.', url: 'https://example.test/status',
  color: 0x2b8a3e, linkLabel: 'Q-Net 열기', content: '<@123456789012345678>',
  fields: [{ name: '잔여석', value: '3석', inline: true }, { name: '신청/정원', value: '27/30', inline: true }],
};
const plain = { title: 'Test', description: 'hello' };

test('Discord 임베드 스냅샷: 좌석 열림', () => matchSnapshot('discord-open', buildDiscordBody(open, { now: NOW })));
test('Discord 임베드 스냅샷: 최소 payload', () => matchSnapshot('discord-plain', buildDiscordBody(plain, { now: NOW })));
test('Slack 블록 스냅샷: 좌석 열림', () => matchSnapshot('slack-open', buildSlackBody(open)));
test('Slack 블록 스냅샷: 최소 payload', () => matchSnapshot('slack-plain', buildSlackBody(plain)));

test('길이 제한과 안전한 멘션 설정', () => {
  const d = buildDiscordBody({ title: 'x'.repeat(500), description: 'y'.repeat(9000), fields: Array.from({ length: 40 }, (_, i) => ({ name: `n${i}`, value: 'v'.repeat(2000) })) }, { now: NOW });
  assert.equal(d.embeds[0].title.length, 256);
  assert.equal(d.embeds[0].description.length, 4000);
  assert.equal(d.embeds[0].fields.length, 25);
  assert.equal(d.embeds[0].fields[0].value.length, 1024);
  assert.deepEqual(d.allowed_mentions, { parse: [], users: [], roles: [] }); // @everyone 제외
  const s = buildSlackBody({ title: 'x'.repeat(500), fields: Array.from({ length: 30 }, () => ({ name: 'a', value: 'b' })) });
  assert.equal(s.blocks[0].text.text.length, 150);
  assert.equal(s.blocks[1].fields.length, 10);
});
