// 출력에서 비밀값을 지운다: 설정된 채널의 비밀 필드 + 웹훅 URL/봇 토큰 패턴.
const SECRET_FIELDS = ['url', 'token', 'pass', 'password', 'secret'];
const PATTERNS = [
  /https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/[\w-]+/g,
  /https:\/\/hooks\.slack\.com\/services\/[\w/-]+/g,
  /\/bot\d+:[\w-]+/g,
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
  /Bearer\s+[\w.~+/=-]+/gi,
];

export function redactAll(message, notifiers = []) {
  let m = String(message ?? '');
  for (const n of notifiers) {
    for (const k of SECRET_FIELDS) if (typeof n[k] === 'string' && n[k].length >= 4) m = m.split(n[k]).join('***');
  }
  for (const re of PATTERNS) m = m.replace(re, '***');
  return m;
}
