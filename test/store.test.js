import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, memoryStore } from '../src/store.js';

function tmpFile(name = 'state.json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-'));
  return { dir, file: path.join(dir, name) };
}

test('createStore: set 후 새 인스턴스에서 복원', () => {
  const { dir, file } = tmpFile();
  const a = createStore(file);
  a.set('w1', { signal: 3, kind: 'seats' });
  const b = createStore(file);
  assert.equal(b.get('w1').signal, 3);
  assert.ok(b.get('w1').at > 0);
  fs.rmSync(dir, { recursive: true });
});

test('createStore: 없는 파일/깨진 JSON 은 빈 상태로 시작', () => {
  const { dir, file } = tmpFile();
  assert.deepEqual(createStore(file).all(), {});
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(createStore(file).all(), {});
  fs.rmSync(dir, { recursive: true });
});

test('createStore: 없는 디렉터리도 만들어 저장', () => {
  const { dir } = tmpFile();
  const file = path.join(dir, 'nested', 'deep', 'state.json');
  const s = createStore(file);
  s.set('x', { signal: 1 });
  assert.ok(fs.existsSync(file));
  fs.rmSync(dir, { recursive: true });
});

test('createStore: get 은 없으면 null, all 은 복사본', () => {
  const { dir, file } = tmpFile();
  const s = createStore(file);
  assert.equal(s.get('nope'), null);
  s.set('a', { signal: 1 });
  const snap = s.all();
  snap.a.signal = 99;
  assert.equal(s.get('a').signal, 1);
  fs.rmSync(dir, { recursive: true });
});

test('createStore: 쓰기 실패해도 메모리 캐시 유지 (throw 안 함)', () => {
  const { dir } = tmpFile();
  // 파일 경로 자리에 디렉터리를 두면 writeFileSync 가 실패한다
  const file = path.join(dir, 'blocked');
  fs.mkdirSync(file);
  const s = createStore(file);
  const origErr = console.error;
  console.error = () => {};
  try {
    s.set('a', { signal: 5 });
  } finally {
    console.error = origErr;
  }
  assert.equal(s.get('a').signal, 5);
  fs.rmSync(dir, { recursive: true });
});

test('memoryStore: 기본 동작', () => {
  const s = memoryStore();
  assert.equal(s.get('a'), null);
  s.set('a', { signal: 2 });
  assert.equal(s.get('a').signal, 2);
  assert.deepEqual(Object.keys(s.all()), ['a']);
});
