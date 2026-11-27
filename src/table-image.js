// 현황표 PNG 를 알림 채널(Discord 웹훅 multipart / Telegram sendPhoto)에 첨부해 보낸다.
// Slack 인커밍 웹훅은 파일 업로드를 지원하지 않아 건너뛴다 (본문 알림은 그대로 간다).
import { isWebhookUrl } from './discord.js';
import { parseTable, tableFingerprint, formatKst } from './table.js';
import { renderTableImage, findChrome } from './render.js';
import { allowedMentionsFor, discordMentionText } from './mentions.js';
import { redactAll } from './redact.js';

const DEFAULT_FETCH = (...a) => globalThis.fetch(...a);

export const TABLE_IMAGE_KEYS = ['enabled', 'every', 'chrome', 'width'];

// tableImage 설정 해석. 없거나 enabled:false 면 null.
export function tableImageConfig(config = {}) {
  const c = config.tableImage;
  if (!c || c.enabled === false) return null;
  return { every: c.every === true, chrome: c.chrome, width: Number(c.width) || 960 };
}

export function validateTableImage(config, errors, warnings) {
  const c = config.tableImage;
  if (c == null) return;
  if (typeof c !== 'object' || Array.isArray(c)) { errors.push('tableImage 는 객체여야 합니다. 예: { "every": true }'); return; }
  for (const k of Object.keys(c)) if (!TABLE_IMAGE_KEYS.includes(k)) warnings.push(`tableImage: 알 수 없는 키 '${k}' (${TABLE_IMAGE_KEYS.join('/')})`);
  for (const k of ['enabled', 'every']) if (c[k] != null && typeof c[k] !== 'boolean') errors.push(`tableImage.${k} 는 true/false 여야 합니다.`);
  if (c.width != null && !(typeof c.width === 'number' && c.width >= 400 && c.width <= 3000)) errors.push('tableImage.width 는 400~3000 사이 숫자(px)여야 합니다.');
}

// Discord multipart 본문 (순수 함수: 테스트에서 검사). 이미지 메시지에도 같은 멘션 규칙을 적용한다.
export function buildDiscordImageForm(png, { caption, username, mentions, filename = 'qnet-status.png' }) {
  const content = [discordMentionText(mentions), caption].filter(Boolean).join(' ').slice(0, 2000);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ username, content, allowed_mentions: allowedMentionsFor(content), attachments: [{ id: 0, filename }] }));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), filename);
  return form;
}

export async function sendImageTo(notifier, png, opts = {}) {
  const { fetchImpl = DEFAULT_FETCH, caption = '', username, mentions, filename = 'qnet-status.png' } = opts;
  let res;
  if (notifier.type === 'discord' && isWebhookUrl(notifier.url)) {
    res = await fetchImpl(notifier.url, { method: 'POST', body: buildDiscordImageForm(png, { caption, username, mentions, filename }) });
  } else if (notifier.type === 'telegram' && notifier.token && notifier.chatId) {
    const form = new FormData();
    form.append('chat_id', String(notifier.chatId));
    form.append('caption', caption.slice(0, 1000));
    form.append('photo', new Blob([png], { type: 'image/png' }), filename);
    res = await fetchImpl(`https://api.telegram.org/bot${notifier.token}/sendPhoto`, { method: 'POST', body: form });
  } else {
    return false; // 이 채널은 이미지 첨부 미지원
  }
  if (!res.ok && res.status !== 204) throw new Error(`이미지 전송 실패 (${res.status}) ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return true;
}

// 표를 만들고(현재 워처의 원문), 지문이 바뀌었거나 every 이면 PNG 를 렌더해 모든 채널로 보낸다.
// 반환: { sent, errors, changed }
export async function sendTableImage({ config, watcher, r, notifiers, store, fetchImpl, username, mentions, now = Date.now(), renderImpl = renderTableImage, forceSend = false }) {
  const ti = tableImageConfig(config);
  if (!ti || !r.ok || !r.rawText) return { sent: 0, errors: [], changed: false };
  const lang = config.lang === 'en' ? 'en' : 'ko';
  const table = parseTable(r.rawText, watcher, r, lang);
  if (!table.rows.length) return { sent: 0, errors: [], changed: false };
  const key = `__table:${r.id}`;
  const fp = tableFingerprint(table);
  const changed = store?.get(key)?.fp !== fp;
  store?.set(key, { fp });
  if (!(ti.every || changed || forceSend)) return { sent: 0, errors: [], changed };
  const errors = [];
  let sent = 0;
  try {
    const checkedAt = now;
    const png = await renderImpl(table, { title: watcher.name || 'Q-Net', checkedAt, lang, chrome: findChrome({ configured: ti.chrome }), width: ti.width });
    const caption = `${formatKst(checkedAt)} KST${lang === 'ko' ? ' 기준' : ''} · ${watcher.name || 'Q-Net'}`;
    for (const n of notifiers) {
      try {
        if (await sendImageTo(n, png, { fetchImpl, caption, username, mentions: r.available > 0 ? mentions : undefined })) sent++;
      } catch (e) { errors.push(`${n.type}: ${redactAll(e.message, [n])}`); }
    }
  } catch (e) { errors.push(`image: ${e.message}`); }
  return { sent, errors, changed };
}
