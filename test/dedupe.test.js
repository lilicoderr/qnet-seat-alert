import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOnce } from '../src/engine.js';
import { createStore } from '../src/store.js';

// 매 호출마다 다음 본문을 돌려주는 가짜 fetch + 전송 횟수 기록
function scripted(bodies) {
  let i = 0;
  const sent = [];
  const fetchImpl = async (url, init) => {
    if (url.includes('example.com/page')) {
      return { status: 200, ok: true, text: async () => bodies[Math.min(i++, bodies.length - 1)] };
    }
    sent.push(JSON.parse(init.body));
    return { status: 200, ok: true, text: async () => '' };
  };
  return { fetchImpl, sent };
}

const config = {
  notifiers: [{ type: 'webhook', url: 'https://example.com/hook' }],
  watchers: [{ name: 'W', type: 'seats', alertOn: 'open', url: 'https://example.com/page' }],
};

test('0 → 3 열림은 한 번만 알리고, 계속 열려 있으면 재알림하지 않는다', async () => {
  const { fetchImpl, sent } = scripted(['잔여 0석', '잔여 3석', '잔여 3석', '잔여 2석']);
  const store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-')), 's.json'));
  for (let i = 0; i < 4; i++) await runOnce(config, { store, fetchImpl });
  assert.equal(sent.length, 1);
  assert.match(sent[0].description, /3석/);
});

test('닫혔다 다시 열리면 다시 알린다', async () => {
  const { fetchImpl, sent } = scripted(['잔여 2석', '잔여 0석', '잔여 4석']);
  const store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-')), 's.json'));
  for (let i = 0; i < 3; i++) await runOnce(config, { store, fetchImpl });
  assert.equal(sent.length, 2);
});

test('프로세스를 재시작해도(상태 파일 복원) 이미 알린 열림은 중복 알림하지 않는다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-'));
  const file = path.join(dir, 's.json');
  const run1 = scripted(['잔여 0석', '잔여 5석']);
  const s1 = createStore(file);
  await runOnce(config, { store: s1, fetchImpl: run1.fetchImpl });
  await runOnce(config, { store: s1, fetchImpl: run1.fetchImpl });
  assert.equal(run1.sent.length, 1);

  // "재시작": 새 스토어 인스턴스, 여전히 5석
  const run2 = scripted(['잔여 5석']);
  await runOnce(config, { store: createStore(file), fetchImpl: run2.fetchImpl });
  assert.equal(run2.sent.length, 0);
  fs.rmSync(dir, { recursive: true });
});

test('dry 모드는 알림을 보내지 않는다', async () => {
  const { fetchImpl, sent } = scripted(['잔여 9석']);
  const store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-')), 's.json'));
  const res = await runOnce(config, { store, fetchImpl, dry: true });
  assert.equal(sent.length, 0);
  assert.equal(res[0].shouldAlert, true);
  assert.equal(res[0].dry, true);
});

test('enabled:false 워처는 건너뛴다', async () => {
  const { fetchImpl, sent } = scripted(['잔여 9석']);
  const cfg = { ...config, watchers: [{ ...config.watchers[0], enabled: false }] };
  const res = await runOnce(cfg, { store: createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-')), 's.json')), fetchImpl });
  assert.equal(res.length, 0);
  assert.equal(sent.length, 0);
});
