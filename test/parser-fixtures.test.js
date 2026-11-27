import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluate } from '../src/extract.js';
import { filterRows } from '../src/filter.js';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const seats = (name, w = {}) => evaluate({ type: 'seats', ...w }, filterRows(fx(name), w).text);

// 큐넷 레이아웃이 바뀌어도 알려진 표기들이 계속 읽히는지 고정해 두는 회귀 테스트.
test('fixture: 표(정원/접수인원) → 6석', () => assert.equal(seats('table-open.html').available, 6));
test('fixture: 마감 표 → 0석', () => assert.equal(seats('table-full.html').available, 0));
test('fixture: 잔여석 직접 표기', () => assert.equal(seats('remain-text.html').available, 7));
test('fixture: 접수 28 / 정원 30', () => assert.equal(seats('ratio.html').available, 2));
test('fixture: "30명 중 29명"', () => assert.equal(seats('mid.html').available, 1));
test('fixture: JSON 응답', () => {
  assert.equal(evaluate({ type: 'jsonseats' }, fx('seats.json')).available, 3);
});
test('fixture: include 필터가 해당 행만 남김', () => {
  assert.equal(seats('table-open.html', { include: ['서울', '전기기능사'] }).available, 6);
  assert.equal(seats('table-open.html', { include: ['부산'] }).signal, null);
});
test('fixture: 레이아웃이 바뀌면 신호가 null (조용히 0석이 아니라)', () => {
  assert.equal(seats('layout-changed.html').signal, null);
});

test('파서 오류 알림: 연속 N회 null 이면 한 번만, 복구 시 이전 신호와 비교', async () => {
  let body = fx('table-full.html');
  const sent = [];
  const fetchImpl = async (url, init) => {
    if (url.includes('hooks')) { sent.push(JSON.parse(init.body)); return { ok: true, status: 204, text: async () => '' }; }
    return { status: 200, text: async () => body };
  };
  const config = {
    parserAlertAfter: 2,
    notifiers: [{ type: 'webhook', url: 'https://example.com/hooks' }],
    watchers: [{ name: 'W', id: 'w', type: 'seats', url: 'https://x.io/p' }],
  };
  const store = memoryStore();
  await runOnce(config, { store, fetchImpl }); // 0석 기준
  body = fx('layout-changed.html');
  await runOnce(config, { store, fetchImpl });
  assert.equal(sent.length, 0);
  await runOnce(config, { store, fetchImpl });
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /파서 오류/);
  await runOnce(config, { store, fetchImpl });
  assert.equal(sent.length, 1, '한 번만');
  body = fx('table-open.html'); // 복구: 이전 0석 → 6석 = 열림
  await runOnce(config, { store, fetchImpl });
  assert.equal(sent.length, 2);
  assert.match(sent[1].title, /변화 감지/);
});
