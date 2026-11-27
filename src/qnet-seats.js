// Q-Net 공개 "원서접수현황" 조회 흐름의 응답 파서 (읽기 전용, 로그인/접수 없음).
//   rcv00301 목록 -> rcv00302 자격(종목) 폼 -> rcv00303 필터 폼 -> rcv00303s02 세부유형 -> rcv00303s03 시험장/잔여 표
import { stripTags } from './filter.js';

export class QnetLayoutError extends Error {}

const text = (html) => stripTags(String(html).replace(/<em[^>]*class=["'][^"']*mSort[^"']*["'][^>]*>[\s\S]*?<\/em>/gi, ' ')).replace(/\s+/g, ' ').trim();
const tdTexts = (tr) => [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));

// "2026년 11월 27일(금) 10:00 ~ 2026년 12월 1일(화) 18:00" -> {start,end} (ms, KST)
export function parsePeriod(s) {
  const t = [...String(s).matchAll(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일[^\d]*(\d{1,2}):(\d{2})/g)]
    .map((m) => Date.parse(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:00+09:00`));
  return t.length >= 2 ? { start: t[0], end: t[1] } : null;
}

// 목록(rcv00301): 각 행의 이름/접수기간/현황보기 onclick 인자
export function parseExamList(html) {
  const out = [];
  for (const tr of String(html).split(/<\/tr>/i)) {
    const m = tr.match(/goNextDetailVeiw\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/);
    const c = tdTexts(tr);
    if (!m || c.length < 2) continue;
    const [, gId, , implYY, implSeq, planId, seqNo, , qualGb] = m;
    out.push({ name: c[0], period: c[1], ...(parsePeriod(c[1]) || {}), gId, implYY, implSeq, planId, seqNo, qualGb });
  }
  if (!out.length && !/<table/i.test(html)) throw new QnetLayoutError('원서접수현황 목록 표를 찾지 못함 (rcv00301)');
  return out;
}

// 자격 폼(rcv00302): 종목 이름/인덱스 + 숨은 값
export function parseQualForm(html) {
  const form = String(html).match(/<form[^>]*name=["']schfrm["'][\s\S]*?<\/form>/i)?.[0];
  if (!form) throw new QnetLayoutError('schfrm 폼 없음 (접수 시작 전이거나 구조 변경, rcv00302)');
  const hidden = [...form.matchAll(/<input[^>]*type=["']hidden["'][^>]*name=["'](\w+)["'][^>]*value=["']([^"']*)["']/gi)].map((m) => [m[1], m[2]]);
  const rs = [];
  for (const [k, v] of hidden.filter(([k]) => k.startsWith('rs'))) { if (k === 'rsPlanId') rs.push({}); rs[rs.length - 1][k] = v; }
  const names = [...form.matchAll(/<option[^>]*value=["'](\d+)["'][^>]*>([^<]*)</gi)].map((m) => ({ idx: Number(m[1]), name: m[2].trim() }));
  if (!rs.length || !names.length) throw new QnetLayoutError('종목 정보 없음 (rcv00302)');
  return { base: hidden.filter(([k]) => !k.startsWith('rs')), rs, jongmok: names };
}

// 필터 폼(rcv00303): 시도 select 옵션
export function parseSidoOptions(html) {
  const sel = String(html).match(/<select[^>]*name=["']sido["'][\s\S]*?<\/select>/i)?.[0];
  if (!sel) throw new QnetLayoutError('시도 select 없음 (rcv00303)');
  return [...sel.matchAll(/<option[^>]*value=['"]([^'"]*)['"][^>]*>([^<]*)</gi)].map((m) => ({ value: m[1], text: m[2].trim() })).filter((o) => o.value);
}

// "마감 (작업형)" -> 0, "12" -> 12, 그 외는 알 수 없음(null)
export function parseSeatCell(s) {
  const t = String(s).trim();
  if (/^마감/.test(t)) return 0;
  const m = t.match(/^-?\d+/);
  return m ? Math.max(0, Number(m[0])) : null;
}

// 시험장 표(rcv00303s03). { rows, pages, noData }
export function parseVenueTable(html) {
  const h = String(html);
  const head = h.match(/<thead[\s\S]*?<\/thead>/i)?.[0] || '';
  if (!/정원/.test(head) || !/가능인원/.test(text(head))) throw new QnetLayoutError('시험장 표 머리글(정원/현재접수 가능인원)을 찾지 못함 (rcv00303s03)');
  if (/id=["']iddataChk["']|데이터가 존재하지 않습니다/.test(h)) return { rows: [], pages: 1, noData: true };
  const rows = [];
  for (const tr of h.slice(h.indexOf('<tbody')).split(/<\/tr>/i)) {
    const tds = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 8) continue;
    const place = text(tds[5].split(/<div class=["']tbBtn/i)[0]);
    const seatText = text(tds[7]);
    const open = parseSeatCell(seatText);
    if (open === null) throw new QnetLayoutError(`알 수 없는 잔여 표기: '${seatText.slice(0, 30)}'`);
    rows.push({ region: text(tds[1]), org: text(tds[2]), date: text(tds[3]), time: text(tds[4]), place, capacity: parseSeatCell(text(tds[6])), seatText, open });
  }
  const pages = Math.max(1, ...[...h.matchAll(/<button[^>]*title=["'](?:현재 )?(\d+)\s*페이지["']/gi)].map((m) => Number(m[1])));
  return { rows, pages, noData: false };
}
