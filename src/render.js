// HTML -> PNG. 의존성 없이 시스템에 설치된 Chrome/Chromium/Edge 의 headless 스크린샷을 쓴다.
// (프로젝트는 Playwright 를 쓰지 않는다. 브라우저 경로: tableImage.chrome / QNET_CHROME / CHROME_PATH / 자동 탐색)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
};

export function findChrome({ configured, env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  for (const p of [configured, env.QNET_CHROME, env.CHROME_PATH, ...(CANDIDATES[platform] || CANDIDATES.linux)]) {
    if (p && exists(p)) return p;
  }
  return null;
}

// PNG 헤더에서 크기를 읽는다 (검증/테스트용)
export function pngSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function renderPng(html, { chrome, width = 960, height = 400, scale = 2, timeoutMs = 30000, execFileImpl = execFile } = {}) {
  if (!chrome) throw new Error('Chrome/Chromium/Edge 를 찾지 못했습니다. tableImage.chrome 또는 QNET_CHROME 에 경로를 지정하세요.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnet-img-'));
  const page = path.join(dir, 'table.html');
  const out = path.join(dir, 'table.png');
  fs.writeFileSync(page, html, 'utf8');
  const args = [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${path.join(dir, 'profile')}`, `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`, '--default-background-color=FFFFFFFF',
    `--screenshot=${out}`, pathToFileURL(page).href,
  ];
  try {
    await new Promise((resolve, reject) => execFileImpl(chrome, args, { timeout: timeoutMs, windowsHide: true }, (e) => (e ? reject(e) : resolve())));
    if (!fs.existsSync(out)) throw new Error('스크린샷 파일이 만들어지지 않았습니다.');
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 표 -> PNG 버퍼
export async function renderTableImage(table, { title, checkedAt, lang, chrome, width = 960, ...rest } = {}) {
  const { renderTableHtml, estimateHeight } = await import('./table.js');
  return renderPng(renderTableHtml(table, { title, checkedAt, lang }), { chrome, width, height: estimateHeight(table), ...rest });
}
