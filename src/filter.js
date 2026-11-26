// 목록형 접수현황 페이지에서 "내가 보는 시험 행"만 골라낸다.
//   include: ["서울", "전기기능사"]   모든 키워드가 들어 있는 행만
//   exclude: ["마감"]                 하나라도 있으면 제외
//   dateFrom / dateTo: "2026-12-01"   행 안의 날짜(2026.12.05 · 2026-12-05 · 2026년 12월 5일)가 범위 안일 때만

const DATE_RE = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;

export function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function splitRows(text) {
  return String(text)
    .split(/<\/tr>|<\/li>|<br\s*\/?>|\r?\n/i)
    .map(stripTags)
    .filter(Boolean);
}

export function datesIn(row) {
  const out = [];
  for (const m of row.matchAll(DATE_RE)) {
    out.push(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  }
  return out;
}

export function hasFilter(w) {
  return !!(w.include?.length || w.exclude?.length || w.dateFrom || w.dateTo);
}

export function filterRows(text, w) {
  if (!hasFilter(w)) return { text, rows: null };
  const include = (w.include || []).map(String);
  const exclude = (w.exclude || []).map(String);
  const rows = splitRows(text).filter((row) => {
    if (!include.every((k) => row.includes(k))) return false;
    if (exclude.some((k) => row.includes(k))) return false;
    if (w.dateFrom || w.dateTo) {
      const ds = datesIn(row);
      if (ds.length === 0) return false;
      if (!ds.some((d) => (!w.dateFrom || d >= w.dateFrom) && (!w.dateTo || d <= w.dateTo))) return false;
    }
    return true;
  });
  return { text: rows.join('\n'), rows };
}
