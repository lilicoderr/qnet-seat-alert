// 가짜 Q-Net 서버: 파일(fixture)을 내용으로 내보내고, 응답을 바꿀 수 있다. 요청 수/헤더를 기록한다.
import http from 'node:http';
import fs from 'node:fs';

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

export async function startFakeQnet(initial = 'table-full.html') {
  const state = { body: fixture(initial), status: 200, requests: [] };
  const server = http.createServer((req, res) => {
    state.requests.push({ url: req.url, ua: req.headers['user-agent'] });
    res.writeHead(state.status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(state.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}/status`,
    state,
    serve: (name, status = 200) => { state.body = fixture(name); state.status = status; },
    close: () => new Promise((r) => server.close(r)),
  };
}
