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

// Chrome 샌드박스는 끄지 않는다. 단, Linux 에서 root 로 실행(컨테이너 등)하면 Chrome 이 샌드박스에서 시작을
// 거부하므로 그 경우에만 --no-sandbox 를 붙인다.
export function needsNoSandbox({ platform = process.platform, uid = process.getuid?.() } = {}) {
  return platform === 'linux' && uid === 0;
}

const MEASURE_RE = /data-qnet-h="(\d+)"/;
const MEASURE_SCRIPT = '<script>document.addEventListener("DOMContentLoaded",function(){document.body.setAttribute("data-qnet-h",String(Math.ceil(document.body.getBoundingClientRect().height)))})</script>';

// execFile 을 프로미스로. stdout 을 돌려준다.
const run = (execFileImpl, chrome, args, timeoutMs) => new Promise((resolve, reject) => {
  execFileImpl(chrome, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, stdout) => (e ? reject(e) : resolve(String(stdout || ''))));
});

export async function renderPng(html, { chrome, width = 960, height = 400, scale = 2, timeoutMs = 30000, measure = true, execFileImpl = execFile } = {}) {
  if (!chrome) throw new Error('Chrome/Chromium/Edge 를 찾지 못했습니다. tableImage.chrome 또는 QNET_CHROME 에 경로를 지정하세요.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnet-img-'));
  const page = path.join(dir, 'table.html');
  const out = path.join(dir, 'table.png');
  const base = ['--headless', '--disable-gpu', ...(needsNoSandbox() ? ['--no-sandbox'] : []), '--hide-scrollbars', '--no-first-run', `--user-data-dir=${path.join(dir, 'profile')}`];
  try {
    let h = height;
    if (measure) {
      // 1차: 실제 레이아웃 높이를 DOM 에서 측정 (긴 글이 줄바꿈돼도 잘리지 않게). 실패하면 추정 높이를 쓴다.
      try {
        fs.writeFileSync(page, html.replace('</body>', `${MEASURE_SCRIPT}</body>`), 'utf8');
        const dom = await run(execFileImpl, chrome, [...base, '--dump-dom', `--window-size=${width},800`, pathToFileURL(page).href], timeoutMs);
        const m = MEASURE_RE.exec(dom);
        if (m && Number(m[1]) > 0) h = Number(m[1]);
      } catch { /* 추정 높이 사용 */ }
    }
    fs.writeFileSync(page, html, 'utf8');
    const args = [...base, `--force-device-scale-factor=${scale}`, `--window-size=${width},${h}`, '--default-background-color=FFFFFFFF', `--screenshot=${out}`, pathToFileURL(page).href];
    await run(execFileImpl, chrome, args, timeoutMs);
    if (!fs.existsSync(out)) throw new Error('스크린샷 파일이 만들어지지 않았습니다.');
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 표 -> PNG 버퍼
export async function renderTableImage(table, { title, checkedAt, lang, chrome, width = 960, ...rest } = {}) {
  const { renderTableHtml, estimateHeight } = await import('./table.js');
  return renderPng(renderTableHtml(table, { title, checkedAt, lang }), { chrome, width, height: estimateHeight(table, width), ...rest });
}
