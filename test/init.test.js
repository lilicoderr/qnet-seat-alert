import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { buildConfig, buildEnvExample, parseChannels, writeFiles, runInit } from '../src/init.js';
import { validateConfig } from '../src/validate.js';

const sink = () => new Writable({ write(_c, _e, cb) { cb(); } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-init-'));

test('buildConfig: 키워드 분리, 최소 간격, 선택 키 생략', () => {
  const c = buildConfig({ name: 'N', url: 'https://e.com', include: '서울, 전기기능사 ,', exclude: '마감', intervalMin: '1' });
  const w = c.watchers[0];
  assert.deepEqual(w.include, ['서울', '전기기능사']);
  assert.deepEqual(w.exclude, ['마감']);
  assert.equal(c.intervalMin, 1);
  assert.equal('linkUrl' in w, false);
  assert.equal('dateFrom' in w, false);
});

test('buildConfig: contains/regex 는 기본 needle/pattern 채움', () => {
  assert.equal(buildConfig({ url: 'https://e.com', type: 'contains' }).watchers[0].needle, '접수하기');
  assert.ok(buildConfig({ url: 'https://e.com', type: 'regex' }).watchers[0].pattern);
});

test('buildConfig 결과는 검증을 통과한다 (환경변수 채널 가정)', () => {
  const c = buildConfig({ url: 'https://e.com/page', name: 'N' });
  const v = validateConfig(c, { requireWebhook: false });
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.deepEqual(v.warnings, []);
});

test('설정에는 비밀값 키가 없다', () => {
  const s = JSON.stringify(buildConfig({ url: 'https://e.com' }));
  assert.doesNotMatch(s, /webhookUrl|token|notifiers/);
});

test('buildEnvExample / parseChannels', () => {
  const env = buildEnvExample(['telegram', 'discord']);
  assert.match(env, /QNET_TELEGRAM_TOKEN=\nQNET_TELEGRAM_CHAT=/);
  assert.match(env, /QNET_DISCORD_WEBHOOK=\n/);
  assert.doesNotMatch(env, /SLACK/);
  assert.deepEqual(parseChannels('Slack, telegram, bogus, slack'), ['slack', 'telegram']);
  assert.deepEqual(parseChannels(''), ['discord']);
});

test('writeFiles: 기존 파일은 --force 없으면 보존', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'config.json'), 'KEEP');
  const r = writeFiles(dir, { a: 1 }, 'X=\n');
  assert.deepEqual(r.skipped, ['config.json']);
  assert.deepEqual(r.written, ['.env.example']);
  assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), 'KEEP');
  const r2 = writeFiles(dir, { a: 1 }, 'X=\n', { force: true });
  assert.deepEqual(r2.written.sort(), ['.env.example', 'config.json']);
  fs.rmSync(dir, { recursive: true });
});

test('runInit: 스크립트 입력으로 두 파일 생성', async () => {
  const dir = tmp();
  const input = Readable.from(['내 감시\n', 'https://example.com/p\n', '\n', 'seats\n', '서울\n', '마감\n', 'open\n', '7\n', 'discord,slack\n']);
  const r = await runInit({ input, output: sink(), dir });
  assert.deepEqual(r.written.sort(), ['.env.example', 'config.json']);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.equal(cfg.watchers[0].name, '내 감시');
  assert.equal(cfg.intervalMin, 7);
  const env = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
  assert.match(env, /QNET_SLACK_WEBHOOK=/);
  fs.rmSync(dir, { recursive: true });
});

test('runInit: URL 없이 입력이 끝나면 중단', async () => {
  const dir = tmp();
  await assert.rejects(() => runInit({ input: Readable.from(['이름\n']), output: sink(), dir }), /URL/);
  assert.equal(fs.existsSync(path.join(dir, 'config.json')), false);
  fs.rmSync(dir, { recursive: true });
});
