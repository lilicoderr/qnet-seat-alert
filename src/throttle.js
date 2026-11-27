// 조용한 시간(quietHours)과 알림 빈도 제한(rateLimit).
//   quietHours: { start: "23:00", end: "07:00", timezone?: "Asia/Seoul" }  — 이 시간대의 알림은 보류했다가 끝나면 보낸다
//   rateLimit : { maxPerHour: 6 } — 시간당 알림 상한(초과분은 건너뜀, 로그에만 남김)

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseHHMM(s) {
  const m = HHMM.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function minutesOfDay(now, timezone) {
  if (!timezone) return now.getHours() * 60 + now.getMinutes();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return get('hour') * 60 + get('minute');
}

export function inQuietHours(cfg, now = new Date()) {
  if (!cfg) return false;
  const s = parseHHMM(cfg.start);
  const e = parseHHMM(cfg.end);
  if (s === null || e === null || s === e) return false;
  const t = minutesOfDay(now, cfg.timezone);
  return s < e ? t >= s && t < e : t >= s || t < e; // 자정을 넘는 구간 지원
}

const RATE_KEY = '__rate';

// 보낼 수 있으면 true 로 기록까지 한다.
// key: 이미지 전용 메시지는 따로 센다 (상태판이 좌석 알림의 몫을 다 써버리지 않도록).
export function takeRateSlot(config, store, nowMs = Date.now(), key = RATE_KEY) {
  const max = Number(config.rateLimit?.maxPerHour) || 0;
  if (max <= 0 || !store) return true;
  const sent = (store.get(key)?.sent || []).filter((t) => nowMs - t < 3600 * 1000);
  if (sent.length >= max) {
    store.set(key, { sent });
    return false;
  }
  store.set(key, { sent: [...sent, nowMs] });
  return true;
}

export function validateThrottle(config, errors) {
  const q = config.quietHours;
  if (q != null) {
    if (typeof q !== 'object' || parseHHMM(q.start) === null || parseHHMM(q.end) === null) {
      errors.push('quietHours 는 { "start": "23:00", "end": "07:00" } 형식(HH:MM)이어야 합니다.');
    } else if (q.timezone) {
      try { new Intl.DateTimeFormat('en', { timeZone: q.timezone }); } catch { errors.push(`quietHours.timezone '${q.timezone}' 을(를) 알 수 없습니다.`); }
    }
  }
  const r = config.rateLimit;
  if (r != null && (typeof r !== 'object' || !Number.isInteger(r.maxPerHour) || r.maxPerHour < 1)) {
    errors.push('rateLimit 는 { "maxPerHour": 1 이상의 정수 } 여야 합니다.');
  }
}
