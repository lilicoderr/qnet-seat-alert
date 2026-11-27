// 예의 있는 폴링: 식별 가능한 User-Agent, 최소 간격, 지터(jitter).
// 이 도구는 알림 전용이며 사이트에 부담을 주지 않도록 느리게 폴링한다.

export const VERSION = '1.5.0';

// 연락 가능한 정보 없이도 "누가 요청하는지" 알 수 있게 도구명/버전/저장소를 담는다.
export const POLITE_UA = `qnet-seat-alert/${VERSION} (+https://github.com/lilicoderr/qnet-seat-alert; personal alert-only watcher; low-frequency)`;

// 이 값 미만으로는 설정해도 올린다 (분). README 에 문서화됨.
export const MIN_INTERVAL_MIN = 1;

// 기본 지터 비율: 간격의 ±10%.
export const DEFAULT_JITTER = 0.1;

// 간격(분) -> 다음 대기 ms. jitter 는 0..0.5 비율. rand 는 테스트 주입용.
export function nextDelayMs(intervalMin, jitter = DEFAULT_JITTER, rand = Math.random) {
  const base = Math.max(MIN_INTERVAL_MIN, Number(intervalMin) || 5) * 60000;
  const j = Math.min(0.5, Math.max(0, Number(jitter) || 0));
  const factor = 1 + (rand() * 2 - 1) * j;
  return Math.max(MIN_INTERVAL_MIN * 60000, Math.round(base * factor));
}
