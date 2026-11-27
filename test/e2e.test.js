// 종단 간: 실제 CLI(bin/qnet-alert.js --once)를 자식 프로세스로 돌려 가짜 Q-Net 서버를 감시한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFakeQnet } from './helpers/fake-qnet.js';

const BIN = fileURLToPath(new URL('../bin/qnet-alert.js', import.meta.url));

// 플러그인은 CAPTURE_FILE 환경변수 경로에 알림 payload 를 JSONL 로 남긴다.
const CAPTURE_PLUGIN = [
  "import fs from 'node:fs';",
  "export default { type: 'capture', async send(n, p) { fs.appendFileSync(process.env.CAPTURE_FILE, JSON.stringify(p) + String.fromCharCode(10)); } };",
].join(String.fromCharCode(10));

function setup(url, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe2e-'));
  fs.writeFileSync(path.join(dir, 'capture.mjs'), CAPTURE_PLUGIN);
  const cfg = {
    plugins: ['./capture.mjs'], notifiers: [{ type: 'capture' }], statePath: path.join(dir, 'state.json'),
    historyPath: path.join(dir, 'history.jsonl'), politeDelayMs: 0,
    watchers: [{ name: '전기기능사 서울', type: 'seats', alertOn: 'open', url, include: ['서울'] }], ...extra,
  };
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify(cfg));
  // 서버가 같은 프로세스에 있으므로 spawnSync 가 아니라 비동기 spawn 이어야 한다.
  const run = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [BIN, '--once', '--config', file], { cwd: dir, env: { ...process.env, CAPTURE_FILE: path.join(dir, 'out.jsonl'), QNET_ENV: path.join(dir, 'none.env') } });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stderr }));
  });
  const sent = () => (fs.existsSync(path.join(dir, 'out.jsonl')) ? fs.readFileSync(path.join(dir, 'out.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : []);
  return { dir, run, sent, history: () => fs.readFileSync(path.join(dir, 'history.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) };
}

test('E2E: 마감 -> 열림 전환에서 한 번만 알리고, 계속 열려 있으면 조용하다', async () => {
  const fake = await startFakeQnet('table-full.html');
  try {
    const t = setup(fake.url);
    { const r0 = await t.run(); assert.equal(r0.status, 0, r0.stderr); }
    assert.equal(t.sent().length, 0); // 마감 상태

    fake.serve('table-open.html'); // 6석 열림
    const r2 = await t.run();
    assert.equal(r2.status, 0, r2.stderr);
    const alerts = t.sent();
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].title, /전기기능사 서울/);
    assert.equal(alerts[0].fields.find((f) => f.name === '빈자리')?.value, '6석');

    await t.run(); // 그대로 열림: 중복 알림 없음
    assert.equal(t.sent().length, 1);
    assert.equal(fake.state.requests.length, 3);
    assert.match(fake.state.requests[0].ua, /^qnet-seat-alert\//);
    assert.deepEqual(t.history().map((h) => h.available), [0, 6, 6]);
  } finally { await fake.close(); }
});

test('E2E: 서버 오류는 알림 없이 종료 코드 0, 복구 후 정상 동작', async () => {
  const fake = await startFakeQnet('table-full.html');
  try {
    const t = setup(fake.url, { failureAlertAfter: 0 });
    await t.run();
    fake.serve('table-open.html', 503);
    { const r0 = await t.run(); assert.equal(r0.status, 0, r0.stderr); }
    assert.equal(t.sent().length, 0);
    fake.serve('table-open.html');
    await t.run();
    assert.equal(t.sent().length, 1);
  } finally { await fake.close(); }
});
