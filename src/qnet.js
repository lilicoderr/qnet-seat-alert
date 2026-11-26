// Q-Net 관련 헬퍼 / 프리셋.
//
//   주의: Q-Net 의 실제 잔여석 조회는 로그인이 필요하거나 페이지 구조가 자주 바뀐다.
//   이 도구는 "알림 전용"이며 자동 접수는 하지 않는다. 폴링은 예의 있게(간격 넉넉히).
//   watcher.url 에 실제로 열람 가능한 접수현황 페이지/엔드포인트를 넣어 사용한다.

export const QNET_BASE = 'https://www.q-net.or.kr';

// 접수현황 안내 페이지(사람이 확인하는 용). 알림의 linkUrl 로 쓰기 좋다.
export const QNET_STATUS_PAGE = `${QNET_BASE}/rcv003.do?gSite=Q&id=rcv00301`;

export const DISCLAIMER =
  'Q-Net 자동 조회는 사이트 이용약관에 저촉될 수 있습니다. 개인 확인 용도로만, '
  + '폴링 간격을 넉넉히(예: 3~10분) 두고 사용하세요. 이 도구는 접수를 대신하지 않습니다.';

// Q-Net 접수현황을 감시하는 watcher 기본형을 만든다(사용자가 url/규칙을 채움).
export function makeQnetWatcher({
  name = 'Q-Net 접수현황',
  url,
  type = 'seats',
  alertOn = 'open',
  linkUrl = QNET_STATUS_PAGE,
  ...rest
} = {}) {
  if (!url) throw new Error('감시할 접수현황 url 이 필요합니다.');
  return { name, url, type, alertOn, linkUrl, ...rest };
}

// 권장 폴링 간격(분) 하한 — 너무 잦은 요청 방지.
export const MIN_INTERVAL_MIN = 2;
