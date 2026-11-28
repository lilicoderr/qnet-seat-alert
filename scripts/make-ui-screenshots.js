// docs/ui-*.png 를 만든다: 저장된 fixture 와 가짜 Discord 로 UI 를 띄우고 헤드리스 Chrome/Edge 로 찍는다.
// 실제 q-net.or.kr 요청은 없고, 그래프의 시간별 값은 결정적으로 만든 "샘플 데이터"다 (화면에도 그렇게 표시된다).
//   node scripts/make-ui-screenshots.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findChrome } from '../src/render.js';
import { parseVenueTable } from '../src/qnet-seats.js';
import { rowsToHtml } from '../src/qnet-chain.js';
import { qnetVenues } from '../src/extract.js';
import { fakeNet, startUi, NOW, WEBHOOK, USER_ID } from '../test/helpers/ui-harness.js';
import { real } from '../test/helpers/real.js';

const chrome = findChrome();
if (!chrome) throw new Error('Chrome/Edge 를 찾지 못했습니다 (QNET_CHROME 로 지정).');
process.env.QNET_UI_SAMPLE = '1';
Date.now = () => NOW;

// 닫힌 fixture 의 앞 3곳을 열린 것으로 바꾼 가상의 표 (SYNTHETIC)
let n = 0;
const base = real('rcv00303s03-closed.html');
const venueHtml = base.replace(/<font color='blue'>마감<\/font><br \/>\(작업형\)/g, () => (n++ < 3 ? String([7, 3, 12][n - 1]) : '마감 (작업형)'));
const timers = [];
const net = fakeNet(venueHtml);
const ui = await startUi(net, { app: { setTimer: (fn, ms) => timers.push({ fn, ms }) } });
try {
  const { exams } = (await ui.call('/api/options/exams', {})).json();
  const exam = exams.find((e) => /107회/.test(e.name)).key;
  await ui.call('/api/options/jongmok', { exam });
  await ui.call('/api/options/regions', { exam, jongmok: '건축도장기능사' });
  await ui.call('/api/secrets', { webhook: WEBHOOK, mentionUsers: USER_ID });
  await ui.call('/api/settings', { intervalMin: 3, exam, jongmok: '건축도장기능사', region: '' });
  const cfg = JSON.parse(fs.readFileSync(ui.file('config.json'), 'utf8'));
  delete cfg.tableImage; cfg.politeDelayMs = 0;
  fs.writeFileSync(ui.file('config.json'), JSON.stringify(cfg));
  // 샘플 이력: 24시간, 10분 간격, 세 곳에서 잠깐씩 자리가 났다가 사라짐
  const rows = qnetVenues(rowsToHtml(parseVenueTable(venueHtml).rows)); // 감시가 기록하는 이름과 같은 형식
  const id = cfg.watchers[0].id;
  const lines = [];
  for (let t = NOW - 24 * 3600000; t < NOW - 10 * 60000; t += 10 * 60000) {
    const k = Math.round((t - (NOW - 24 * 3600000)) / 600000);
    const venues = rows.map((r, i) => {
      const burst = [[40, 52, 4], [97, 108, 9], [100, 104, 6]][i];
      const open = burst && k >= burst[0] && k <= burst[1] ? Math.max(0, burst[2] - Math.floor((k - burst[0]) / 4)) : 0;
      return [r.region, r.place, r.date, r.capacity, i < 3 ? open : 0];
    });
    lines.push(JSON.stringify({ t, id, name: cfg.watchers[0].name, available: venues.reduce((a, v) => a + v[4], 0), venues }));
  }
  fs.writeFileSync(ui.file('history.jsonl'), `${lines.join('\n')}\n`);
  await ui.call('/api/watch/start', {});
  timers.at(-1).fn();
  await ui.watch.settled();
  const out = path.resolve(import.meta.dirname, '../docs');
  const url = `http://127.0.0.1:${ui.port}/#t=${ui.server.uiToken}`;
  // 서버가 같은 프로세스이므로 이벤트 루프를 막지 않게 비동기로 실행한다
  const shot = (name, w, h) => promisify(execFile)(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-shot-'))}`,
    `--window-size=${w},${h}`, '--virtual-time-budget=6000', '--force-device-scale-factor=1', `--screenshot=${path.join(out, name)}`, url], { timeout: 90000, windowsHide: true });
  await shot('ui-setup.png', 1000, 2900);
  await shot('ui-mobile.png', 420, 4300);
  console.log('docs/ui-setup.png, docs/ui-mobile.png');
} finally { ui.close(); }
