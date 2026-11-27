// 알림 문구 다국어(ko/en). config.lang 으로 선택 (기본 ko). 사용자 템플릿(templates)이 있으면 그것이 우선.

export const LANGS = ['ko', 'en'];

const M = {
  ko: {
    username: 'Q-Net 빈자리 알림',
    openLink: 'Q-Net 열기',
    'alert.title': '🔔 {name} 변화 감지',
    'field.seats': '빈자리',
    'field.seatsVal': '{n}석',
    'field.cap': '정원/접수',
    'fail.title': '⚠️ {name} 감시 오류 지속',
    'fail.desc': '{n}회 연속 실패: {err}',
    'parser.title': '🛠️ {name} 파서 오류 — 페이지 구조가 바뀌었을 수 있어요',
    'parser.desc': '페이지는 불러왔지만 {n}회 연속으로 값을 읽지 못했습니다 ({detail}).\n`include` / `pattern` / `fields` 설정을 확인하거나, 최신 버전으로 업데이트하세요. 그동안 빈자리 알림이 오지 않을 수 있습니다.',
    'parser.noSignal': '신호 없음',
    'digest.title': '🔔 {n}건의 변화 감지',
    'digest.seats': ' · {n}석',
    'heartbeat.title': '💓 Q-Net 감시기 정상 동작 중',
    'heartbeat.desc': '워처 {total}개 (정상 {ok}, 오류 {bad}) · 가동 {hours}시간',
    'decide.noSignal': '신호 없음(추출 실패)',
    'decide.available': '빈자리 {n}석',
    'decide.none': '빈자리 없음',
    'decide.increase': '{prev} → {cur} (증가)',
    'decide.opened': '빈자리 열림: {cur}석 (이전 {prev})',
    'decide.same': '빈자리 {cur} (이전 {prev})',
    'decide.unknown': '미확인',
    'decide.stillOpen': '빈자리 {n}석 (계속 열려 있음)',
    'decide.noRule': '비교 규칙 없음',
  },
  en: {
    username: 'Q-Net seat alert',
    openLink: 'Open Q-Net',
    'alert.title': '🔔 {name}: change detected',
    'field.seats': 'Seats open',
    'field.seatsVal': '{n}',
    'field.cap': 'Capacity/applied',
    'fail.title': '⚠️ {name}: watcher keeps failing',
    'fail.desc': '{n} consecutive failures: {err}',
    'parser.title': '🛠️ {name}: parser broke — the page layout may have changed',
    'parser.desc': 'The page loads, but no value could be read for {n} checks in a row ({detail}).\nCheck your `include` / `pattern` / `fields` settings or update to the latest version. Seat alerts may not arrive meanwhile.',
    'parser.noSignal': 'no signal',
    'digest.title': '🔔 {n} changes detected',
    'digest.seats': ' · {n} seats',
    'heartbeat.title': '💓 Q-Net watcher is alive',
    'heartbeat.desc': '{total} watchers ({ok} ok, {bad} failing) · up {hours} h',
    'decide.noSignal': 'no signal (extraction failed)',
    'decide.available': '{n} seats open',
    'decide.none': 'no seats open',
    'decide.increase': '{prev} → {cur} (increase)',
    'decide.opened': 'Seats opened: {cur} (was {prev})',
    'decide.same': 'Seats {cur} (was {prev})',
    'decide.unknown': 'unknown',
    'decide.stillOpen': '{n} seat(s) open (still available)',
    'decide.noRule': 'no comparison rule',
  },
};

export function t(lang, key, vars = {}) {
  const table = M[lang] || M.ko;
  const s = table[key] ?? M.ko[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

export const langOf = (config = {}) => (LANGS.includes(config.lang) ? config.lang : 'ko');
export const usernameOf = (config = {}) => config.username || t(langOf(config), 'username');
export const messageKeys = () => Object.keys(M.ko);
export const hasAllKeys = (lang) => Object.keys(M.ko).every((k) => k in M[lang]);
