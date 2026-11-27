// 아주 작은 cron 파서 (외부 의존 없음). 5필드: 분 시 일 월 요일 (프로세스 로컬 시간).
// 지원: `*`, `a`, `a-b`, `a,b,c`, `*/n`, `a-b/n`, `a/n`. 요일 0~7 (0·7=일요일).
// 일(dom)과 요일(dow)이 둘 다 제한되면 표준 cron 처럼 "또는"으로 해석한다.

const RANGES = [
  ['minute', 0, 59], ['hour', 0, 23], ['dom', 1, 31], ['month', 1, 12], ['dow', 0, 7],
];

function parseField(text, name, min, max) {
  const set = new Set();
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cron ${name}: '${part}' 형식이 올바르지 않습니다.`);
    const step = m[2] === undefined ? 1 : Number(m[2]);
    if (step < 1) throw new Error(`cron ${name}: 간격(step)은 1 이상이어야 합니다.`);
    let lo = min;
    let hi = max;
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-').map(Number);
      lo = a;
      hi = b ?? (m[2] === undefined ? a : max);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`cron ${name}: ${min}~${max} 범위를 벗어났습니다 ('${part}').`);
    for (let v = lo; v <= hi; v += step) set.add(name === 'dow' && v === 7 ? 0 : v);
  }
  return set;
}

export function parseCron(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 식은 5개 필드(분 시 일 월 요일)여야 합니다.');
  const [minute, hour, dom, month, dow] = RANGES.map(([name, lo, hi], i) => parseField(parts[i], name, lo, hi));
  return { minute, hour, dom, month, dow, domAny: parts[2] === '*', dowAny: parts[4] === '*' };
}

export function matchesCron(cron, date) {
  if (!cron.minute.has(date.getMinutes()) || !cron.hour.has(date.getHours()) || !cron.month.has(date.getMonth() + 1)) return false;
  const domOk = cron.dom.has(date.getDate());
  const dowOk = cron.dow.has(date.getDay());
  if (cron.domAny || cron.dowAny) return domOk && dowOk;
  return domOk || dowOk;
}

// (lastMs, nowMs] 구간에 cron 이 맞는 분이 있으면 "실행할 때"다. lastMs 가 없으면 지금 이 분만 본다.
export function isDue(expr, lastMs, nowMs, maxLookbackMin = 24 * 60) {
  const cron = typeof expr === 'string' ? parseCron(expr) : expr;
  const nowMin = Math.floor(nowMs / 60000);
  const from = lastMs ? Math.max(Math.floor(lastMs / 60000) + 1, nowMin - maxLookbackMin) : nowMin;
  for (let m = from; m <= nowMin; m++) if (matchesCron(cron, new Date(m * 60000))) return true;
  return false;
}
