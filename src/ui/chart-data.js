// JSONL 이력 -> 시험장별 그래프 데이터. 파일이 커져도 끝부분만 읽는다.
import fs from 'node:fs';

export const TAIL_BYTES = 8 * 1024 * 1024;
export const MAX_POINTS = 240;

export function readHistoryTail(file, maxBytes = TAIL_BYTES) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return []; }
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // 잘린 첫 줄
    const out = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      try { out.push(JSON.parse(l)); } catch { /* 깨진 줄은 건너뜀 */ }
    }
    return out;
  } finally { fs.closeSync(fd); }
}

// 구간별 최댓값으로 줄인다: 잠깐 열렸던 자리가 그래프에서 사라지지 않게.
export function downsample(points, from, to, max = MAX_POINTS) {
  if (points.length <= max) return points;
  const span = Math.max(1, to - from);
  const buckets = new Map();
  for (const p of points) {
    const k = Math.min(max - 1, Math.floor(((p[0] - from) / span) * max));
    const cur = buckets.get(k);
    if (!cur || p[1] >= cur[1]) buckets.set(k, p);
  }
  return [...buckets.values()];
}

// ids: 보여 줄 워처 id 목록. 반환: [{ id, name, venues: [{ region, place, date, capacity, last, points: [[t, open]] }] }]
export function venueSeries(entries, ids, { hours = 24, now = Date.now(), maxVenues = 60 } = {}) {
  const from = now - hours * 3600000;
  const watchers = new Map();
  for (const e of entries) {
    if (!ids.includes(e.id) || !Array.isArray(e.venues) || !(e.t >= from && e.t <= now)) continue;
    if (!watchers.has(e.id)) watchers.set(e.id, { id: e.id, name: e.name || e.id, venues: new Map() });
    const w = watchers.get(e.id);
    w.name = e.name || w.name;
    for (const [region, place, date, capacity, open] of e.venues) {
      const key = `${region}|${place}|${date}`;
      if (!w.venues.has(key)) w.venues.set(key, { region, place, date, capacity, last: 0, lastAt: 0, points: [] });
      const v = w.venues.get(key);
      v.points.push([e.t, Number(open) || 0]);
      v.capacity = capacity;
      v.last = Number(open) || 0;
      v.lastAt = e.t;
    }
  }
  return [...watchers.values()].map((w) => {
    const all = [...w.venues.values()]
      .sort((a, b) => b.last - a.last || Math.max(...b.points.map((p) => p[1])) - Math.max(...a.points.map((p) => p[1])) || a.date.localeCompare(b.date) || a.place.localeCompare(b.place));
    return { id: w.id, name: w.name, total: all.length, venues: all.slice(0, maxVenues).map((v) => ({ ...v, points: downsample(v.points, from, now) })) };
  });
}
