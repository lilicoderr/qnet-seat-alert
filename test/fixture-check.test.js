import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFixture } from '../src/fixture-check.js';
import { runDoctor } from '../src/doctor-cmd.js';
import { runTest } from '../src/test-cmd.js';
import { real } from './helpers/real.js';

const FIX = fileURLToPath(new URL('./fixtures/real/rcv00301-2026-11-27.html', import.meta.url));
const cfg = { watchers: [{ name: '기능사 필기', type: 'newrows', pattern: '기능사.*필기', url: 'https://example.test/' }] };

test('checkFixture: 실제 목록에서 표/신호를 보고', () => {
  const items = checkFixture(cfg, real('rcv00301-2026-11-27.html'), { now: Date.parse('2026-11-27T06:03:00Z') });
  assert.ok(items.every((i) => i.level !== 'fail'));
  const text = items.map((i) => i.msg).join('\n');
  assert.match(text, /0 matching entries/);
  assert.match(text, /응시시험 \| 접수기간 \(header: 2026-11-27 15:03 KST\)/);
  assert.match(text, /2026년 상시 기능사 107회 실기/);
});

test('checkFixture: 표 없는 페이지는 fail', () => {
  assert.ok(checkFixture(cfg, '<html>x</html>').some((i) => i.level === 'fail'));
});

test('doctor/test --fixture: 네트워크·전송 없이 종료코드 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ ...cfg, webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abc-token' }));
  const lines = [];
  const noNet = () => { throw new Error('network must not be used'); };
  const prev = globalThis.fetch; globalThis.fetch = noNet;
  try {
    assert.equal(await runDoctor(['--config', file, '--fixture', FIX], { out: (s) => lines.push(s) }), 0);
    assert.equal(await runTest(['--config', file, '--fixture', FIX], { out: (s) => lines.push(s) }), 0);
  } finally { globalThis.fetch = prev; }
  assert.match(lines.join('\n'), /table image would show 2 row/);
});

test('doctor --fixture: qnet 워처도 단계별 fixture 로 오프라인 실행', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const file = path.join(dir, 'config.json');
  const q = { type: 'qnet', name: '건축도장', examPattern: '기능사', jongmok: '건축도장', url: 'https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301' };
  fs.writeFileSync(file, JSON.stringify({ webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abc-token', watchers: [q] }));
  const lines = [];
  assert.equal(await runDoctor(['--config', file, '--fixture', FIX], { out: (s) => lines.push(s) }), 0);
  assert.match(lines.join('\n'), /qnet chain ran offline .*지역 | 시험장 | 시험일자 | 정원 | 빈자리\| 시험장 \| 시험일자 \| 정원 \| 잔여/);
  fs.writeFileSync(file, JSON.stringify({ webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abc-token', watchers: [{ ...q, jongmok: '없는종목' }] }));
  assert.equal(await runDoctor(['--config', file, '--fixture', FIX], { out: (s) => lines.push(s) }), 1);
});
