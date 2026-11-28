import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearQnetCache } from '../src/qnet-chain.js';
import { fakeNet, startUi, NOW, WEBHOOK, USER_ID, OPEN } from './helpers/ui-harness.js';
import { venueSeries, readHistoryTail, downsample } from '../src/ui/chart-data.js';

let net, ui, timers, realNow;
beforeEach(async () => {
  clearQnetCache();
  realNow = Date.now; Date.now = () => ui.clock.now; // 감시 엔진의 접수 기간 판정용 시계
  net = fakeNet();
  timers = [];
  ui = await startUi(net, { app: { setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } } });
  const { exams } = (await ui.call('/api/options/exams', {})).json();
  const ex = exams.find((e) => /107회/.test(e.name));
  await ui.call('/api/secrets', { webhook: WEBHOOK, mentionUsers: USER_ID });
  await ui.call('/api/settings', { intervalMin: 3, exam: ex.key, jongmok: '건축도장기능사', region: '서울특별시' });
  // 테스트 속도: 실제 Chrome 렌더링과 워처 사이 대기는 끈다 (표 이미지는 별도 테스트가 다룬다)
  const cfg = JSON.parse(fs.readFileSync(ui.file('config.json'), 'utf8'));
  delete cfg.tableImage; cfg.politeDelayMs = 0;
  fs.writeFileSync(ui.file('config.json'), JSON.stringify(cfg));
});
afterEach(() => { Date.now = realNow; ui.close(); });

const fire = async () => { timers.at(-1).fn(); await ui.watch.settled(); };

test('감시 시작/중지: 시작하면 확인하고, 상태표에 시험장/마지막·다음 확인 시각', async () => {
  const s = (await ui.call('/api/watch/start', {})).json();
  assert.equal(s.running, true);
  assert.equal(net.calls.filter((c) => c === 'rcv00303s03').length, 0); // 타이머가 울리기 전엔 요청 없음
  await fire();
  const st = (await ui.call('/api/status')).json();
  assert.equal(st.lastCheckAt, NOW);
  assert.ok(st.nextCheckAt > NOW + 2 * 60000 && st.nextCheckAt < NOW + 4 * 60000); // 3분 +-10%
  assert.equal(st.results[0].ok, true);
  assert.equal(st.results[0].available, 0);
  assert.equal(st.results[0].venues.length, 20); // fixture 2쪽 x 10곳 (서울 필터는 Q-Net 서버 쪽에서 적용)
  assert.equal(net.discord.length, 0); // 전부 마감: 알림 없음
  const stop = (await ui.call('/api/watch/stop', {})).json();
  assert.equal(stop.running, false);
  assert.equal(stop.nextCheckAt, null);
});

test('빈자리가 열리면 알림(멘션)이 한 번 나가고 기록에 시험장별 값이 남는다', async () => {
  await ui.call('/api/watch/start', {});
  await fire();
  net.venue = OPEN;
  ui.clock.now += 4 * 60000;
  await fire();
  assert.equal(net.discord.length, 1);
  assert.match(net.discord[0].body, new RegExp(`<@${USER_ID}>`));
  const h = (await ui.call('/api/history?hours=24')).json();
  assert.equal(h.watchers.length, 1);
  const open = h.watchers[0].venues.filter((v) => v.last > 0);
  assert.ok(open.length > 0);
  assert.equal(open[0].points[0][1], 0); assert.equal(open[0].points.at(-1)[1], 5);
  assert.equal(h.watchers[0].venues[0].last, 5); // 잔여가 있는 곳이 먼저
  assert.ok(!JSON.stringify(h).includes('SECRET'));
});

test('시작/중지를 반복해도 마지막 확인 후 60초 안에는 다시 요청하지 않는다', async () => {
  await ui.call('/api/watch/start', {});
  await fire();
  const n = net.calls.length;
  ui.clock.now += 5000;
  await ui.call('/api/watch/stop', {});
  await ui.call('/api/watch/start', {});
  assert.ok(timers.at(-1).ms >= 55000); // 즉시가 아니라 60초 뒤로 예약
  assert.equal(net.calls.length, n);
});

test('설정 없이/웹훅 없이 시작하면 이유를 알려 준다', async () => {
  fs.rmSync(ui.file('.env'));
  delete ui.env.QNET_DISCORD_WEBHOOK;
  const r = await ui.call('/api/watch/start', {});
  assert.equal(r.status, 409);
  assert.match(r.json().message, /알림 채널/);
});

test('확인 실패(Q-Net 503)는 상태에 오류로 보이고 비밀값은 없다', async () => {
  await ui.call('/api/watch/start', {});
  const orig = net.fetchImpl;
  net.fetchImpl = async (u, i) => (new URL(u).searchParams.get('id') === 'rcv00303s03' ? new Response('x', { status: 503 }) : orig(u, i));
  clearQnetCache();
  await fire();
  const st = (await ui.call('/api/status')).json();
  assert.equal(st.results[0].ok, false);
  assert.match(st.results[0].error, /503/);
  assert.ok(!JSON.stringify(st).includes('SECRET'));
});

test('chart-data: 구간 최댓값 축소, 시간 범위, 잘린 첫 줄/깨진 줄 무시', () => {
  const pts = Array.from({ length: 1000 }, (_, i) => [i, i === 500 ? 9 : 0]);
  const ds = downsample(pts, 0, 999, 100);
  assert.ok(ds.length <= 100 && ds.some((p) => p[1] === 9));
  const e = (t, id, open) => ({ t, id, name: 'n', venues: [['서울', '가', '2026-12-01', 10, open]] });
  const s = venueSeries([e(1000, 'a', 1), e(5000, 'a', 2), e(5000, 'b', 3), { t: 5000, id: 'a' }], ['a'], { hours: 1, now: 10000 });
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].venues[0].points, [[1000, 1], [5000, 2]]);
  const f = path.join(os.tmpdir(), `qsa-hist-${process.pid}.jsonl`);
  fs.writeFileSync(f, '{"t":1}\n{broken\n{"t":2,"id":"a"}\n');
  try { assert.deepEqual(readHistoryTail(f).map((x) => x.t), [1, 2]); } finally { fs.rmSync(f); }
});
