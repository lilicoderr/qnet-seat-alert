// 가용성 이력(JSONL): 한 줄에 한 번의 측정. `qnet-alert stats` 가 읽어서 요약한다.

import fs from 'node:fs';
import path from 'node:path';

export function appendHistory(file, results, now = Date.now()) {
  const lines = results
    .filter((r) => r.ok)
    .map((r) => JSON.stringify({ t: now, id: r.id, name: r.name, available: r.available ?? null, signal: r.signal ?? null }));
  if (!lines.length) return 0;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.appendFileSync(file, lines.join('\n') + '\n', 'utf8');
  return lines.length;
}

export function readHistory(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 깨진 줄은 건너뜀 */ }
  }
  return out;
}

const BARS = '▁▂▃▄▅▆▇█';

export function sparkline(values, width = 40) {
  let v = values.filter((x) => typeof x === 'number');
  if (!v.length) return '';
  if (v.length > width) { // 균등 샘플링으로 폭에 맞춤
    v = Array.from({ length: width }, (_, i) => v[Math.floor((i * v.length) / width)]);
  }
  const max = Math.max(...v);
  return v.map((x) => (x <= 0 ? BARS[0] : BARS[Math.min(7, Math.ceil((x / max) * 7))])).join('');
}

export function summarize(entries, { sinceMs = 0, now = Date.now() } = {}) {
  const by = new Map();
  for (const e of entries) {
    if (e.t < now - sinceMs && sinceMs) continue;
    if (!by.has(e.id)) by.set(e.id, { id: e.id, name: e.name || e.id, points: [] });
    by.get(e.id).points.push(e);
  }
  return [...by.values()].map((w) => {
    const nums = w.points.map((p) => p.available).filter((x) => typeof x === 'number');
    const openCount = nums.filter((x) => x > 0).length;
    return {
      id: w.id, name: w.name, samples: w.points.length,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      last: nums.length ? nums[nums.length - 1] : null,
      openPct: nums.length ? Math.round((openCount / nums.length) * 100) : null,
      series: nums,
    };
  });
}

export function formatStats(summary, width = 40) {
  if (!summary.length) return '이력이 없습니다. config 에 "historyPath" 를 지정하고 감시를 돌려 보세요.';
  return summary.map((s) => [
    `${s.name}  (${s.samples}회 측정)`,
    s.series.length
      ? `  ${sparkline(s.series, width)}  최소 ${s.min} · 최대 ${s.max} · 최근 ${s.last} · 빈자리 있던 비율 ${s.openPct}%`
      : '  (좌석 수치 없음 — contains/regex 워처)',
  ].join('\n')).join('\n');
}
