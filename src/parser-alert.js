// "파서가 깨졌다" 알림: 페이지는 받아오는데 신호를 못 뽑는 상태가 연속으로 이어질 때 한 번만 보낸다.
// 큐넷 페이지 구조가 바뀌면 조용히 "빈자리 없음"으로 보이는 대신 이 알림이 온다.

import { t } from './i18n.js';

export function buildParserBrokenPayload(watcher, r, lang = 'ko') {
  const detail = typeof r.detail === 'string' ? r.detail : t(lang, 'parser.noSignal');
  return {
    title: t(lang, 'parser.title', { name: watcher.name || 'Q-Net' }),
    description: t(lang, 'parser.desc', { n: r.nullStreak, detail }),
    url: watcher.linkUrl || watcher.url,
    color: 0xe8590c,
    fields: [],
  };
}
