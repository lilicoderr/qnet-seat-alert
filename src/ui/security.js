// 로컬 웹 UI 보안: 세션 토큰, Host/Origin 검사(CSRF·DNS rebinding 방어), 보안 헤더, 본문 제한.
import crypto from 'node:crypto';

export const TOKEN_HEADER = 'x-qnet-token';
export const MAX_BODY = 16 * 1024;

export const newToken = () => crypto.randomBytes(32).toString('base64url');

export function tokenMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && b.length > 0 && crypto.timingSafeEqual(a, b);
}

// Host 는 우리가 바인딩한 루프백 이름:포트만. 공격자 도메인이 127.0.0.1 로 풀려도(DNS rebinding) 여기서 막힌다.
export const allowedHosts = (port) => [`127.0.0.1:${port}`, `localhost:${port}`];

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// 모든 요청에 적용. api 요청은 토큰, 상태 변경(POST)은 Origin 과 JSON 본문까지 요구한다.
export function checkRequest(req, { port, token, api }) {
  const hosts = allowedHosts(port);
  const host = String(req.headers.host || '').toLowerCase();
  if (!hosts.includes(host)) throw new HttpError(421, 'bad_host');
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) throw new HttpError(403, 'bad_origin');
  if (!api) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
    return;
  }
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'cross_site');
  if (!tokenMatches(req.headers[TOKEN_HEADER], token)) throw new HttpError(401, 'bad_token');
  if (req.method === 'GET') return;
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  if (origin === undefined) throw new HttpError(403, 'origin_required');
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'json_required');
}

export function securityHeaders(type) {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

// 작은 JSON 객체만 받는다. 오류 메시지에 본문을 담지 않는다(비밀값이 들어 있을 수 있다).
export async function readJsonBody(req, max = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new HttpError(413, 'body_too_large');
    chunks.push(c);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'bad_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'bad_json');
  return data;
}
