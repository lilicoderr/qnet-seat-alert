// 로컬 웹 UI 서버. 127.0.0.1 에만 바인딩한다. 정적 파일은 고정 목록(assets)만 내보내므로
// URL 이 파일 경로가 되는 일이 없다(path traversal 불가).
import http from 'node:http';
import { checkRequest, securityHeaders, readJsonBody, newToken, HttpError } from './security.js';

const JSON_TYPE = 'application/json; charset=utf-8';

function send(res, status, type, body) {
  res.writeHead(status, securityHeaders(type));
  res.end(body);
}

// routes: { 'GET /api/x': async (searchParams) => data, 'POST /api/y': async (body) => data }
// assets: { '/': { type, body } }
export function createUiServer({ routes = {}, assets = {}, token = newToken(), log = () => {}, scrub = (s) => s } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = String(req.url || '').split('?')[0];
      const api = pathname.startsWith('/api/');
      checkRequest(req, { port: server.address().port, token, api });
      if (!api) {
        const a = Object.hasOwn(assets, pathname) ? assets[pathname] : null;
        if (!a) throw new HttpError(404, 'not_found');
        return send(res, 200, a.type, req.method === 'HEAD' ? '' : a.body);
      }
      const key = `${req.method} ${pathname}`;
      if (!Object.hasOwn(routes, key)) throw new HttpError(404, 'not_found');
      const input = req.method === 'POST' ? await readJsonBody(req) : new URL(req.url, 'http://127.0.0.1').searchParams;
      const data = await routes[key](input);
      return send(res, 200, JSON_TYPE, JSON.stringify(data ?? {}));
    } catch (e) {
      const known = e instanceof HttpError;
      // 예상 못 한 오류의 내용은 응답에 담지 않고, 로그에는 비밀값을 지워서 남긴다
      if (!known) log(`[ui] 오류: ${scrub(String(e?.message || e))}`);
      const status = known ? e.status : 500;
      const payload = { error: known ? e.code : 'internal', ...(known && e.message !== e.code ? { message: scrub(e.message) } : {}) };
      if (!res.headersSent) send(res, status, JSON_TYPE, JSON.stringify(payload));
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.uiToken = token;
  return server;
}

// host 는 인자로 받지 않는다: 항상 루프백.
export function listenUi(server, port = 8788) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// 토큰은 URL 조각(#)에 담는다: 조각은 서버로 전송되지 않아 접속 로그/Referer 에 남지 않고,
// 같은 PC 의 다른 사용자가 페이지를 받아도 토큰을 얻을 수 없다.
export const launchUrl = (server) => `http://127.0.0.1:${server.address().port}/#t=${server.uiToken}`;
