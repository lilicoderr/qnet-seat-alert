// soak: 수백~수천 번의 1분 체크를 가짜 시계로 돌린다 (실제 요청/대기 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soak, prng, kst, USER } from './helpers/soak.js';
import { formatKst } from '../src/table.js';
import { qnetCacheSize } from '../src/qnet-chain.js';

const SEAT = /변화 감지/;
const FAIL = /감시 오류/;
const PARSER = /파서 오류/;

test('soak: 자정(KST)·재시작·점검·429/5xx·레이아웃 변경·접수 마감/재개를 지나도 변화당 알림 1통', async (t) => {
  const s = soak({ start: kst('2026-11-27T22:00:00') });
  t.after(s.cleanup);
  const seats = (n) => assert.equal(s.count(SEAT), n);
  const since = (from) => s.requests.length - from;

  await s.run(60); seats(0);
  await s.run(100, { seats: 3 }); seats(1);
  assert.match(formatKst(s.clock.t), /^2026-11-28 00:40$/);
  s.restart(); await s.run(30); seats(1);
  await s.run(10, { seats: 0 }); await s.run(10, { seats: 2 }); seats(2);

  let from = s.requests.length;
  await s.run(30, { mode: 'maintenance' });
  assert.equal(since(from), 30); // 점검 안내는 같은 체크에서 다시 요청하지 않는다
  assert.equal(s.count(FAIL), 1);
  await s.run(10, { mode: 'ok' }); seats(2);

  from = s.requests.length;
  await s.run(60, { mode: '429' });
  assert.ok(since(from) <= 8, `429 한 시간 동안 요청 ${since(from)}번`);
  assert.equal(s.count(FAIL), 2);
  await s.run(20, { mode: 'ok' }); seats(2);

  from = s.requests.length;
  await s.run(60, { mode: '500' });
  assert.ok(since(from) <= 24, `500 한 시간 동안 요청 ${since(from)}번`);
  await s.run(20, { mode: 'ok' }); seats(2);

  from = s.requests.length;
  await s.run(60, { mode: 'venuelayout' }); // 좌석 표만 바뀜: 정적 단계는 5분에 한 번까지만 다시
  assert.ok(since(from) <= 130, `레이아웃 변경 한 시간 동안 요청 ${since(from)}번`);
  assert.equal(s.count(PARSER), 1);
  await s.run(10, { mode: 'ok' }); seats(2);
  await s.run(40, { mode: 'layout' });
  assert.equal(s.count(PARSER), 2);
  await s.run(10, { mode: 'ok' }); seats(2);

  // 장애 중에 닫혔다가 복구 후 다시 열리면 새 알림
  await s.run(20, { mode: 'network', seats: 0 });
  await s.run(10, { mode: 'ok' }); await s.run(10, { seats: 5 }); seats(3);

  // Discord 가 죽은 동안 열린 자리는 복구되면 정확히 한 번 전달
  await s.run(10, { seats: 0 });
  await s.run(7, { seats: 4, discordDown: true }); seats(3);
  await s.run(10, { discordDown: false }); seats(4);

  // 접수 창 마감 -> 목록만 5분에 한 번 -> 재개
  s.server.window = { start: s.clock.t - 86400000, end: s.clock.t - 60000 };
  s.restart();
  from = s.requests.length;
  const closed = await s.run(60);
  assert.equal(closed.available, 0);
  assert.ok(since(from) <= 12, `접수 마감 한 시간 동안 요청 ${since(from)}번`);
  s.server.window = { start: s.clock.t + 20 * 60000, end: s.clock.t + 86400000 };
  await s.run(19); seats(4);
  await s.run(5); seats(5);

  assert.ok(s.posts.every((p) => !p.content.includes('<@')));
  assert.ok(qnetCacheSize() <= 3);
});

test('soak: 상태 파일과 캐시가 늘지 않는다 (600 체크)', async (t) => {
  const s = soak({ config: { rateLimit: { maxPerHour: 4 }, mentions: { users: [USER], cooldownMin: 5 } } });
  t.after(s.cleanup);
  const flip = async (n) => { for (let i = 0; i < n; i++) await s.run(1, { seats: i % 6 < 3 ? 0 : 2 }); };
  await flip(120);
  const early = s.stateBytes();
  await flip(480);
  assert.ok(s.stateBytes() <= early + 64, `${early} -> ${s.stateBytes()}`);
  assert.ok(qnetCacheSize() <= 3);
  assert.deepEqual(s.files(), ['state.json']);
  for (const p of s.posts) assert.ok(s.posts.filter((q) => q.at > p.at - 3600000 && q.at <= p.at).length <= 4);
});

const QUIET = { start: '23:00', end: '07:00', timezone: 'Asia/Seoul' };
const mentionSoak = (t, mentions) => {
  const s = soak({ start: kst('2026-11-27T22:30:00'), config: { quietHours: QUIET, mentions: { users: [USER], ...mentions } } });
  t.after(s.cleanup);
  const until = async (hhmm, change, day = '28') => {
    const end = kst(`2026-11-${day}T${hhmm}:00`);
    Object.assign(s.server, change);
    while (s.clock.t < end) await s.tick();
  };
  const sent = () => s.posts.map((p) => `${formatKst(p.at).slice(11)}${p.content.includes(`<@${USER}>`) ? '@' : ''}`);
  return { s, until, sent };
};

