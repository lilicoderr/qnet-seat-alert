import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runUi } from '../src/ui-cmd.js';

const web = (f) => fs.readFileSync(new URL(`../src/ui/web/${f}`, import.meta.url), 'utf8');

test('qnet-alert ui: 127.0.0.1 에서 시작하고 주소(#t=)를 안내, 페이지는 같은 토큰으로 API 접근', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-cmd-'));
  const lines = [];
  const { server } = await runUi(['--port', '0'], { cwd: dir, env: {}, log: (m) => lines.push(m) });
  try {
    const url = lines.map((l) => l.trim()).find((l) => l.startsWith('http'));
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/#t=[\w-]{40,}$/);
    const token = url.split('#t=')[1];
    assert.equal(server.uiToken, token);
    const base = url.split('#')[0];
    const html = await (await fetch(base)).text();
    assert.match(html, /Q-Net 빈자리 알림/);
    assert.ok(!html.includes(token));
    assert.equal((await fetch(`${base}api/state`)).status, 401);
    const st = await fetch(`${base}api/state`, { headers: { 'x-qnet-token': token } });
    assert.equal(st.status, 200);
    assert.equal((await st.json()).selection, null);
    assert.ok(lines.every((l) => !/webhook|SECRET/i.test(l)));
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('포트가 사용 중이면 해결 방법을 알려 준다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-cmd-'));
  const a = await runUi(['--port', '0'], { cwd: dir, env: {}, log: () => {} });
  const lines = [];
  try {
    const port = a.server.address().port;
    assert.equal(await runUi(['--port', String(port)], { cwd: dir, env: {}, log: (m) => lines.push(m) }), 1);
    assert.match(lines.join('\n'), /이미 다른 프로그램/);
    await assert.rejects(() => runUi(['--port', '99999'], { cwd: dir, env: {}, log: () => {} }), /--port/);
  } finally { a.server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('화면 코드: 서버 값은 textContent 로만, 외부 주소/innerHTML/eval/인라인 스크립트 없음', () => {
  for (const f of ['client.js', 'chart.js', 'format.js']) {
    const s = web(f);
    assert.doesNotMatch(s, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|localStorage/, f);
    assert.doesNotMatch(s.replace("http://www.w3.org/2000/svg", ""), /https?:\/\//, f);
  }
  const html = web('index.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\son\w+=|style=/i);
  assert.doesNotMatch(html, /https?:\/\/(?!discord\.com)/);
  assert.match(html, /<html lang="ko">/);
  assert.match(web('client.js'), /sessionStorage/);
});
