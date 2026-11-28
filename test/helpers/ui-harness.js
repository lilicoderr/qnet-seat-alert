// 웹 UI 테스트용: 가짜 Q-Net(저장된 fixture) + 가짜 Discord. 실제 네트워크는 쓰지 않는다.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { real } from './real.js';
import { createUiApp } from '../../src/ui/app.js';
import { listenUi } from '../../src/ui/server.js';

export const NOW = Date.parse('2026-11-27T06:30:00Z'); // 15:30 KST, 107회 접수 중
export const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/SECRET_webhook-token_abc';
export const USER_ID = '987654321098765432';
const bytes = (n) => fs.readFileSync(new URL(`../fixtures/real/${n}`, import.meta.url));
export const OPEN = real('rcv00303s03-closed.html').replaceAll('<font color=\'blue\'>마감</font><br />(작업형)', '5');

export function fakeNet(venue = real('rcv00303s03-closed.html')) {
  const net = { calls: [], discord: [], venue, discordStatus: 204 };
  net.fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'discord.com') {
      net.discord.push({ url: String(url), body: typeof init.body === 'string' ? init.body : '[form]' });
      return new Response(null, { status: net.discordStatus });
    }
    if (u.hostname !== 'www.q-net.or.kr') throw new Error(`unexpected host ${u.hostname}`);
    const id = u.searchParams.get('id');
    net.calls.push(id);
    if (id === 'rcv00303s02') return new Response(bytes('rcv00303s02.euckr.json'), { headers: { 'content-type': 'application/x-json;charset=EUC-KR' } });
    const html = { rcv00301: real('rcv00301-2026-11-27.html'), rcv00302: real('rcv00302-schfrm.html'), rcv00303: real('rcv00303-filters.html'), rcv00303s03: net.venue }[id];
    if (html === undefined) throw new Error(`forbidden Q-Net call ${id}`);
    return new Response(html, { status: 200 });
  };
  return net;
}

export async function startUi(net = fakeNet(), extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-ui-'));
  const clock = { now: NOW };
  // 감시 엔진은 process.env 에서 채널을 읽는다: 테스트가 끝나면 원래대로 되돌린다
  const keys = ['QNET_DISCORD_WEBHOOK', 'QNET_MENTION_USERS'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  const env = process.env;
  const app = createUiApp({
    configFile: path.join(dir, 'config.json'), envFile: path.join(dir, '.env'), cwd: dir, env, fetchImpl: (...a) => net.fetchImpl(...a),
    now: () => clock.now, sleep: async () => {}, runDeps: { sleepImpl: async () => {} }, setTimer: () => 0, ...extra.app,
  });
  await listenUi(app.server, 0);
  const port = app.server.address().port;
  const call = (p, body, { headers = {} } = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path: p, method: data === undefined ? 'GET' : 'POST', agent: false, headers: {
      'x-qnet-token': app.server.uiToken, ...(data === undefined ? {} : { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }), ...headers } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: t, json: () => JSON.parse(t) }));
    });
    r.on('error', reject);
    r.end(data);
  });
  const close = () => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } app.server.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { ...app, dir, env, clock, call, close, port, file: (n) => path.join(dir, n) };
}
