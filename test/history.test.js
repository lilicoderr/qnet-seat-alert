import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendHistory, readHistory, sparkline, summarize, formatStats } from '../src/history.js';
import { runStats } from '../src/stats-cmd.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qh-')), 'h.jsonl');

test('append/read: 실패한 결과는 기록하지 않고 깨진 줄은 무시', () => {
  const f = tmp();
  appendHistory(f, [{ ok: true, id: 'a', name: 'A', available: 3 }, { ok: false, id: 'b' }], 1000);
  fs.appendFileSync(f, '{broken\n');
  const h = readHistory(f);
  assert.equal(h.length, 1);
  assert.equal(h[0].available, 3);
  assert.deepEqual(readHistory('nope.jsonl'), []);
});

test('sparkline: 0 은 최저 막대, 최대는 풀 막대, 폭 제한', () => {
  assert.equal(sparkline([0, 4, 8]), '▁▅█');
  assert.equal(sparkline([]), '');
  assert.equal(sparkline(Array.from({ length: 100 }, (_, i) => i), 10).length, 10);
});

test('summarize: 기간 필터와 통계', () => {
  const e = [
    { t: 100, id: 'a', available: 0 }, { t: 5000, id: 'a', available: 2 }, { t: 6000, id: 'a', available: 0 },
  ];
  const s = summarize(e, { sinceMs: 2000, now: 6500 });
  assert.equal(s[0].samples, 2);
  assert.equal(s[0].openPct, 50);
  assert.match(formatStats(s), /최소 0 · 최대 2/);
  assert.match(formatStats([]), /이력이 없습니다/);
});

test('stats 명령: config 의 historyPath 를 읽는다', async () => {
  const f = tmp();
  appendHistory(f, [{ ok: true, id: 'a', name: 'A', available: 1 }]);
  const cfg = f + '.config.json';
  fs.writeFileSync(cfg, JSON.stringify({ historyPath: f }));
  let text = '';
  const s = await runStats(['--config', cfg], { out: (t) => { text = t; } });
  assert.equal(s.length, 1);
  assert.match(text, /A/);
});
