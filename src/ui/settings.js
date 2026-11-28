// 웹 UI 의 설정 저장. 선택/간격은 config.json 에, 비밀값(웹훅·멘션 ID)은 .env 에만 쓴다.
// 비밀값은 어떤 응답·로그·config 에도 담지 않는다: 밖으로 나가는 것은 "저장됨" 여부와 개수뿐이다.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseEnv } from '../env.js';
import { parseIds } from '../mentions.js';
import { QNET_STATUS_PAGE } from '../qnet.js';
import { MIN_INTERVAL_MIN } from '../polite.js';
import { HttpError } from './security.js';

export const MAX_INTERVAL_MIN = 1440;
const WEBHOOK_RE = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d{1,30}\/[\w-]{1,200}$/;
const USER_ID_RE = /^\d{15,25}$/;
const ID_PREFIX = 'qnet-ui';

const bad = (code, message) => new HttpError(400, code, message);

export function checkInterval(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < MIN_INTERVAL_MIN || v > MAX_INTERVAL_MIN) {
    throw bad('bad_interval', `확인 간격은 ${MIN_INTERVAL_MIN}분 이상 ${MAX_INTERVAL_MIN}분 이하의 숫자여야 합니다.`);
  }
  return v;
}

// 요청 수 추정. 정적 4단계는 30분마다, 현황표는 체크마다 결과 페이지 수만큼(지역 지정 시 보통 1, 전국은 2 이상, 최대 5).
export function requestCost(intervalMin, { region = '', others = 0 } = {}) {
  const interval = checkInterval(intervalMin);
  const checks = 60 / interval;
  const statics = Math.min(2, checks) * 4;
  const typical = (region ? 1 : 2) + others;
  const max = 5 + others;
  const hour = (pages) => Math.ceil(checks * pages + statics);
  return { intervalMin: interval, perCheckTypical: typical, perCheckMax: max, perHourTypical: hour(typical), perHourMax: hour(max), perDayTypical: hour(typical) * 24, others };
}

export function readConfig(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try { return JSON.parse(text); } catch { throw new HttpError(409, 'bad_config', 'config.json 의 JSON 문법이 잘못됐습니다. 파일을 고치거나 지운 뒤 다시 시도하세요.'); }
}

function writeAtomic(file, text, mode) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode });
  try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, text, 'utf8'); fs.rmSync(tmp, { force: true }); }
}

export const uiWatcherIndex = (watchers) => {
  const own = watchers.findIndex((w) => String(w.id || '').startsWith(ID_PREFIX));
  return own >= 0 ? own : watchers.findIndex((w) => w.type === 'qnet');
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// selection: options.resolve() 로 검증된 { examName, jongmok, region }. 다른 워처와 설정은 보존한다.
export function buildUiConfig(prev, selection, intervalMin) {
  const base = prev || { comment: 'ALERT ONLY: no login, no registration, no payment. Secrets belong in .env.', jitter: 0.1, politeDelayMs: 1500, failureAlertAfter: 10, lang: 'ko', statePath: 'state.json', tableImage: { every: false }, watchers: [] };
  const { examName, jongmok, region } = selection;
  const hash = crypto.createHash('sha256').update(`${examName}|${jongmok}|${region}`).digest('hex').slice(0, 8);
  const watchers = [...(base.watchers || [])];
  const at = uiWatcherIndex(watchers);
  const watcher = {
    id: `${ID_PREFIX}-${hash}`, name: `${jongmok} 잔여석 (${region || '전국'})`, type: 'qnet',
    examPattern: `^${escapeRe(examName)}$`, jongmok, ...(region ? { region } : {}), url: QNET_STATUS_PAGE, linkUrl: QNET_STATUS_PAGE,
  };
  if (at >= 0) watchers[at] = watcher; else watchers.unshift(watcher);
  return { ...base, intervalMin: checkInterval(intervalMin), historyPath: base.historyPath || 'history.jsonl', watchers };
}

export const saveConfig = (file, config) => writeAtomic(file, `${JSON.stringify(config, null, 2)}\n`);

// .env 의 지정한 키만 바꾸고 나머지 줄(주석 포함)은 그대로 둔다.
export function updateEnvText(text, updates) {
  const done = new Set();
  const lines = text ? text.replace(/\r?\n$/, '').split(/\r?\n/) : [];
  const out = [];
  for (const line of lines) {
    const key = /^\s*(?:export\s+)?(\w+)\s*=/.exec(line)?.[1];
    if (!key || !Object.hasOwn(updates, key)) { out.push(line); continue; }
    if (!done.has(key)) out.push(`${key}=${updates[key]}`);
    done.add(key);
  }
  for (const [k, v] of Object.entries(updates)) if (!done.has(k)) out.push(`${k}=${v}`);
  return `${out.join('\n')}\n`;
}

// 빈 값은 "그대로 두기". 지우려면 clearWebhook / clearMentions. 오류 메시지에 입력값을 담지 않는다.
export function saveSecrets(envFile, body, env = process.env) {
  const updates = {};
  const webhook = typeof body.webhook === 'string' ? body.webhook.trim() : '';
  if (webhook) {
    if (!WEBHOOK_RE.test(webhook)) throw bad('bad_webhook', 'Discord 웹훅 URL 형식이 아닙니다 (https://discord.com/api/webhooks/... 전체를 붙여 넣으세요).');
    updates.QNET_DISCORD_WEBHOOK = webhook;
  } else if (body.clearWebhook === true) updates.QNET_DISCORD_WEBHOOK = '';
  const ids = parseIds(typeof body.mentionUsers === 'string' ? body.mentionUsers : '');
  if (ids.length) {
    if (ids.length > 20 || !ids.every((x) => USER_ID_RE.test(x))) throw bad('bad_mentions', '멘션할 사용자 ID 는 숫자 15~25자리를 쉼표로 구분해 20개까지 적으세요 (닉네임 아님).');
    updates.QNET_MENTION_USERS = ids.join(',');
  } else if (body.clearMentions === true) updates.QNET_MENTION_USERS = '';
  if (Object.keys(updates).length) {
    let text = '';
    try { text = fs.readFileSync(envFile, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    writeAtomic(envFile, updateEnvText(text, updates), 0o600);
    Object.assign(env, updates); // 실행 중인 감시에도 바로 반영
  }
  return secretStatus(env);
}

export const secretStatus = (env = process.env) => ({
  webhookSet: WEBHOOK_RE.test(env.QNET_DISCORD_WEBHOOK || ''),
  mentionCount: parseIds(env.QNET_MENTION_USERS).filter((x) => USER_ID_RE.test(x)).length,
});

// UI 시작 시: .env 값을 읽어 둔다 (이미 설정된 환경변수는 덮어쓰지 않음).
export function readEnvInto(envFile, env = process.env) {
  let text;
  try { text = fs.readFileSync(envFile, 'utf8'); } catch { return; }
  for (const [k, v] of Object.entries(parseEnv(text))) if (!env[k]) env[k] = v;
}
