// 알림 채널 추상화: Discord / Slack / Telegram / 일반 웹훅. 모두 "알림 전용".
// 비밀값(웹훅 URL·봇 토큰)은 설정 파일 대신 환경변수로도 줄 수 있다.

import { isWebhookUrl, sendAlert as sendDiscord, FOOTER_TEXT } from './discord.js';
import { getPlugin } from './plugins.js';
import { sendMail } from './smtp.js';
import { redactAll } from './redact.js';

const DEFAULT_FETCH = (...a) => globalThis.fetch(...a);

export const NOTIFIER_TYPES = ['discord', 'slack', 'telegram', 'webhook', 'email', 'ntfy'];

export function isSlackWebhook(url) {
  return /^https:\/\/hooks\.slack\.com\/services\/[\w-]+\/[\w-]+\/[\w-]+/.test(String(url || ''));
}

export function isHttpsUrl(url) {
  return /^https:\/\/[^\s]+$/.test(String(url || ''));
}

// 환경변수에서 알림 채널 목록을 만든다.
export function notifiersFromEnv(env = process.env) {
  const out = [];
  if (env.QNET_DISCORD_WEBHOOK) out.push({ type: 'discord', url: env.QNET_DISCORD_WEBHOOK });
  if (env.QNET_SLACK_WEBHOOK) out.push({ type: 'slack', url: env.QNET_SLACK_WEBHOOK });
  if (env.QNET_TELEGRAM_TOKEN && env.QNET_TELEGRAM_CHAT) {
    out.push({ type: 'telegram', token: env.QNET_TELEGRAM_TOKEN, chatId: env.QNET_TELEGRAM_CHAT });
  }
  if (env.QNET_SMTP_HOST && env.QNET_EMAIL_TO) {
    out.push({
      type: 'email', host: env.QNET_SMTP_HOST, port: Number(env.QNET_SMTP_PORT) || undefined,
      user: env.QNET_SMTP_USER, pass: env.QNET_SMTP_PASS,
      from: env.QNET_EMAIL_FROM || env.QNET_SMTP_USER, to: env.QNET_EMAIL_TO.split(',').map((x) => x.trim()),
    });
  }
  if (env.QNET_NTFY_TOPIC) {
    out.push({ type: 'ntfy', topic: env.QNET_NTFY_TOPIC, server: env.QNET_NTFY_SERVER, token: env.QNET_NTFY_TOKEN });
  }
  if (env.QNET_WEBHOOK_URL) out.push({ type: 'webhook', url: env.QNET_WEBHOOK_URL });
  return out;
}

// config(+env) → 실제로 쓸 채널 목록. 구버전 webhookUrl 은 discord 로 취급.
export function resolveNotifiers(config, watcher = {}, env = process.env) {
  if (watcher.webhookUrl) return [{ type: 'discord', url: watcher.webhookUrl }];
  const list = [];
  if (Array.isArray(config.notifiers)) list.push(...config.notifiers);
  if (config.webhookUrl) list.push({ type: 'discord', url: config.webhookUrl });
  list.push(...notifiersFromEnv(env));
  return list;
}

export function validateNotifier(n) {
  const plugin = n && getPlugin(n.type);
  if (plugin) return plugin.validate ? plugin.validate(n) || null : null;
  if (!n || !NOTIFIER_TYPES.includes(n.type)) return `알 수 없는 notifier type '${n?.type}' (${NOTIFIER_TYPES.join('/')})`;
  if (n.type === 'discord' && !isWebhookUrl(n.url)) return 'discord: 웹훅 URL 형식이 올바르지 않습니다.';
  if (n.type === 'slack' && !isSlackWebhook(n.url)) return 'slack: https://hooks.slack.com/services/... 형식이어야 합니다.';
  if (n.type === 'webhook' && !isHttpsUrl(n.url)) return 'webhook: https:// URL 이 필요합니다.';
  if (n.type === 'telegram' && (!n.token || !n.chatId)) return 'telegram: token 과 chatId 가 필요합니다.';
  if (n.type === 'email') {
    if (!n.host || !n.from || !n.to || ![].concat(n.to).length) return 'email: host, from, to 가 필요합니다.';
    if (!/^[^\s@<>]+@[^\s@<>]+$/.test(n.from)) return 'email: from 이 이메일 형식이 아닙니다.';
  }
  if (n.type === 'ntfy') {
    if (!n.topic || !/^[\w-]{1,64}$/.test(n.topic)) return 'ntfy: topic(영문/숫자/-/_)이 필요합니다.';
    if (n.server && !isHttpsUrl(n.server)) return 'ntfy: server 는 https:// URL 이어야 합니다.';
  }
  return null;
}

