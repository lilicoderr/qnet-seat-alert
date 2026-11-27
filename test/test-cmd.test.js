import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTest, selectChannels } from '../src/test-cmd.js';
import { redactAll } from '../src/redact.js';

const DISCORD = 'https://discord.com/api/webhooks/' + '111111111111111111/DISCORDSECRET';
const SLACK = 'https://hooks.slack.com/services/' + 'TAAAAAAA/BBBBBBB/SLACKSECRET';
const TG = { type: 'telegram', token: '123456789:TELEGRAMTOKENTELEGRAMTOKEN', chatId: '42' };

function cfgFile(extra = {}) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qt-')), 'config.json');
  fs.writeFileSync(f, JSON.stringify({ notifiers: [{ type: 'discord', url: DISCORD }, { type: 'slack', url: SLACK }, TG], watchers: [], ...extra }));
  return f;
}
const collect = () => { const lines = []; return { lines, out: (s) => lines.push(s) }; };

test('selectChannels: type 또는 type#N', () => {
  const n = [{ type: 'discord' }, { type: 'discord' }, { type: 'slack' }];
  assert.equal(selectChannels(n, 'discord').length, 2);
  assert.equal(selectChannels(n, 'discord#2').length, 1);
  assert.equal(selectChannels(n, undefined).length, 3);
  assert.equal(selectChannels(n, 'ntfy').length, 0);
});

test('--channel 로 고른 채널에만 보낸다', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); return { ok: true, status: 204, text: async () => '' }; };
  const { lines, out } = collect();
  const code = await runTest(['--config', cfgFile(), '--channel', 'slack'], { out, fetchImpl, env: {} });
  assert.equal(code, 0);
  assert.deepEqual(urls, [SLACK]);
  assert.deepEqual(lines, ['[ OK ] slack#1']);
});

test('실패 메시지에서 URL/토큰이 지워진다', async () => {
  const fetchImpl = async (u) => ({ ok: false, status: 401, text: async () => `bad ${u} token ${TG.token}` });
  const { lines, out } = collect();
  const code = await runTest(['--config', cfgFile()], { out, fetchImpl, env: {} });
  const all = lines.join('\n');
  assert.equal(code, 1);
  for (const secret of ['DISCORDSECRET', 'SLACKSECRET', 'TELEGRAMTOKEN']) assert.ok(!all.includes(secret), secret);
  assert.match(all, /\[FAIL\] discord#1/);
});

test('--dry 는 전송하지 않고, 없는 채널은 안내한다', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 204, text: async () => '' }; };
  const a = collect();
  assert.equal(await runTest(['--config', cfgFile(), '--dry'], { out: a.out, fetchImpl, env: {} }), 0);
  assert.equal(calls, 0);
  assert.ok(!a.lines.join('').includes('SECRET'));
  const b = collect();
  assert.equal(await runTest(['--config', cfgFile(), '--channel', 'ntfy'], { out: b.out, fetchImpl, env: {} }), 1);
  assert.match(b.lines[0], /Available: discord#1, slack#1, telegram#1/);
});

test('redactAll: 패턴 기반으로도 지운다', () => {
  assert.equal(redactAll(`x ${DISCORD} y`), 'x *** y');
  assert.equal(redactAll('POST /bot123456:' + 'A'.repeat(30) + '/sendMessage'), 'POST ***/sendMessage');
  assert.equal(redactAll('Authorization: Bearer abc.def'), 'Authorization: ***');
});
