// `qnet-alert doctor`: 설정/채널(전송 없이 형식만)/네트워크 도달성을 진단한다. 알림은 보내지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { validateConfig } from './validate.js';
import { resolveNotifiers, validateNotifier } from './notify.js';
import { loadPlugins } from './plugins.js';
import { POLITE_UA } from './polite.js';
import { parseIds, mentionsFromConfig } from './mentions.js';

const ICON = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' };

function writable(file) {
  const dir = path.dirname(path.resolve(file));
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; }
}

// 채널 형식 오류별 "무엇을 고칠지" 안내
const CHANNEL_FIX = {
  discord: '.env 의 QNET_DISCORD_WEBHOOK 값을 Discord 채널 설정 > 연동 > 웹후크 > 웹후크 URL 복사 로 받은 주소로 바꾸세요 (https://discord.com/api/webhooks/ 로 시작, 값 뒤에 설명/주석 금지).',
  slack: '.env 의 QNET_SLACK_WEBHOOK 을 https://hooks.slack.com/services/... 주소로 바꾸세요.',
};

// 멘션 ID 점검: 형식이 틀린 값은 조용히 버려지므로 알려 준다 (값 자체는 출력하지 않는다).
export function diagnoseMentions(config, env = process.env) {
  const out = [];
  const m = mentionsFromConfig(config, env);
  for (const [key, valid] of [['QNET_MENTION_USERS', m.users], ['QNET_MENTION_ROLES', m.roles], ['QNET_MENTION_SLACK', m.slack]]) {
    const bad = parseIds(env[key]).filter((x) => !valid.includes(x)).length;
    if (bad) out.push({ level: 'warn', msg: `${key}: ${bad}개 값이 ID 형식이 아니라 무시됩니다. → 해결: ${key === 'QNET_MENTION_SLACK' ? 'U 로 시작하는 멤버 ID' : '숫자 15~25자리 ID(닉네임 아님)'}만 쉼표로 적고, 같은 줄에 # 주석을 달지 마세요.` });
  }
  out.push({ level: 'ok', msg: m.any ? `mentions: ${m.users.length} user(s), ${m.roles.length} role(s), ${m.slack.length} slack` : 'mentions: none (핑을 받으려면 .env 의 QNET_MENTION_USERS 에 Discord 사용자 ID 를 넣으세요)' });
  return out;
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
  if (!notifiers.length) add('fail', 'no notification channels (set notifiers or QNET_* env vars) → 해결: 프로젝트 폴더의 .env 파일에 QNET_DISCORD_WEBHOOK=<웹훅 URL> 한 줄을 넣고 다시 실행하세요.');
  for (const n of notifiers) {
    const err = validateNotifier(n);
    add(err ? 'fail' : 'ok', err ? `channel ${n.type}: ${err}${CHANNEL_FIX[n.type] ? ` → 해결: ${CHANNEL_FIX[n.type]}` : ''}` : `channel ${describeNotifier(n)} (dry check, nothing sent)`);
  }
  out.push(...diagnoseMentions(config, env));
  for (const key of ['statePath', 'historyPath']) {
    if (config[key]) add(writable(config[key]) ? 'ok' : 'fail', `${key} ${writable(config[key]) ? 'is writable' : 'directory is not writable → 해결: 쓰기 가능한 폴더로 프로젝트를 옮기거나 config.json 의 경로를 바꾸세요'}`);
  }
  if (network) {
    for (const w of (config.watchers || []).filter((x) => x.enabled !== false && /^https?:\/\//.test(x.url || ''))) {
      const r = await reach(w.url, fetchImpl, timeoutMs);
      if (!r.ok) add('fail', `network: ${w.name || w.url} unreachable (${r.error}) → 해결: 인터넷 연결과 config.json 의 url 을 확인하세요 (네트워크 없이 점검: --offline)`);
      else add(r.status < 400 ? 'ok' : 'warn', `network: ${w.name || w.url} -> HTTP ${r.status}${r.status < 400 ? '' : ' → 해결: url 이 브라우저에서 열리는지 확인하고, 일시적 차단/점검이면 잠시 뒤 다시 실행하세요'}`);
    }
  }
  return out;
}

export function formatReport(items) {
  const bad = items.filter((i) => i.level === 'fail').length;
  const warn = items.filter((i) => i.level === 'warn').length;
  return [...items.map((i) => `[${ICON[i.level]}] ${i.msg}`), '', bad ? `${bad} problem(s), ${warn} warning(s)` : `All good (${warn} warning(s))`].join('\n');
}
