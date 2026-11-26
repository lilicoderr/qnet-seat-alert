// 가져온 텍스트/HTML 에서 "신호(signal)"를 뽑는 추출기들.
//
//   watcher.type 에 따라:
//     seats   : "정원/접수인원" 류 숫자를 찾아 잔여석 계산 → 빈자리 여부
//     contains: 특정 문구 포함 여부 (예: "접수하기" 있으면 접수가능)
//     regex   : 정규식 1번 그룹 값을 신호로
//     jsonseats: JSON 응답에서 정원/접수 필드로 잔여석

// 숫자 추출(쉼표 제거)
function num(s) {
  const n = Number(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "정원 30" "접수 28" "접수인원 28" "모집인원 30" 등에서 숫자 뽑기
const CAPACITY_RE = /(정원|모집\s*인원|수용\s*인원|모집정원)\s*[:：]?\s*([\d,]+)/;
const APPLIED_RE = /(접수\s*인원|접수\s*현황|신청\s*인원|현재\s*인원|접수)\s*[:：]?\s*([\d,]+)/;
const REMAIN_RE = /(잔여|여석|잔여\s*석|남은\s*자리|잔여\s*좌석)\s*[:：]?\s*([\d,]+)/;

// 좌석 신호 추출. { available, capacity, applied, source } 또는 null.
export function extractSeats(text) {
  const t = String(text);

  // 1) 잔여석이 직접 적혀 있으면 그대로
  const rem = t.match(REMAIN_RE);
  if (rem) {
    const available = num(rem[2]);
    if (available !== null) return { available, capacity: null, applied: null, source: 'remain' };
  }

  // 2) 정원 - 접수인원
  const cap = t.match(CAPACITY_RE);
  const app = t.match(APPLIED_RE);
  if (cap && app) {
    const capacity = num(cap[2]);
    const applied = num(app[2]);
    if (capacity !== null && applied !== null) {
      return { available: Math.max(0, capacity - applied), capacity, applied, source: 'cap-applied' };
    }
  }

  // 3) "접수 28 / 정원 30" 또는 "28 / 30" 비율 표기
  const ratio = t.match(/(?:접수\s*)?([\d,]+)\s*\/\s*(?:정원\s*)?([\d,]+)\s*명?/);
  if (ratio) {
    const applied = num(ratio[1]);
    const capacity = num(ratio[2]);
    if (capacity !== null && applied !== null && capacity >= applied) {
      return { available: Math.max(0, capacity - applied), capacity, applied, source: 'ratio' };
    }
  }

  // 4) "30명 중 28명 접수"
  const mid = t.match(/([\d,]+)\s*명?\s*중\s*([\d,]+)\s*명?/);
  if (mid) {
    const capacity = num(mid[1]);
    const applied = num(mid[2]);
    if (capacity !== null && applied !== null && capacity >= applied) {
      return { available: Math.max(0, capacity - applied), capacity, applied, source: 'mid' };
    }
  }
  return null;
}

// JSON 객체에서 정원/접수 필드로 잔여석
export function extractSeatsFromJson(obj, fields = {}) {
  const cap = pick(obj, fields.capacity || ['capacity', '정원', 'totCnt', 'fixnum']);
  const app = pick(obj, fields.applied || ['applied', '접수인원', 'rcptCnt', 'applyCnt']);
  const rem = pick(obj, fields.remain || ['remain', '잔여', 'restCnt']);
  if (rem !== null) return { available: Math.max(0, rem), capacity: null, applied: null, source: 'json-remain' };
  if (cap !== null && app !== null) {
    return { available: Math.max(0, cap - app), capacity: cap, applied: app, source: 'json-cap-applied' };
  }
  return null;
}

function pick(obj, keys) {
  const stack = [obj];
  const want = new Set(keys);
  while (stack.length) {
    const cur = stack.shift();
    if (cur && typeof cur === 'object') {
      for (const [k, v] of Object.entries(cur)) {
        if (want.has(k)) {
          const n = num(v);
          if (n !== null) return n;
        }
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  }
  return null;
}

// watcher 를 텍스트에 적용해 신호를 뽑는다.
// 반환: { kind, signal, available?, detail }
export function evaluate(watcher, text, { json } = {}) {
  switch (watcher.type) {
    case 'seats': {
      const s = extractSeats(text);
      if (!s) return { kind: 'seats', signal: null, available: null, detail: '좌석 숫자를 찾지 못함' };
      return { kind: 'seats', signal: s.available, available: s.available, detail: s };
    }
    case 'jsonseats': {
      const obj = json ?? safeJson(text);
      const s = obj ? extractSeatsFromJson(obj, watcher.fields) : null;
      if (!s) return { kind: 'seats', signal: null, available: null, detail: 'JSON 좌석 필드 없음' };
      return { kind: 'seats', signal: s.available, available: s.available, detail: s };
    }
    case 'contains': {
      const has = String(text).includes(watcher.needle);
      return { kind: 'contains', signal: has ? 'present' : 'absent', detail: watcher.needle };
    }
    case 'regex': {
      const re = new RegExp(watcher.pattern, watcher.flags || '');
      const m = String(text).match(re);
      return { kind: 'regex', signal: m ? (m[1] ?? m[0]) : null, detail: watcher.pattern };
    }
    default:
      throw new Error(`알 수 없는 watcher.type: ${watcher.type}`);
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
