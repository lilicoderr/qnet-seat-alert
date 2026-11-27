// 워처별 마지막 신호를 파일에 저장 (변화 비교용).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function defaultStatePath() {
  return process.env.QNET_STATE || path.join(process.cwd(), 'state.json');
}

export function createStore(file = defaultStatePath()) {
  function load() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  }
  let cache = load();
  return {
    file,
    get(id) {
      return cache[id] ? { ...cache[id] } : null;
    },
    set(id, value) {
      cache[id] = { ...value, at: Date.now() };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(cache, null, 2) + '\n', 'utf8');
      } catch (e) {
        // 저장 실패해도 메모리 캐시는 유지 (다음 저장에서 복구)
        console.error('[state] 저장 실패:', e.message);
      }
    },
    all() {
      return structuredClone(cache);
    },
  };
}

// 테스트용 인메모리 저장소
export function memoryStore() {
  const m = new Map();
  return {
    file: ':memory:',
    get: (id) => m.get(id) ?? null,
    set: (id, v) => m.set(id, { ...v, at: Date.now() }),
    all: () => Object.fromEntries(m),
  };
}
