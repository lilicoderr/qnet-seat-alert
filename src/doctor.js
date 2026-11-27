// `qnet-alert doctor`: 설정/채널(전송 없이 형식만)/네트워크 도달성을 진단한다. 알림은 보내지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { validateConfig } from './validate.js';
import { resolveNotifiers, validateNotifier } from './notify.js';
import { loadPlugins } from './plugins.js';
import { POLITE_UA } from './polite.js';

const ICON = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' };

function writable(file) {
  const dir = path.dirname(path.resolve(file));
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; }
}

// 채널을 식별하되 비밀값은 노출하지 않는다.
export function describeNotifier(n) {
  if (n.type === 'telegram') return `telegram chat ${n.chatId}`;
  if (n.type === 'email') return `email -> ${[].concat(n.to).length} recipient(s) via ${n.host}`;
  if (n.type === 'ntfy') return `ntfy topic ${n.topic}`;
  return `${n.type} (url set)`;
}

async function reach(url, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: { 'User-Agent': POLITE_UA }, signal: ctrl.signal });
    await res.text().catch(() => '');
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(timer); }
}

// 결과: [{ level: 'ok'|'warn'|'fail', msg }]
export async function diagnose(config, { fetchImpl = (...a) => globalThis.fetch(...a), env = process.env, cwd = process.cwd(), network = true, timeoutMs = 8000 } = {}) {
  const out = [];
  const add = (level, msg) => out.push({ level, msg });
  if (Array.isArray(config.plugins) && config.plugins.length) {
    try { await loadPlugins(config.plugins, { cwd }); add('ok', `plugins loaded: ${config.plugins.join(', ')}`); } catch (e) { add('fail', `plugin load failed: ${e.message}`); }
  }
  const v = validateConfig(config, { requireWebhook: true });
  for (const e of v.errors) add('fail', `config: ${e}`);
  for (const w of v.warnings) add('warn', `config: ${w}`);
  if (v.ok) add('ok', 'config is valid');

  const notifiers = resolveNotifiers(config, {}, env);
  if (!notifiers.length) add('fail', 'no notification channels (set notifiers or QNET_* env vars)');
  for (const n of notifiers) {
    const err = validateNotifier(n);
    add(err ? 'fail' : 'ok', err ? `channel ${n.type}: ${err}` : `channel ${describeNotifier(n)} (dry check, nothing sent)`);
  }
  for (const key of ['statePath', 'historyPath']) {
    if (config[key]) add(writable(config[key]) ? 'ok' : 'fail', `${key} ${writable(config[key]) ? 'is writable' : 'directory is not writable'}`);
  }
  if (network) {
    for (const w of (config.watchers || []).filter((x) => x.enabled !== false && /^https?:\/\//.test(x.url || ''))) {
      const r = await reach(w.url, fetchImpl, timeoutMs);
      if (!r.ok) add('fail', `network: ${w.name || w.url} unreachable (${r.error})`);
      else add(r.status < 400 ? 'ok' : 'warn', `network: ${w.name || w.url} -> HTTP ${r.status}`);
    }
  }
  return out;
}

export function formatReport(items) {
  const bad = items.filter((i) => i.level === 'fail').length;
  const warn = items.filter((i) => i.level === 'warn').length;
  return [...items.map((i) => `[${ICON[i.level]}] ${i.msg}`), '', bad ? `${bad} problem(s), ${warn} warning(s)` : `All good (${warn} warning(s))`].join('\n');
}