test('soak: 쿨다운 10분 + 조용한 시간 - 아침에는 겹치지 않고 한 통', async (t) => {
  const { s, until, sent } = mentionSoak(t, { cooldownMin: 10 });
  await until('23:00', { seats: 2 }, '27');
  assert.deepEqual(sent(), ['22:30@', '22:40@', '22:50@']);
  await until('03:00', {}); s.restart();
  await until('07:05', {});
  assert.deepEqual(sent().slice(3), ['07:00@']);
});

test('soak: 조용한 시간에 열렸다 닫힌 자리는 아침에 알리지 않는다', async (t) => {
  const { until, sent } = mentionSoak(t, {});
  await until('23:30', {}, '27');
  await until('02:00', { seats: 3 });
  await until('07:30', { seats: 0 });
  assert.deepEqual(sent(), []);
});

for (const whileAvailable of [true, false]) {
  test(`soak: 밤에 열려 아침까지 남은 자리는 07:00 에 정확히 한 통 (whileAvailable=${whileAvailable})`, async (t) => {
    const { until, sent } = mentionSoak(t, { whileAvailable, cooldownMin: 60 });
    await until('02:00', {});
    await until('07:30', { seats: 3 });
    assert.deepEqual(sent(), ['07:00@']);
  });
}

test('soak: 아침 전송이 실패해도 보류분은 남아 다음 체크에 전달', async (t) => {
  const { until, sent } = mentionSoak(t, { whileAvailable: false });
  await until('06:00', {});
  await until('06:30', { seats: 3 });
  await until('07:03', { discordDown: true });
  await until('07:30', { discordDown: false });
  assert.deepEqual(sent(), ['07:03@']);
});

for (const seed of [1, 7, 2026]) {
  test(`soak: 무작위 장애 1000 체크 - 관측된 변화마다 정확히 한 통 (seed ${seed})`, async (t) => {
    const s = soak();
    t.after(s.cleanup);
    const rand = prng(seed);
    const MODES = ['maintenance', '429', '500', 'layout', 'venuelayout', 'network'];
    let last = null; // 마지막으로 "처리를 마친" 좌석 수
    let expected = 0;
    for (let i = 0; i < 1000; i++) {
      if (rand() < 0.08) s.server.seats = rand() < 0.5 ? 0 : 1 + Math.floor(rand() * 9);
      if (rand() < 0.04) s.server.mode = MODES[Math.floor(rand() * MODES.length)];
      else if (rand() < 0.2) s.server.mode = 'ok';
      if (rand() < 0.03) s.server.discordDown = !s.server.discordDown;
      if (rand() < 0.02) s.restart();
      const r = await s.tick();
      if (r.ok && r.signal !== null) {
        if (s.server.mode === 'ok') assert.equal(r.signal, s.server.seats, `cycle ${i}`);
        const opened = r.signal > 0 && !(last > 0);
        if (opened && !s.server.discordDown) expected++;
        if (!opened || !s.server.discordDown) last = r.signal;
      }
      assert.equal(s.count(SEAT), expected, `cycle ${i} (${s.server.mode})`);
    }
    assert.ok(expected > 5);
    assert.ok(qnetCacheSize() <= 3);
    assert.ok(s.stateBytes() < 2000);
  });
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('soak: 현황표 이미지는 바뀔 때만(전송 실패분은 재전송), 좌석 알림의 빈도 제한 몫을 쓰지 않는다', async (t) => {
  const heads = [];
  const s = soak({
    config: { tableImage: {}, rateLimit: { maxPerHour: 2 } },
    renderImpl: async (_table, { checkedAt }) => { heads.push(formatKst(checkedAt)); return PNG; },
  });
  t.after(s.cleanup);
  const images = () => s.posts.filter((p) => p.attachments).length;
  await s.run(30); assert.equal(images(), 1);
  await s.run(5, { mode: 'ok', seats: 0, discordDown: true }); assert.equal(images(), 1);
  await s.run(70, { discordDown: false }); assert.equal(images(), 1);
  await s.run(10, { seats: 2 }); assert.equal(s.count(SEAT), 1); assert.equal(images(), 2);
  await s.run(1, { seats: 0, discordDown: true });
  await s.run(5, { discordDown: false }); assert.equal(images(), 3);
  assert.equal(heads.at(-1).length, 16);
});

test('soak: 다이제스트 모드에서도 열린 자리는 쿨다운에 맞춰 멘션', async (t) => {
  const watcher = { type: 'qnet', examPattern: '기능사', jongmok: '건축도장', maxPages: 1, url: 'https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301' };
  const s = soak({ config: { digest: true, mentions: { users: [USER], cooldownMin: 10 }, watchers: [{ ...watcher, name: 'a' }, { ...watcher, name: 'b' }] } });
  t.after(s.cleanup);
  await s.run(25, { seats: 2 });
  assert.equal(s.posts.length, 3);
  assert.ok(s.posts.every((p) => p.content === `<@${USER}>`));
});
