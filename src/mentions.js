// 빈자리가 보일 때 사용자/역할을 멘션한다. ID 는 설정 또는 환경변수에서만 온다 (하드코딩 없음).
//   config.mentions = { users: ["<discord user id>"], roles: ["<role id>"], slack: ["U…"],
//                       cooldownMin: 0, whileAvailable: true }
//   env: QNET_MENTION_USERS / QNET_MENTION_ROLES / QNET_MENTION_SLACK (쉼표 구분)

const DISCORD_ID = /^\d{15,25}$/;
const SLACK_ID = /^[UW][A-Z0-9]{2,20}$/;
export const MENTION_KEYS = ['users', 'roles', 'slack', 'cooldownMin', 'whileAvailable'];

export function parseIds(v) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return list.map((x) => String(x).trim()).filter(Boolean);
}

const uniq = (a) => [...new Set(a)];

export function mentionsFromConfig(config = {}, env = process.env) {
  const c = config.mentions || {};
  const users = uniq([...parseIds(c.users), ...parseIds(env.QNET_MENTION_USERS)]).filter((x) => DISCORD_ID.test(x));
  const roles = uniq([...parseIds(c.roles), ...parseIds(env.QNET_MENTION_ROLES)]).filter((x) => DISCORD_ID.test(x));
  const slack = uniq([...parseIds(c.slack), ...parseIds(env.QNET_MENTION_SLACK)]).filter((x) => SLACK_ID.test(x));
  return {
    users, roles, slack,
    any: users.length + roles.length + slack.length > 0,
    cooldownMin: Number(c.cooldownMin) || 0,
    whileAvailable: c.whileAvailable !== false,
  };
}

export const discordMentionText = (m) => [...(m?.users || []).map((i) => `<@${i}>`), ...(m?.roles || []).map((i) => `<@&${i}>`)].join(' ');
export const slackMentionText = (m) => (m?.slack || []).map((i) => `<@${i}>`).join(' ');

// 본문에 실제로 들어 있는 ID 만 핑 허용: @everyone/@here 와 그 밖의 멘션은 모두 차단
export function allowedMentionsFor(content) {
  const text = String(content || '');
  return {
    parse: [],
    users: uniq([...text.matchAll(/<@!?(\d{15,25})>/g)].map((x) => x[1])),
    roles: uniq([...text.matchAll(/<@&(\d{15,25})>/g)].map((x) => x[1])),
  };
}

// 쿨다운(분) 이 지났는지. 0 이면 항상 true(= 매 체크).
export function mentionDue(m, store, id, nowMs) {
  if (!m.cooldownMin) return true;
  const last = store?.get(`__mention:${id}`)?.last;
  return !last || nowMs - last >= m.cooldownMin * 60000;
}

export function recordMention(store, id, nowMs) {
  store?.set(`__mention:${id}`, { last: nowMs });
}

export function validateMentions(config, errors, warnings) {
  const c = config.mentions;
  if (c == null) return;
  if (typeof c !== 'object' || Array.isArray(c)) { errors.push('mentions 는 객체여야 합니다.'); return; }
  for (const k of Object.keys(c)) if (!MENTION_KEYS.includes(k)) warnings.push(`mentions: 알 수 없는 키 '${k}' (${MENTION_KEYS.join('/')})`);
  for (const [k, re, what] of [['users', DISCORD_ID, 'Discord 사용자 ID(숫자 15~25자리)'], ['roles', DISCORD_ID, 'Discord 역할 ID(숫자 15~25자리)'], ['slack', SLACK_ID, 'Slack 멤버 ID(U…/W…)']]) {
    if (c[k] == null) continue;
    if (!Array.isArray(c[k])) { errors.push(`mentions.${k} 는 ID 문자열 배열이어야 합니다.`); continue; }
    for (const id of c[k]) if (!re.test(String(id))) errors.push(`mentions.${k}: '${id}' 는 ${what} 형식이 아닙니다.`);
  }
  if (c.cooldownMin != null && !(typeof c.cooldownMin === 'number' && c.cooldownMin >= 0)) errors.push('mentions.cooldownMin 은 0 이상의 숫자(분)여야 합니다.');
  if (c.whileAvailable != null && typeof c.whileAvailable !== 'boolean') errors.push('mentions.whileAvailable 은 true/false 여야 합니다.');
}
