// 현황표 PNG 를 알림 채널(Discord 웹훅 multipart / Telegram sendPhoto)에 첨부해 보낸다.
// Slack 인커밍 웹훅은 파일 업로드를 지원하지 않아 건너뛴다 (본문 알림은 그대로 간다).
import { isWebhookUrl, buildDiscordBody } from './discord.js';
import { plainText, sendTo, validateNotifier } from './notify.js';
import { parseTable, tableFingerprint, formatKst } from './table.js';
import { renderTableImage, findChrome } from './render.js';
import { allowedMentionsFor } from './mentions.js';
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

const FILENAME = 'qnet-status.png';

// Discord multipart 본문 (순수 함수). payload 가 있으면 알림 임베드에 이미지를 붙인 "한 통"(멘션은 payload.mentions 에서 한 번만),
// 없으면 멘션 없는 이미지 전용 메시지.
export function buildDiscordImageForm(png, { payload, caption = '', username, filename = FILENAME, now } = {}) {
  let body;
  if (payload) {
    body = buildDiscordBody(payload, { username, now });
    body.embeds[0].image = { url: `attachment://${filename}` };
  } else {
    const content = caption.slice(0, 2000);
    body = { username, content, allowed_mentions: allowedMentionsFor(content) };
  }
  body.attachments = [{ id: 0, filename }];
  const form = new FormData();
  form.append('payload_json', JSON.stringify(body));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), filename);
  return form;
}

async function check(res, what) {
  if (!res.ok && res.status !== 204) throw new Error(`${what} 전송 실패 (${res.status}) ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

// 채널 1개로 (알림 payload + 이미지) 를 "한 메시지"로 보낸다. payload 가 없으면 이미지 전용.
// Discord: 임베드+첨부 / Telegram: sendPhoto(캡션=알림 본문) / 그 외: payload 가 있으면 기존 텍스트 알림, 없으면 건너뜀.
export async function sendWithImage(notifier, png, { payload, caption = '', fetchImpl = DEFAULT_FETCH, username } = {}) {
  if (notifier.type === 'discord' && isWebhookUrl(notifier.url)) {
    await check(await fetchImpl(notifier.url, { method: 'POST', body: buildDiscordImageForm(png, { payload, caption, username }) }), '이미지');
    return true;
  }
  if (notifier.type === 'telegram' && notifier.token && notifier.chatId) {
    const form = new FormData();
    form.append('chat_id', String(notifier.chatId));
    form.append('caption', (payload ? plainText(payload) : caption).slice(0, 1000));
    form.append('photo', new Blob([png], { type: 'image/png' }), FILENAME);
    await check(await fetchImpl(`https://api.telegram.org/bot${notifier.token}/sendPhoto`, { method: 'POST', body: form }), '이미지');
    return true;
  }
  if (!payload) return false;
  await sendTo(notifier, payload, { fetchImpl, username });
  return true;
}

// 모든 채널로. 반환: { delivered, errors }
export async function notifyAllWithImage(notifiers, png, opts = {}) {
  const errors = [];
  let delivered = 0;
  for (const n of notifiers) {
    try {
      const err = validateNotifier(n);
      if (err) throw new Error(err);
      if (await sendWithImage(n, png, opts)) delivered++;
    } catch (e) { errors.push(`${n.type}: ${redactAll(e.message, [n])}`); }
  }
  return { delivered, errors };
}

// 표를 만들고 PNG 를 렌더한다 (전송은 하지 않음). 지문(fingerprint)은 전송에 성공한 뒤 commit() 으로 갱신한다.
//   attach: true 면 항상 렌더(알림에 붙일 때) / 아니면 every 이거나 표가 바뀐 때만.
//   gate: 이미지 전용 메시지를 실제로 보내기 직전에 호출 (빈도 제한 슬롯 등). false 면 렌더/지문 갱신 없이 null.
// 반환: { png, caption, commit } 또는 null
export async function prepareTableImage({ config, watcher, r, store, now = Date.now(), renderImpl = renderTableImage, attach = false, gate }) {
  const ti = tableImageConfig(config);
  if (!ti || !r.ok || !r.rawText) return null;
  const lang = config.lang === 'en' ? 'en' : 'ko';
  const table = parseTable(r.rawText, watcher, r, lang);
  if (!table.rows.length) return null;
  const key = `__table:${r.id}`;
  const fp = tableFingerprint(table);
  const changed = store?.get(key)?.fp !== fp;
  if (!attach && !(ti.every || changed)) return null;
  if (!attach && gate && !gate()) return null;
  const png = await renderImpl(table, { title: watcher.name || 'Q-Net', checkedAt: now, lang, chrome: findChrome({ configured: ti.chrome }), width: ti.width });
  return { png, caption: `${formatKst(now)} KST${lang === 'ko' ? ' 기준' : ''} · ${watcher.name || 'Q-Net'}`, commit: () => store?.set(key, { fp }) };
}
