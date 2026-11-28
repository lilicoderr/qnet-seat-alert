// 설정 화면의 선택 목록(접수 중인 시험 / 종목 / 지역). 감시와 같은 공개 읽기 전용 단계만 쓴다.
// 예의: 사용자가 버튼을 누를 때만 요청하고, 10분 캐시, 요청 사이 1.5초, 실패 후에는 잠시 쉰다.
import crypto from 'node:crypto';
import { listExams, loadQualForm, loadSidos } from '../qnet-chain.js';
import { fetchWithRetry } from '../engine.js';
import { HttpError } from './security.js';

export const OPTIONS_TTL_MS = 10 * 60000;
export const REQUEST_GAP_MS = 1500;
const COOLDOWN_MS = 30000;
const THROTTLED_COOLDOWN_MS = 2 * 60000;

export const examKey = (e) => crypto.createHash('sha256').update([e.name, e.gId, e.implYY, e.implSeq, e.planId, e.seqNo, e.qualGb].join('|')).digest('hex').slice(0, 16);

export function createOptions({ fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const cache = new Map();
  let blockedUntil = 0;
  let lastRequestAt = -Infinity;
  let chain = Promise.resolve(); // 동시에 눌러도 한 번에 하나씩 (두 번째는 캐시를 탄다)

  async function fetchText(req) {
    const wait = lastRequestAt + REQUEST_GAP_MS - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();
    return (await fetchWithRetry(req, { fetchImpl, timeoutMs: 15000, retries: 0, baseMs: 0, sleepImpl: sleep })).text;
  }

  async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < OPTIONS_TTL_MS) return hit.value;
    if (now() < blockedUntil) throw new HttpError(429, 'cooldown', `잠시 뒤 다시 시도하세요 (${Math.ceil((blockedUntil - now()) / 1000)}초)`);
    try {
      const value = await load();
      cache.set(key, { at: now(), value });
      return value;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      blockedUntil = now() + (/^HTTP (429|5\d\d)\b/.test(e.message) ? THROTTLED_COOLDOWN_MS : COOLDOWN_MS);
      throw new HttpError(502, 'qnet_failed', `Q-Net 에서 목록을 읽지 못했습니다: ${e.message}`);
    }
  }

  const queued = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  const examList = () => cached('exams', () => listExams(fetchText));
  const isOpen = (e) => e.start <= now() && now() <= e.end;

  async function findExam(key) {
    const exam = (await examList()).find((e) => examKey(e) === key && isOpen(e));
    if (!exam) throw new HttpError(400, 'unknown_exam', '선택한 시험이 접수 중이 아닙니다. 목록을 다시 불러오세요.');
    return exam;
  }
  const formOf = (key, exam) => cached(`form:${key}`, () => loadQualForm(exam, fetchText));

  async function jongmokIn(key, name) {
    const exam = await findExam(key);
    const form = await formOf(key, exam);
    const jm = form.jongmok.find((j) => j.name === name);
    if (!jm) throw new HttpError(400, 'unknown_jongmok', '선택한 종목이 목록에 없습니다.');
    return { exam, form, jm };
  }

  return {
    exams: () => queued(async () => {
      const all = await examList();
      return {
        exams: all.filter(isOpen).map((e) => ({ key: examKey(e), name: e.name, period: e.period })),
        upcoming: all.filter((e) => e.start > now()).map((e) => ({ name: e.name, period: e.period })),
      };
    }),
    jongmok: (key) => queued(async () => {
      const exam = await findExam(key);
      return { jongmok: (await formOf(key, exam)).jongmok.map((j) => j.name) };
    }),
    regions: (key, name) => queued(async () => {
      const { exam, form, jm } = await jongmokIn(key, name);
      const sidos = await cached(`sido:${key}:${jm.idx}`, () => loadSidos(exam, form, jm, fetchText));
      return { regions: sidos.map((s) => s.text) };
    }),
    // 저장 전에 선택을 검증한다. 클라이언트가 보낸 문자열을 그대로 믿지 않는다.
    resolve: (key, name, region) => queued(async () => {
      const { exam, form, jm } = await jongmokIn(key, name);
      if (region) {
        const sidos = await cached(`sido:${key}:${jm.idx}`, () => loadSidos(exam, form, jm, fetchText));
        if (!sidos.some((s) => s.text === region)) throw new HttpError(400, 'unknown_region', '선택한 지역이 목록에 없습니다.');
      }
      return { examName: exam.name, jongmok: jm.name, region: region || '' };
    }),
  };
}
