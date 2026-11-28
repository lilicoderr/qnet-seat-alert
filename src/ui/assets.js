// 웹 화면의 정적 파일. 목록이 고정돼 있어 요청 경로가 파일 경로로 쓰이지 않는다.
import fs from 'node:fs';

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/format.js': ['format.js', 'text/javascript; charset=utf-8'],
  '/chart.js': ['chart.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['client.js', 'text/javascript; charset=utf-8'],
};

export function loadAssets() {
  return Object.fromEntries(Object.entries(FILES).map(([url, [file, type]]) => [url, { type, body: fs.readFileSync(new URL(`./web/${file}`, import.meta.url)) }]));
}
