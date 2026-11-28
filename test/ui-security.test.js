import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createUiServer, listenUi, launchUrl } from '../src/ui/server.js';
import { tokenMatches, MAX_BODY } from '../src/ui/security.js';

let server, port, token;
const hits = [];
const logs = [];
before(async () => {
  server = createUiServer({
    routes: {
      'GET /api/ping': async () => ({ ok: true }),
      'POST /api/do': async (b) => { hits.push(b); return { done: true }; },
      'POST /api/boom': async () => { throw new Error('leak SECRETVALUE'); },
    },
    assets: { '/': { type: 'text/html; charset=utf-8', body: '<!doctype html><p>hi' } },
    log: (m) => logs.push(m),
    scrub: (s) => s.replaceAll('SECRETVALUE', '***'),
  });
  await listenUi(server, 0);
  port = server.address().port;
  token = server.uiToken;
});
after(() => server.close());

// fetch 는 Host 를 바꿀 수 없어 http.request 를 쓴다. path 는 정규화하지 않고 그대로 보낸다.
function req(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    r.on('error', reject);
    r.end(body);
  });
}
const auth = () => ({ 'x-qnet-token': token });
const post = (headers = {}, body = '{}', path = '/api/do') => req(path, {
  method: 'POST', body, headers: { ...auth(), origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', ...headers },
});

test('127.0.0.1 에만 바인딩, 토큰은 URL 조각에만', () => {
  assert.equal(server.address().address, '127.0.0.1');
  assert.ok(token.length >= 40);
  assert.equal(launchUrl(server), `http://127.0.0.1:${port}/#t=${token}`);
});

test('페이지에는 토큰이 없고 보안 헤더가 붙는다, CORS 헤더는 없다', async () => {
  const r = await req('/');
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes(token));
  assert.match(r.headers['content-security-policy'], /default-src 'none'.*frame-ancestors 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(r.headers['content-security-policy']));
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('DNS rebinding: 다른 Host 는 페이지/API 모두 거부', async () => {
  for (const host of [`evil.example:${port}`, 'evil.example', `127.0.0.1.nip.io:${port}`, '127.0.0.1:1', '127.0.0.1']) {
    assert.equal((await req('/', { headers: { host } })).status, 421, host);
    assert.equal((await req('/api/ping', { headers: { ...auth(), host } })).status, 421, host);
  }
  assert.equal((await req('/', { headers: { host: `localhost:${port}` } })).status, 200);
});

test('API 는 토큰이 필요하다 (없음/틀림/길이만 같음)', async () => {
  for (const t of [undefined, '', 'x', 'a'.repeat(token.length)]) {
    const headers = t === undefined ? {} : { 'x-qnet-token': t };
    assert.equal((await req('/api/ping', { headers })).status, 401);
  }
  assert.equal((await req(`/api/ping?t=${token}`)).status, 401); // 쿼리의 토큰은 받지 않는다
  assert.equal((await req('/api/ping', { headers: auth() })).status, 200);
  assert.equal(tokenMatches('', ''), false);
});

test('CSRF: 다른 Origin / Origin 없음 / cross-site / 폼 content-type 거부, 핸들러는 실행되지 않음', async () => {
  const n = hits.length;
  assert.equal((await post({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ origin: 'null' })).status, 403);
  assert.equal((await post({ origin: `http://127.0.0.1:${port + 1}` })).status, 403);
  assert.equal((await post({ origin: `http://localhost:${port}` })).status, 403); // Host 와 다른 Origin
  assert.equal((await post({ 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post({ 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal((await post({ 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post({ 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
  const noOrigin = await req('/api/do', { method: 'POST', body: '{}', headers: { ...auth(), 'content-type': 'application/json' } });
  assert.equal(noOrigin.status, 403);
  assert.equal((await post({ 'x-qnet-token': 'nope' })).status, 401);
  assert.equal(hits.length, n);
  assert.equal((await post({ 'sec-fetch-site': 'same-origin' })).status, 200);
  assert.equal(hits.length, n + 1);
});

test('메서드/본문 제한: OPTIONS 프리플라이트 거부, GET 으로 상태 변경 불가, 큰 본문/깨진 JSON', async () => {
  assert.equal((await req('/api/do', { method: 'OPTIONS', headers: auth() })).status, 405);
  assert.equal((await req('/api/do', { headers: auth() })).status, 404);
  assert.equal((await req('/', { method: 'POST' })).status, 405);
  assert.equal((await post({}, JSON.stringify({ a: 'x'.repeat(MAX_BODY) }))).status, 413);
  for (const bad of ['{', '[1]', '"s"', 'null']) assert.equal((await post({}, bad)).status, 400, bad);
});

test('path traversal: 고정 목록 밖의 경로는 모두 404', async () => {
  const paths = ['/../package.json', '/..%2f..%2f.env', '/%2e%2e/%2e%2e/.env', '/.env', '/config.json', '/src/ui/server.js', '//etc/passwd', '/app.js/../../.env', '/..\\..\\.env', '/__proto__', '/constructor', '/api/../.env', '/api/__proto__', '/api/constructor'];
  for (const p of paths) {
    const r = await req(p, { headers: auth() });
    assert.equal(r.status, 404, p);
    assert.ok(!r.text.includes('QNET_'), p);
  }
});

test('내부 오류는 내용을 응답에 담지 않고 로그는 비밀값을 지운다', async () => {
  const r = await post({}, '{}', '/api/boom');
  assert.equal(r.status, 500);
  assert.deepEqual(JSON.parse(r.text), { error: 'internal' });
  assert.ok(logs.some((l) => l.includes('***')) && !logs.some((l) => l.includes('SECRETVALUE')));
});
