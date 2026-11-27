import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReloader, createWaker } from '../src/reload.js';

function setup(initial) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qr-')), 'c.json');
  fs.writeFileSync(f, JSON.stringify(initial));
  const validate = (c) => (c.ok === false ? { ok: false, errors: ['bad'], warnings: [] } : { ok: true, errors: [], warnings: [] });
  return { f, r: createReloader({ file: f, initial, validate }) };
}
const bump = (f, v) => {
  fs.writeFileSync(f, JSON.stringify(v));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(f, t, t);
};

test('파일이 바뀌면 새 설정을 적용', async () => {
  const { f, r } = setup({ n: 1 });
  assert.equal((await r.check()).changed, false);
  bump(f, { n: 2 });
  assert.equal(r.dirty(), true);
  const x = await r.check();
  assert.equal(x.changed, true);
  assert.equal(r.config.n, 2);
  assert.equal(r.dirty(), false);
});

test('잘못된 설정/깨진 JSON 은 이전 설정 유지', async () => {
  const { f, r } = setup({ n: 1 });
  bump(f, { n: 2, ok: false });
  let x = await r.check();
  assert.deepEqual(x.errors, ['bad']);
  assert.equal(r.config.n, 1);
  fs.writeFileSync(f, '{oops');
  x = await r.check({ force: true });
  assert.match(x.errors[0], /다시 읽기 실패/);
  assert.equal(r.config.n, 1);
});

test('force(SIGHUP) 는 mtime 이 같아도 다시 읽는다', async () => {
  const { f, r } = setup({ n: 1 });
  fs.writeFileSync(f, JSON.stringify({ n: 3 }));
  fs.utimesSync(f, new Date(0), new Date(0));
  assert.equal((await r.check({ force: true })).changed, true);
  assert.equal(r.config.n, 3);
});

test('waker: wake() 로 즉시 깨어남', async () => {
  const w = createWaker();
  const p = w.sleep(60000);
  w.wake();
  assert.equal(await p, true);
  assert.equal(await w.sleep(5), false);
});
