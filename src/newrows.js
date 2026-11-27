// 'newrows' 워처: 공개 접수현황 "목록"에 조건에 맞는 새 항목이 나타나면 한 번만 알린다.
// 예) pattern "기능사.*필기" -> "2026년 정기 기능사 1회 필기" 같은 행이 처음 보이는 순간.
// 이미 본 항목은 state 에 누적(signal = JSON 배열)되어, 사라졌다 다시 나타나도 재알림하지 않는다.
import { parseTable } from './table.js';

// 이름(첫 열) 기준 키. watcher.needle(부분 문자열) 또는 watcher.pattern(정규식)에 맞는 행만.
export function matchingKeys(text, watcher) {
  const table = parseTable(text, {});
  if (!table.rows.length && !/<table/i.test(String(text))) return null; // 표 자체가 없음: 점검/레이아웃 변경
  const re = watcher.pattern ? new RegExp(watcher.pattern, watcher.flags || '') : null;
  const keys = table.rows
    .filter((r) => {
      const line = r.cells.join(' ');
      return re ? re.test(line) : !watcher.needle || line.includes(watcher.needle);
    })
    .map((r) => r.cells[0]);
  return [...new Set(keys)].sort();
}

const parseSeen = (sig) => {
  try { const a = JSON.parse(sig); return Array.isArray(a) ? a : null; } catch { return null; }
};

// evaluate() 결과(kind:'newrows') 를 이전 상태와 합쳐 { signal(누적), newKeys } 로 만든다.
export function applyNewRows(cur, prev, watcher) {
  if (cur.kind !== 'newrows' || cur.signal === null) return cur;
  const seen = parseSeen(prev?.signal);
  const keys = cur.keys;
  const newKeys = seen ? keys.filter((k) => !seen.includes(k)) : (watcher.alertOnFirst ? keys : []);
  const union = [...new Set([...(seen || []), ...keys])].sort();
  return { ...cur, signal: JSON.stringify(union), newKeys, available: null };
}
