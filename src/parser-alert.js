// "파서가 깨졌다" 알림: 페이지는 받아오는데 신호를 못 뽑는 상태가 연속으로 이어질 때 한 번만 보낸다.
// 큐넷 페이지 구조가 바뀌면 조용히 "빈자리 없음"으로 보이는 대신 이 알림이 온다.

export function buildParserBrokenPayload(watcher, r) {
  return {
    title: `🛠️ ${watcher.name || 'Q-Net'} 파서 오류 — 페이지 구조가 바뀌었을 수 있어요`,
    description: `페이지는 불러왔지만 ${r.nullStreak}회 연속으로 값을 읽지 못했습니다 (${typeof r.detail === 'string' ? r.detail : '신호 없음'}).\n` +
      '`include` / `pattern` / `fields` 설정을 확인하거나, 최신 버전으로 업데이트하세요. 그동안 빈자리 알림이 오지 않을 수 있습니다.',
    url: watcher.linkUrl || watcher.url,
    color: 0xe8590c,
    fields: [],
  };
}