function plainText(payload) {
  const lines = [payload.title, payload.description];
  for (const f of payload.fields || []) lines.push(`${f.name}: ${f.value}`);
  if (payload.url) lines.push(payload.url);
  return lines.filter(Boolean).join('\n');
}

// HTTP 헤더는 ASCII 만 안전 — 비ASCII 는 RFC 2047 로 인코딩
function ntfyHeader(v) {
  const s = String(v || '').replace(/[\r\n]+/g, ' ');
  return /^[ -~]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
}

async function postJson(fetchImpl, url, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`전송 실패 (${res.status}) ${text.slice(0, 200)}`);
  }
}

// Slack Block Kit 본문 (순수 함수 — 스냅샷 테스트 대상)
export function buildSlackBody(payload) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: String(payload.title || '알림').slice(0, 150), emoji: true } },
  ];
  if (payload.content) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: String(payload.content).slice(0, 2900) } });
  if (payload.description) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: String(payload.description).slice(0, 2900) } });
  }
  if (payload.fields?.length) {
    blocks.push({
      type: 'section',
      fields: payload.fields.slice(0, 10).map((f) => ({ type: 'mrkdwn', text: `*${f.name}*
${f.value}`.slice(0, 2000) })),
    });
  }
  if (payload.url) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: payload.linkLabel || 'Q-Net 열기' }, url: payload.url }],
    });
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: FOOTER_TEXT }] });
  return { text: plainText(payload), blocks };
}

export function buildTelegramBody(chatId, payload) {
  return {
    chat_id: chatId,
    text: plainText(payload).slice(0, 4000),
    disable_web_page_preview: false,
  };
}

// 채널 1개로 전송. 실패 시 throw.
export async function sendTo(notifier, payload, { fetchImpl = DEFAULT_FETCH, username } = {}) {
  const err = validateNotifier(notifier);
  if (err) throw new Error(err);
  const plugin = getPlugin(notifier.type);
  if (plugin) return plugin.send(notifier, payload, { fetchImpl, username });
  switch (notifier.type) {
    case 'discord':
      return sendDiscord(notifier.url, payload, { fetchImpl, username });
    case 'slack':
      return postJson(fetchImpl, notifier.url, buildSlackBody(payload));
    case 'telegram':
      return postJson(
        fetchImpl,
        `https://api.telegram.org/bot${notifier.token}/sendMessage`,
        buildTelegramBody(notifier.chatId, payload),
      );
    case 'email':
      return sendMail({
        ...notifier,
        subject: payload.title,
        text: plainText(payload),
      });
    case 'ntfy': {
      const headers = { Title: ntfyHeader(payload.title), Priority: '4', Tags: 'bell' };
      if (payload.url) headers.Click = payload.url;
      if (notifier.token) headers.Authorization = `Bearer ${notifier.token}`;
      const res = await fetchImpl(`${(notifier.server || 'https://ntfy.sh').replace(/\/$/, '')}/${notifier.topic}`, {
        method: 'POST', headers, body: plainText({ ...payload, title: '', url: '' }),
      });
      if (!res.ok) throw new Error(`전송 실패 (${res.status})`);
      return;
    }
    case 'webhook':
      return postJson(fetchImpl, notifier.url, {
        source: 'qnet-seat-alert',
        title: payload.title,
        description: payload.description,
        url: payload.url,
        fields: payload.fields || [],
        sentAt: new Date().toISOString(),
      });
  }
}

// 모든 채널에 보낸다. 하나라도 성공하면 delivered, 실패는 errors 에 모은다.
export async function notifyAll(notifiers, payload, opts = {}) {
  const errors = [];
  let delivered = 0;
  for (const n of notifiers) {
    try {
      await sendTo(n, payload, opts);
      delivered++;
    } catch (e) {
      // 토큰/URL 이 로그에 새지 않도록 메시지에서 제거
      errors.push(`${n.type}: ${redact(e.message, n)}`);
    }
  }
  return { delivered, errors };
}

export function redact(message, n = {}) {
  return redactAll(message, [n]);
}
