import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCron, matchesCron, isDue } from '../src/cron.js';
import { memoryStore } from '../src/store.js';
import { runOnce } from '../src/engine.js';

// 로컬 시간 기준 (2026-03-02 는 월요일)
const at = (h, mi, d = 2) => new Date(2026, 2, d, h, mi);

test('parseCron: 목록/범위/간격/와일드카드', () => {
  const c = parseCron('*/15 9-17 * * 1-5');
  assert.deepEqual([...c.minute], [0, 15, 30, 45]);
  assert.equal(c.hour.size, 9);
  assert.deepEqual([...parseCron('0 0 1,15 * *').dom], [1, 15]);
  assert.deepEqual([...parseCron('5/20 * * * *').minute], [5, 25, 45]);
  assert.ok(parseCron('0 0 * * 7').dow.has(0));
});

test('parseCron: 잘못된 식은 이유와 함께 거부', () => {
  for (const bad of ['', '* * * *', '60 * * * *', '* 24 * * *', '*/0 * * * *', 'a b c d e', '5-1 * * * *', '* * 0 * *']) {
    assert.throws(() => parseCron(bad), /cron/, bad);
  }
});

test('matchesCron: 평일 업무시간', () => {
  const c = parseCron('0,30 9-17 * * 1-5');
  assert.ok(matchesCron(c, at(9, 30)));
  assert.ok(!matchesCron(c, at(9, 31)));
  assert.ok(!matchesCron(c, at(18, 0)));
  assert.ok(!matchesCron(c, at(10, 0, 1))); // 일요일
});

test('matchesCron: dom 과 dow 가 모두 제한되면 OR', () => {
  const c = parseCron('0 0 15 * 1');
  assert.ok(matchesCron(c, at(0, 0, 2))); // 월요일
  assert.ok(matchesCron(c, at(0, 0, 15))); // 15일
  assert.ok(!matchesCron(c, at(0, 0, 3)));
});

test('isDue: 마지막 실행 이후 맞는 분이 있어야 한다', () => {
  const t = (h, m) => at(h, m).getTime();
  assert.equal(isDue('*/10 * * * *', t(9, 0), t(9, 5)), false);
  assert.equal(isDue('*/10 * * * *', t(9, 0), t(9, 11)), true);
  assert.equal(isDue('*/10 * * * *', null, t(9, 3)), false); // 첫 실행: 이 분만 확인
  assert.equal(isDue('*/10 * * * *', null, t(9, 10)), true);
  assert.equal(isDue('* 9-18 * * *', t(8, 0), t(8, 30)), false);
});

test('engine: schedule 이 맞지 않는 워처는 건너뛴다', async () => {
  const store = memoryStore();
  let fetched = 0;
  const fetchImpl = async () => { fetched++; return { status: 200, text: async () => '잔여 3석', ok: true }; };
  const cfg = { notifiers: [], watchers: [
    { name: 'night', type: 'seats', url: 'https://x.test/', schedule: '0 3 * * *' },
    { name: 'always', type: 'seats', url: 'https://x.test/b' },
  ] };
  const now = at(12, 0).getTime();
  const res = await runOnce(cfg, { store, fetchImpl, now: () => now });
  assert.equal(fetched, 1);
  assert.deepEqual(res.map((r) => r.name), ['always']);
});
