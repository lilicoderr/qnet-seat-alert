// 조용한 시간에 보류한 알림: 보관 / 취소 / 전송.
//   state.__held = { items: { <워처 id>: payload } }

import { notifyAll, resolveNotifiers } from './notify.js';
import { takeRateSlot } from './throttle.js';
import { mentionsFromConfig, mentionDue, recordMention } from './mentions.js';
import { usernameOf } from './i18n.js';

const KEY = '__held';
const read = (store) => ({ ...(store?.get(KEY)?.items || {}) });

// 같은 워처의 보류분은 최신 것으로 바꾼다. 새 항목(newrows)은 각각이 다른 소식이므로 본문을 이어 붙인다.
export function holdAlert(store, id, payload, { append = false } = {}) {
  const items = read(store);
  const old = items[id];
  items[id] = append && old ? { ...payload, description: `${old.description}\n${payload.description}`.slice(0, 1900) } : payload;
  store?.set(KEY, { items });
}

// 더 이상 보낼 필요가 없는 보류분(빈자리가 닫혔거나, 새 알림이 이미 나감)을 버린다.
export function dropHeld(store, id) {
  const items = read(store);
  if (!(id in items)) return;
  delete items[id];
  store.set(KEY, { items });
}

// 보류된 알림을 보낸다. 빈도 제한/전송 실패로 못 보낸 것은 남겨 두었다가 다음 체크에 다시 시도한다.
export async function flushHeld(config, { store, fetchImpl, log = () => {}, now = () => Date.now() }) {
  const items = read(store);
  if (!Object.keys(items).length) return 0;
  const mm = mentionsFromConfig(config);
  let sent = 0;
  for (const [id, held] of Object.entries(items)) {
    const watcher = (config.watchers || []).find((w) => (w.id || w.name || w.url) === id) || {};
    const notifiers = resolveNotifiers(config, watcher);
    if (!notifiers.length) continue;
    if (!takeRateSlot(config, store, now())) break;
    const ping = !!held.mentions && mm.any && mentionDue(mm, store, id, now());
    const payload = ping ? held : { ...held, mentions: undefined };
    const { delivered } = await notifyAll(notifiers, payload, { fetchImpl, username: usernameOf(config) });
    if (delivered === 0) continue;
    sent++;
    if (ping) recordMention(store, id, now());
    dropHeld(store, id);
  }
  if (sent) log(`[quiet] 보류된 알림 ${sent}건 전송`);
  return sent;
}
