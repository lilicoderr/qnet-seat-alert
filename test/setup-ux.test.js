import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnoseEnvFiles } from '../src/doctor-cmd.js';
import { diagnoseMentions } from '../src/doctor.js';
import { runTest } from '../src/test-cmd.js';

const root = new URL('..', import.meta.url);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-ux-'));

test('doctor: .env 누락/.env.txt/값이 든 .env.example 을 알려 주고 값은 출력하지 않는다', () => {
  const dir = tmp();
  assert.match(diagnoseEnvFiles(dir, { env: {}, hasChannel: false })[0].msg, /copy \.env\.example \.env/);
  fs.writeFileSync(path.join(dir, '.env.txt'), '');
  assert.match(diagnoseEnvFiles(dir, { env: {}, hasChannel: false })[0].msg, /Rename-Item/);
  fs.writeFileSync(path.join(dir, '.env.example'), 'QNET_DISCORD_WEBHOOK=SECRETVALUE\n');
  const items = diagnoseEnvFiles(dir, { env: {}, hasChannel: true });
  assert.equal(items.length, 1);
  assert.ok(!items[0].msg.includes('SECRETVALUE'));
});

test('doctor: 형식이 틀린 멘션 ID(뒤에 주석 포함)를 경고하고 값은 숨긴다', () => {
  const items = diagnoseMentions({}, { QNET_MENTION_USERS: 'mynickname,123456789012345678   # me' });
  assert.equal(items[0].level, 'warn');
  assert.match(items[0].msg, /QNET_MENTION_USERS: 2개/);
  assert.ok(!items.some((i) => i.msg.includes('mynickname')));
});

test('test 명령은 설정한 멘션을 붙여 보낸다', async () => {
  const id = '1'.repeat(18); // 가짜
  let body;
  const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, status: 204, text: async () => '' }; };
  const env = { QNET_DISCORD_WEBHOOK: `https://discord.com/api/webhooks/${id}/fake`, QNET_MENTION_USERS: id };
  assert.equal(await runTest(['--config', path.join(tmp(), 'none.json'), '--channel', 'discord'], { out: () => {}, fetchImpl, env }), 0);
  assert.equal(body.content, `<@${id}>`);
  assert.deepEqual(body.allowed_mentions.users, [id]);
});

test('README 의 node 명령이 가리키는 파일이 있고, .env 예시에는 값 뒤 주석이 없다', () => {
  for (const f of ['README.md', 'README.ko.md']) {
    const text = fs.readFileSync(new URL(f, root), 'utf8');
    for (const [, file] of text.matchAll(/(?:^|\s|\.\\)((?:bin|scripts|test|deploy)[\\/][\w./\\-]+\.(?:js|html|ps1))/g)) {
      assert.ok(fs.existsSync(new URL(file.replaceAll('\\', '/'), root)), `${f}: ${file}`);
    }
    assert.ok(!/^QNET_\w+=\S*[ \t]+#/m.test(text), `${f}: inline comment`);
    assert.ok(!/^qnet-alert /m.test(text), `${f}: bare qnet-alert command (not on PATH after clone)`);
  }
});

test('start-watch.bat: CRLF, ASCII, 저장소 폴더에서 실행', () => {
  const bat = fs.readFileSync(new URL('start-watch.bat', root), 'latin1');
  assert.match(bat, /cd \/d "%~dp0"/);
  assert.ok(!/[^\x00-\x7f]/.test(bat));
  assert.match(fs.readFileSync(new URL('.gitattributes', root), 'utf8'), /\*\.bat text eol=crlf/);
});

test('CLI --dry 는 상태 파일을 만들지 않는다', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ statePath: 'state.json', watchers: [{ name: 'A', type: 'seats', url: 'http://127.0.0.1:1/x', enabled: true }] }));
  const preload = 'data:text/javascript,globalThis.fetch=async()=>new Response("<p>3 seats left</p>")';
  const bin = fileURLToPath(new URL('bin/qnet-alert.js', root));
  const r = spawnSync(process.execPath, ['--import', preload, bin, '--dry'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[A\]/);
  assert.equal(fs.existsSync(path.join(dir, 'state.json')), false);
});
