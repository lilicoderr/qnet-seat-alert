// 감시 이상 경고("감시 오류" / "파서 오류"): 전달될 때까지 매 체크 다시 시도하고, 장애 한 번에 한 통만 보낸다.
//   state['__warn:<워처 id>'] = { fail?: true, parser?: true }  — true = 이번 장애에서 이미 전달됨. 복구하면 지운다.
// 조용한 시간에는 보내지 않고 끝난 뒤에도 장애 중이면 보낸다. rateLimit 은 좌석 알림과 따로 세고, 전달된 것만 센다.

import { notifyAll, resolveNotifiers } from './notify.js';
import { buildParserBrokenPayload } from './parser-alert.js';
import { hasRateSlot, takeRateSlot } from './throttle.js';
import { langOf, t, usernameOf } from './i18n.js';

const RATE_KEY = '__rate:warn';

export async function sendWarnings(config, { store, watcher, r, quiet, now, fetchImpl }) {
  const key = `__warn:${r.id}`;
  const sent = { ...(store?.get(key) || {}) };
  delete sent.at;
  const save = () => store?.set(key, sent);

  // 복구: 가져오기 성공 = 감시 오류 끝, 신호까지 읽힘 = 파서 오류 끝
  const recovered = [r.ok && 'fail', r.ok && !r.nullStreak && 'parser'].filter((k) => k && sent[k]);
  if (recovered.length) {
    for (const k of recovered) delete sent[k];
    save();
  }

  const kind = r.ok ? 'parser' : 'fail';
  const limit = kind === 'fail' ? config.failureAlertAfter ?? 5 : config.parserAlertAfter ?? 3;
  const streak = kind === 'fail' ? r.failures : r.nullStreak;
  if (!(limit > 0 && streak >= limit) || sent[kind]) return;
  if (quiet) {
    r.alertError = '조용한 시간: 끝난 뒤에도 장애 중이면 경고 전송';
    return;
  }
  const notifiers = resolveNotifiers(config, watcher);
  if (!notifiers.length) return;
  if (!hasRateSlot(config, store, now(), RATE_KEY)) {
    r.alertError = '빈도 제한(rateLimit): 경고는 다음 체크에 다시 시도';
    return;
  }
  const lang = langOf(config);
  const payload = kind === 'parser' ? buildParserBrokenPayload(watcher, r, lang) : {
    title: t(lang, 'fail.title', { name: watcher.name || 'Q-Net' }),
    description: t(lang, 'fail.desc', { n: r.failures, err: r.error }),
    url: watcher.linkUrl || watcher.url,
    color: 0xe03131,
  };
  const { delivered, errors } = await notifyAll(notifiers, payload, { fetchImpl, username: usernameOf(config) });
  r.alerted = delivered > 0;
  if (errors.length) r.alertError = errors.join('; ');
  if (!delivered) return;
  takeRateSlot(config, store, now(), RATE_KEY);
  sent[kind] = true;
  save();
}
