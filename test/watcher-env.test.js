import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decide } from '../src/watcher.js';
import { loadEnvFile } from '../src/env.js';

test('decide: 신호 없음이면 알림 없음', () => {
  assert.equal(decide({ signal: 1 }, { kind: 'seats', signal: null }, {}).alert, false);
  assert.equal(decide(null, { kind: 'seats', signal: undefined }, {}).alert, false);
});

test('decide available: 0 초과면 매번 알림', () => {
  const w = { alertOn: 'available' };
  assert.equal(decide({ signal: 2 }, { kind: 'seats', signal: 2 }, w).alert, true);
  assert.equal(decide({ signal: 2 }, { kind: 'seats', signal: 0 }, w).alert, false);
});

test('decide change: 첫 관측은 알리지 않음', () => {
  assert.equal(decide(null, { kind: 'seats', signal: 4 }, { alertOn: 'change' }).alert, false);
});

test('decide contains: absent / change 모드', () => {
  const absent = { needle: 'x', alertWhen: 'absent' };
  assert.equal(decide({ signal: 'present' }, { kind: 'contains', signal: 'absent' }, absent).alert, true);
  assert.equal(decide({ signal: 'absent' }, { kind: 'contains', signal: 'absent' }, absent).alert, false);
  assert.equal(decide(null, { kind: 'contains', signal: 'absent' }, absent).alert, true);
  const ch = { needle: 'x', alertWhen: 'change' };
  assert.equal(decide({ signal: 'present' }, { kind: 'contains', signal: 'absent' }, ch).alert, true);
  assert.equal(decide(null, { kind: 'contains', signal: 'absent' }, ch).alert, false);
});

test('decide regex: 값이 바뀔 때만', () => {
  assert.equal(decide({ signal: '7' }, { kind: 'regex', signal: '8' }, {}).alert, true);
  assert.equal(decide({ signal: '7' }, { kind: 'regex', signal: '7' }, {}).alert, false);
  assert.equal(decide(null, { kind: 'regex', signal: '7' }, {}).alert, false);
});

test('decide: 알 수 없는 kind', () => {
  assert.equal(decide({ signal: 1 }, { kind: 'zzz', signal: 1 }, {}).alert, false);
});

test('loadEnvFile: 값 로드, 기존 환경변수 우선, 따옴표/주석 처리', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, '# comment\nQSA_T_A=hello\nQSA_T_B="quoted value"\nQSA_T_C=\nQSA_T_KEEP=fromfile\n');
  process.env.QSA_T_KEEP = 'fromenv';
  try {
    loadEnvFile(file);
    assert.equal(process.env.QSA_T_A, 'hello');
    assert.equal(process.env.QSA_T_B, 'quoted value');
    assert.equal(process.env.QSA_T_KEEP, 'fromenv');
  } finally {
    for (const k of ['QSA_T_A', 'QSA_T_B', 'QSA_T_C', 'QSA_T_KEEP']) delete process.env[k];
    fs.rmSync(dir, { recursive: true });
  }
});

test('loadEnvFile: 파일이 없으면 조용히 무시', () => {
  assert.doesNotThrow(() => loadEnvFile(path.join(os.tmpdir(), 'definitely-missing.env')));
});
