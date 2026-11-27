// 알림 채널 플러그인. 플러그인은 ES 모듈이며 default export 로 아래 모양을 내보낸다:
//   { type: 'my-chat', validate?(notifier) -> string|null, send(notifier, payload, ctx) -> Promise }
// config.plugins 에 모듈 경로를 적으면 시작 시 로드된다. 알림 전용 — 접수 기능은 없다.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const registry = new Map();
const BUILTIN = ['discord', 'slack', 'telegram', 'webhook', 'email', 'ntfy'];

export function registerNotifier(plugin) {
  if (!plugin || typeof plugin.type !== 'string' || !/^[a-z][\w-]*$/i.test(plugin.type)) {
    throw new Error('플러그인에 올바른 type 문자열이 필요합니다.');
  }
  if (typeof plugin.send !== 'function') throw new Error(`플러그인 '${plugin.type}': send() 함수가 필요합니다.`);
  if (BUILTIN.includes(plugin.type)) throw new Error(`플러그인 type '${plugin.type}' 은 내장 채널과 겹칩니다.`);
  registry.set(plugin.type, plugin);
  return plugin;
}

export const getPlugin = (type) => registry.get(type);
export const pluginTypes = () => [...registry.keys()];
export const clearPlugins = () => registry.clear();

export async function loadPlugins(specs = [], { cwd = process.cwd() } = {}) {
  const loaded = [];
  for (const spec of specs) {
    const target = /^\.|^\/|^[A-Za-z]:/.test(spec) ? pathToFileURL(path.resolve(cwd, spec)).href : spec;
    const mod = await import(target);
    const list = [].concat(mod.default ?? []);
    for (const p of list) loaded.push(registerNotifier(p).type);
  }
  return loaded;
}
