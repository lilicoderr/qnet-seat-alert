// 다이제스트: 한 번의 점검에서 여러 워처가 동시에 알림 대상이면 한 통으로 묶는다.

export function buildDigestPayload(items) {
  const lines = items.map(({ watcher, r }) => {
    const link = watcher.linkUrl || watcher.url;
    const seats = r.available != null ? ` · ${r.available}석` : '';
    return `• **${watcher.name || 'Q-Net'}**${seats} — ${r.reason}${link ? `\n  ${link}` : ''}`;
  });
  return {
    title: `🔔 ${items.length}건의 변화 감지`,
    description: lines.join('\n').slice(0, 1900),
    color: items.some(({ r }) => (r.available ?? 1) > 0) ? 0x2b8a3e : 0x868e96,
    fields: [],
    content: [...new Set(items.map(({ watcher }) => watcher.mention).filter(Boolean))].join(' '),
  };
}
