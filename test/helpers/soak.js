// 결정적(deterministic) soak 환경: 가짜 Q-Net + 가짜 Discord + 가짜 시계. 실제 네트워크 요청은 없다.
// 좌석 숫자는 정리된 실제 fixture 의 첫 "마감" 칸을 바꿔 넣은 합성 값이다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { real } from './real.js';
import { runOnce } from '../../src/engine.js';
import { createStore } from '../../src/store.js';
import { clearQnetCache } from '../../src/qnet-chain.js';

export const kst = (s) => Date.parse(`${s}+09:00`);
export const USER = '111111111111111111';
const WH = 'https://discord.com/api/webhooks/123456789012345678/abc-token';
const CELL = "<font color='blue'>마감</font><br />(작업형)";
const LIST = real('rcv00301-2026-11-27.html');
const FORM = real('rcv00302-schfrm.html');
const FILTERS = real('rcv00303-filters.html');
const VENUE = real('rcv00303s03-closed.html');
const JSON_BYTES = fs.readFileSync(new URL('../fixtures/real/rcv00303s02.euckr.json', import.meta.url));

const koDate = (ms) => {
  const d = new Date(ms + 9 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(월) ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const listPage = ({ start, end }) => LIST.replace(/\d{4}년 \d+월 \d+일\(.\) \d\d:\d\d ~ \d{4}년 \d+월 \d+일\(.\) \d\d:\d\d/g, `${koDate(start)} ~ ${koDate(end)}`);

export function soak({ start = kst('2026-11-27T12:00:00'), config = {}, renderImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnet-soak-'));
  const file = path.join(dir, 'state.json');
  // mode: ok | maintenance | 429 | 500 | layout | network
  const server = { mode: 'ok', seats: 0, window: { start: start - 86400000, end: start + 30 * 86400000 }, discordDown: false };
  const clock = { t: start };
  const requests = [];
  const posts = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith(WH)) {
      if (server.discordDown) return new Response('down', { status: 502 });
      posts.push({ at: clock.t, ...JSON.parse(typeof init.body === 'string' ? init.body : init.body.get('payload_json')) });
      return new Response(null, { status: 204 });
    }
    const id = new URL(url).searchParams.get('id');
    requests.push({ at: clock.t, id });
    if (server.mode === 'network') throw new Error('fetch failed');
    if (server.mode === '429' || server.mode === '500') return new Response('x', { status: Number(server.mode) });
    if (server.mode === 'maintenance') return new Response('<html><body>시스템 점검 중입니다.</body></html>');
    if (server.mode === 'venuelayout' && id === 'rcv00303s03') return new Response('<table><tr><td>new</td></tr></table>');
    if (server.mode === 'layout') return new Response('<html><body><div>new design</div></body></html>');
    if (id === 'rcv00303s02') return new Response(JSON_BYTES, { headers: { 'content-type': 'application/x-json;charset=EUC-KR' } });
    const venue = server.seats > 0 ? VENUE.replace(CELL, String(server.seats)) : VENUE;
    return new Response({ rcv00301: listPage(server.window), rcv00302: FORM, rcv00303: FILTERS, rcv00303s03: venue }[id]);
  };
  const cfg = {
    webhookUrl: WH, politeDelayMs: 0,
    watchers: [{ name: '건축도장', type: 'qnet', examPattern: '기능사', jongmok: '건축도장', maxPages: 1, url: 'https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301' }],
    ...config,
  };
  let store;
  const restart = () => { clearQnetCache(); store = createStore(file); };
  restart();
  // 1분 간격 체크 한 번
  const tick = async () => {
    const realNow = Date.now;
    Date.now = () => clock.t;
    try {
      const [r] = await runOnce(cfg, { store, fetchImpl, now: () => clock.t, sleepImpl: async () => {}, renderImpl });
      return r;
    } finally {
      Date.now = realNow;
      clock.t += 60000;
    }
  };
  const run = async (n, change = {}) => {
    Object.assign(server, change);
    let r;
    for (let i = 0; i < n; i++) r = await tick();
    return r;
  };
  // 알림 임베드의 종류별 개수
  const count = (re) => posts.filter((p) => re.test(p.embeds?.[0]?.title || '')).length;
  return {
    server, clock, requests, posts, tick, run, restart, count,
    get store() { return store; },
    stateBytes: () => fs.statSync(file).size,
    files: () => fs.readdirSync(dir),
    cleanup: () => { clearQnetCache(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// 시드 고정 난수 (mulberry32)
export function prng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
