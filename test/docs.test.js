import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig, TOP_KEYS, WATCHER_KEYS } from '../src/validate.js';

const root = new URL('..', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root), 'utf8');

test('config.example.json 은 검증을 통과하고 경고도 없다', () => {
  const cfg = JSON.parse(read('config.example.json'));
  const v = validateConfig(cfg);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.deepEqual(v.warnings, []);
});

test('README(영/한)가 모든 최상위 설정 키를 문서화한다', () => {
  const undocumented = ['$schema', 'comment', 'notifiers', 'webhookUrl', 'username', 'watchers'];
  for (const file of ['README.md', 'README.ko.md']) {
    const text = read(file);
    for (const key of TOP_KEYS.filter((k) => !undocumented.includes(k))) {
      assert.ok(text.includes(`\`${key}\``), `${file} 에 \`${key}\` 설명이 없습니다`);
    }
  }
});

test('영어/한국어 README 가 서로 링크한다', () => {
  assert.match(read('README.md'), /\(README\.ko\.md\)/);
  assert.match(read('README.ko.md'), /\(README\.md\)/);
});

test('.gitignore 가 config.json/.env/state.json 을 제외한다 (비밀값 보호)', () => {
  const lines = read('.gitignore').split(/\r?\n/).map((l) => l.trim());
  for (const f of ['.env', 'config.json', 'state.json']) assert.ok(lines.includes(f), `${f} 누락`);
});

test('.env.example 에는 값이 채워져 있지 않다', () => {
  for (const line of read('.env.example').split(/\r?\n/)) {
    if (/^QNET_\w+=/.test(line)) assert.match(line, /=$/, `비밀값이 들어 있을 수 있음: ${line.split('=')[0]}`);
  }
});

test('deploy 파일이 있고 비밀값이 들어 있지 않다', () => {
  for (const f of ['deploy/qnet-alert.service', 'deploy/ecosystem.config.cjs', 'deploy/windows-task.ps1', 'docs/deploy.md']) {
    const t = read(f);
    assert.ok(t.length > 50, f);
    assert.ok(!/discord(app)?\.com\/api\/webhooks\/\d|hooks\.slack\.com\/services\/T/.test(t), `${f} 에 웹훅 URL`);
  }
  assert.match(read('deploy/qnet-alert.service'), /ExecReload=.*HUP/);
});

test('JSON Schema 가 검증기의 키 목록과 일치하고 예제가 힌트를 가진다', () => {
  const schema = JSON.parse(read('schemas/config.schema.json'));
  assert.deepEqual(Object.keys(schema.properties).sort(), [...TOP_KEYS].sort());
  assert.deepEqual(Object.keys(schema.definitions.watcher.properties).sort(), [...WATCHER_KEYS].sort());
  assert.equal(JSON.parse(read('config.example.json')).$schema, './schemas/config.schema.json');
});

test('docker 워크플로: 태그에서만, GITHUB_TOKEN 외 비밀값 없음, 테스트 선행', () => {
  const y = read('.github/workflows/docker.yml');
  assert.match(y, /tags: \['v\*\.\*\.\*'\]/);
  assert.match(y, /ghcr\.io/);
  assert.match(y, /node --test/);
  const secrets = [...y.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(secrets)], ['GITHUB_TOKEN']);
});
