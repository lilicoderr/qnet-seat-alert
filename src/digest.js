// 다이제스트: 한 번의 점검에서 여러 워처가 동시에 알림 대상이면 한 통으로 묶는다.

import { t } from './i18n.js';

export function buildDigestPayload(items, lang = 'ko') {
  const lines = items.map(({ watcher, r }) => {
    const link = watcher.linkUrl || watcher.url;
    const seats = r.available != null ? t(lang, 'digest.seats', { n: r.available }) : '';
    return `• **${watcher.name || 'Q-Net'}**${seats} — ${r.reason}${link ? `\n  ${link}` : ''}`;
  });
  return {
    title: t(lang, 'digest.title', { n: items.length }),
    description: lines.join('\n').slice(0, 1900),
    color: items.some(({ r }) => (r.available ?? 1) > 0) ? 0x2b8a3e : 0x868e96,
    fields: [],
    linkLabel: t(lang, 'openLink'),
    content: [...new Set(items.map(({ watcher }) => watcher.mention).filter(Boolean))].join(' '),
  };
}
