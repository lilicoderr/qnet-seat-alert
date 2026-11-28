import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clearQnetCache } from '../src/qnet-chain.js';
import { fakeNet, startUi, NOW, WEBHOOK, USER_ID, OPEN } from './helpers/ui-harness.js';

let net, ui;
beforeEach(async () => { clearQnetCache(); net = fakeNet(); ui = await startUi(net); });
afterEach(() => ui.close());

const select = async () => {
  const { exams } = (await ui.call('/api/options/exams', {})).json();
  const exam = exams[0].key;
  const { jongmok } = (await ui.call('/api/options/jongmok', { exam })).json();
  const { regions } = (await ui.call('/api/options/regions', { exam, jongmok: jongmok[0] })).json();
  return { exam, jongmok, regions };
};

test('선택 목록: 접수 중 시험 -> 종목 -> 지역 (저장된 fixture), 로그인/접수 호출 없음', async () => {
  const s = await select();
  assert.deepEqual(s.jongmok, ['건축도장기능사', '방수기능사']);
  assert.ok(s.regions.includes('서울특별시'));
  assert.deepEqual(net.calls, ['rcv00301', 'rcv00302', 'rcv00303']);
  const list = (await ui.call('/api/options/exams', {})).json();
  assert.equal(list.exams.length, 2); // 107회·24회 모두 접수 기간 안
  assert.equal(net.calls.length, 3); // 두 번째 목록은 캐시: 요청 없음
});

test('선택 목록: 알 수 없는 시험/종목/지역은 거부하고 Q-Net 에 임의 값을 보내지 않는다', async () => {
  const s = await select();
  const n = net.calls.length;
  assert.equal((await ui.call('/api/options/jongmok', { exam: 'nope' })).status, 400);
  assert.equal((await ui.call('/api/options/regions', { exam: s.exam, jongmok: '../../x' })).status, 400);
  assert.equal((await ui.call('/api/settings', { intervalMin: 3, exam: s.exam, jongmok: s.jongmok[0], region: '화성' })).status, 400);
  assert.equal(net.calls.length, n);
});

test('Q-Net 장애 후에는 잠시 쉬고 다시 요청하지 않는다', async () => {
  const bad = fakeNet();
  const orig = bad.fetchImpl;
  bad.fetchImpl = async (u, i) => (new URL(u).searchParams.get('id') === 'rcv00301' ? new Response('x', { status: 503 }) : orig(u, i));
  const u2 = await startUi(bad);
  try {
    assert.equal((await u2.call('/api/options/exams', {})).status, 502);
    const n = bad.calls.length;
    const again = await u2.call('/api/options/exams', {});
    assert.equal(again.status, 429);
    assert.equal(bad.calls.length, n);
  } finally { u2.close(); }
});

test('설정 저장: config.json 에 선택/간격만, 비밀값 없음. 1분 미만/비정상 간격은 거부', async () => {
  const s = await select();
  for (const v of [0, 0.5, -1, 'x', null, 1441, NaN]) assert.equal((await ui.call('/api/settings', { intervalMin: v, exam: s.exam, jongmok: s.jongmok[0], region: '서울특별시' })).status, 400, String(v));
  assert.equal(fs.existsSync(ui.file('config.json')), false);
  const r = await ui.call('/api/settings', { intervalMin: 3, exam: s.exam, jongmok: s.jongmok[0], region: '서울특별시' });
  assert.equal(r.status, 200);
  const cfg = JSON.parse(fs.readFileSync(ui.file('config.json'), 'utf8'));
  assert.equal(cfg.intervalMin, 3);
  assert.equal(cfg.watchers[0].type, 'qnet');
  assert.equal(cfg.watchers[0].jongmok, '건축도장기능사');
  assert.equal(cfg.watchers[0].region, '서울특별시');
  assert.ok(cfg.historyPath);
  assert.doesNotMatch(JSON.stringify(cfg), /webhook|token|mention/i);
  const { validateConfig } = await import('../src/validate.js');
  assert.equal(validateConfig(cfg, { requireWebhook: false }).ok, true);
  assert.equal(r.json().cost.perCheckTypical, 1); // 지역 지정: 보통 1요청
});

test('요청 비용: 간격과 지역에 따라 계산', async () => {
  const c1 = (await ui.call('/api/cost', { intervalMin: 1, region: '서울특별시' })).json();
  const c2 = (await ui.call('/api/cost', { intervalMin: 10, region: '' })).json();
  assert.equal(c1.perCheckTypical, 1);
  assert.equal(c1.perHourTypical, 68); // 60회 + 정적 단계 4x2
  assert.equal(c2.perCheckTypical, 2);
  assert.ok(c2.perHourTypical < c1.perHourTypical);
  assert.equal((await ui.call('/api/cost', { intervalMin: 0.2 })).status, 400);
});
