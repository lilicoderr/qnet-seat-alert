// 읽기 전용 Q-Net 잔여석 조회 흐름. 로그인/접수/결제 엔드포인트(rcv202, man001 등)는 절대 호출하지 않는다.
//   정적 단계(목록 -> 자격 폼 -> 필터 폼 -> 세부유형)는 캐시하고, 매 체크에는 시험장 표(s03)만 다시 조회한다.
import { parseExamList, parseQualForm, parseSidoOptions, parseVenueTable, QnetLayoutError } from './qnet-seats.js';
import { filterRows, hasFilter } from './filter.js';
import { esc } from './dashboard.js';

const BASE = 'https://www.q-net.or.kr/rcv003.do';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const AJAX = { ...FORM, 'X-Requested-With': 'XMLHttpRequest' };
const ref = (id, g = '') => `${BASE}?id=${id}&gSite=Q&gId=${g}`;
const CACHE = new Map();
export const clearQnetCache = () => CACHE.clear();

const post = (fetchText, id, data, headers, referer) => fetchText({
  url: `${BASE}?id=${id}&gSite=Q`, method: 'POST', body: new URLSearchParams(data).toString(), headers: { ...headers, Referer: referer },
});

// 정적 단계. 반환: { state } 또는 { none: '사유' }
async function resolveStatics(w, fetchText, now) {
  const exams = parseExamList(await fetchText({ url: ref('rcv00301'), method: 'GET' }));
  const re = new RegExp(w.examPattern || '기능사');
  const hit = exams.filter((e) => re.test(e.name));
  if (!hit.length) return { none: '조건에 맞는 접수 중 시험 없음' };
  const exam = hit.find((e) => e.start <= now && now <= e.end) || null;
  if (!exam) return { none: hit[0].start > now ? `접수 시작 전: ${hit[0].name}` : `접수 종료: ${hit[0].name}` };
  const form = parseQualForm(await post(fetchText, 'rcv00302', { planId: exam.planId, seqNo: exam.seqNo, implYY: exam.implYY, implSeq: exam.implSeq, qualGb: exam.qualGb, gId: exam.gId }, FORM, ref('rcv00301')));
  const jm = form.jongmok.find((j) => j.name.includes(w.jongmok || ''));
  if (!jm) throw new QnetLayoutError(`종목 '${w.jongmok}' 없음. 가능: ${form.jongmok.map((j) => j.name).join(', ')}`);
  const rs = form.rs[jm.idx];
  const data = [...form.base, ['planId', rs.rsPlanId], ['seqNo', rs.rsSeqNo], ['implYY', rs.rsImplYY], ['implSeq', rs.rsImplSeq], ['jmCd', rs.rsJmCd], ['sameYN', rs.rsSameYN], ['sameImplYN', rs.rsSameImplYN], ['jmNm', rs.rsJmNm], ['JongMook', String(jm.idx)], ['selFields', '00'], ['selField', '00'], ...form.rs.flatMap((r) => Object.entries(r))];
  const sidos = parseSidoOptions(await post(fetchText, 'rcv00303', data, FORM, ref('rcv00302', exam.gId)));
  const recptCd = w.recptCd || '01';
  const dtl = JSON.parse(await post(fetchText, 'rcv00303s02', { ...common(exam, rs), val: recptCd }, AJAX, ref('rcv00303', exam.gId))).recptList?.[0]?.id;
  const sido = w.region ? sidos.find((s) => s.text.includes(w.region) || s.value.includes(w.region))?.value ?? null : '';
  if (sido === null) throw new QnetLayoutError(`지역 '${w.region}' 없음. 가능: ${sidos.map((s) => s.text).join(', ')}`);
  return { state: { exam, rs, recptCd, recptDtl: dtl ?? '', sido, at: now } };
}

const common = (exam, rs) => ({ gSite: 'Q', gId: exam.gId, planId: rs.rsPlanId, seqNo: rs.rsSeqNo, jmCd: rs.rsJmCd, selFld: '00', sameYN: 'N', same: 'N' });

async function queryPages(s, w, fetchText) {
  const rows = [];
  for (let page = 1, pages = 1; page <= pages && page <= (w.maxPages || 10); page++) {
    const html = await post(fetchText, 'rcv00303s03', { ...common(s.exam, s.rs), sido: s.sido, sigungu: '', closeYN: '', recptCd: s.recptCd, recptDtl: s.recptDtl, page: String(page), examdt: '', qualGb: s.exam.qualGb, seriesCd: s.exam.gId, closingView: w.showClosed === false ? 'N' : 'Y', examDtl: '' }, AJAX, ref('rcv00303', s.exam.gId));
    const r = parseVenueTable(html);
    rows.push(...r.rows);
    pages = r.pages;
  }
  return rows;
}

// 시험장 행 -> 감시 대상 표 HTML (parseTable/evaluate 가 그대로 읽는다). 열: 지역/시험장/시험일자/정원/잔여
export function rowsToHtml(rows, w = {}) {
  const keep = hasFilter(w) ? rows.filter((r) => filterRows(`${r.region} ${r.org} ${r.place} ${r.date}`, w).rows?.length) : rows;
  const body = keep.map((r) => `<tr><td>${esc(r.region)}</td><td>${esc(`${r.org} ${r.place}`.trim())}</td><td>${esc(r.date)}</td><td>${r.capacity ?? ''}</td><td>${r.open}</td></tr>`).join('');
  return `<table><thead><tr><th>지역</th><th>시험장</th><th>시험일자</th><th>정원</th><th>잔여</th></tr></thead><tbody>${body}</tbody></table>`;
}

// 메인: 한 번의 체크. 반환 { text, note }. 레이아웃 변경은 QnetLayoutError 로 올라간다.
export async function fetchQnetSeats(w, fetchText, { now = Date.now() } = {}) {
  const key = `${w.examPattern}|${w.jongmok}|${w.region}|${w.recptCd}`;
  const ttl = (w.refreshMin ?? 30) * 60000;
  let c = CACHE.get(key);
  if (c && (c.none || now - c.at > ttl || (c.state && c.state.exam.end < now))) c = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!c) {
      const r = await resolveStatics(w, fetchText, now);
      c = r.state ? { state: r.state, at: now } : { none: r.none, at: now };
      CACHE.set(key, c);
    }
    if (c.none) return { text: rowsToHtml([], w), note: c.none };
    try {
      return { text: rowsToHtml(await queryPages(c.state, w, fetchText), w), note: '' };
    } catch (e) {
      CACHE.delete(key); c = null; // 정적 값이 낡았을 수 있으니 한 번 새로 받아 재시도
      if (attempt) throw e;
    }
  }
}
