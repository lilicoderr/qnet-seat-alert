// Discord 웹훅 전송.

import { discordMentionText, allowedMentionsFor } from './mentions.js';

const DEFAULT_FETCH = (...a) => globalThis.fetch(...a);

// 웹훅 URL 형식 검사 (실수로 다른 URL 보내는 것 방지)
export function isWebhookUrl(url) {
  return /^https:\/\/(discord(app)?\.com)\/api\/webhooks\/\d+\/[\w-]+/.test(String(url || ''));
}

export const FOOTER_TEXT = 'qnet-seat-alert · alert only';

// 풍부한 임베드 본문 생성 (순수 함수 — 스냅샷 테스트 가능). now 는 timestamp 주입용.
export function buildDiscordBody(payload, { username = 'Q-Net 빈자리 알림', now = new Date() } = {}) {
  const embed = {
    author: { name: username },
    title: payload.title?.slice(0, 256) || '알림',
    description: payload.description?.slice(0, 4000) || '',
    color: payload.color ?? 0x2b8a3e,
    footer: { text: FOOTER_TEXT },
    timestamp: now.toISOString(),
  };
  if (payload.url) embed.url = payload.url;
  if (Array.isArray(payload.fields) && payload.fields.length) {
    embed.fields = payload.fields.slice(0, 25).map((f) => ({
      name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline,
    }));
  }
  // 임베드 제목 링크와 별개로 본문 끝에 눈에 띄는 링크 한 줄
  if (payload.url && payload.linkLabel) {
    embed.description = `${embed.description}

[${payload.linkLabel}](${payload.url})`.trim().slice(0, 4096);
  }
  // 멘션: 설정된 ID + 워처의 mention 텍스트. 본문에 실제로 있는 ID 만 핑되도록 allowed_mentions 를 좁힌다.
  const content = [discordMentionText(payload.mentions), payload.content].filter(Boolean).join(' ').slice(0, 2000);
  return { username, content, embeds: [embed], allowed_mentions: allowedMentionsFor(content) };
}

// 알림 1건 전송. payload: { title, description, url, fields, color, linkLabel }
export async function sendAlert(webhookUrl, payload, { fetchImpl = DEFAULT_FETCH, username = 'Q-Net 빈자리 알림' } = {}) {
  if (!isWebhookUrl(webhookUrl)) throw new Error('올바른 Discord 웹훅 URL 이 아닙니다.');
  const body = JSON.stringify(buildDiscordBody(payload, { username }));
  const doPost = () => fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  let res = await doPost();
  // Discord 레이트리밋(429): retry_after 만큼 기다렸다 1회 재시도
  if (res.status === 429) {
    let waitMs = 1000;
    try {
      const j = await res.clone().json();
      if (j.retry_after) waitMs = Math.ceil(Number(j.retry_after) * (j.retry_after < 100 ? 1000 : 1));
    } catch { /* 헤더 기본값 사용 */ }
    waitMs = Math.min(Math.max(waitMs, 500), 10000);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await doPost();
  }
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`웹훅 전송 실패 (${res.status}) ${text.slice(0, 200)}`);
  }
  return true;
}
