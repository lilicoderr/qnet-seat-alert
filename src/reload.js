// 설정 핫 리로드: 파일 변경(mtime) 또는 SIGHUP(force) 때 다시 읽는다.
// 새 설정이 잘못됐으면 기존 설정을 유지하고 오류만 알려준다 — 감시가 끊기지 않게.

import fs from 'node:fs';

export function createReloader({ file, initial, validate, prepare = async () => {}, statImpl = fs.statSync, readImpl = fs.readFileSync }) {
  let config = initial;
  let mtime = safeMtime();
  function safeMtime() {
    try { return statImpl(file).mtimeMs; } catch { return null; }
  }
  return {
    get config() { return config; },
    // 파일이 바뀌었는지만 확인 (상태는 바꾸지 않음)
    dirty() { const m = safeMtime(); return m !== null && m !== mtime; },
    // → { changed, config, errors }
    async check({ force = false } = {}) {
      const m = safeMtime();
      if (!force && (m === null || m === mtime)) return { changed: false, config, errors: [] };
      mtime = m;
      try {
        const next = JSON.parse(readImpl(file, 'utf8'));
        await prepare(next);
        const v = validate(next);
        if (!v.ok) return { changed: false, config, errors: v.errors };
        config = next;
        return { changed: true, config, errors: [], warnings: v.warnings };
      } catch (e) {
        return { changed: false, config, errors: [`설정 다시 읽기 실패: ${e.message}`] };
      }
    },
  };
}

// SIGHUP 으로 즉시 깨어날 수 있는 sleep
export function createWaker() {
  let wake = null;
  return {
    sleep(ms) {
      return new Promise((resolve) => {
        const t = setTimeout(() => { wake = null; resolve(false); }, ms);
        wake = () => { clearTimeout(t); wake = null; resolve(true); };
      });
    },
    wake() { if (wake) wake(); },
  };
}
