// 이전 신호 ↔ 현재 신호를 비교해 "알림을 보낼지" 결정.

// prev, cur: evaluate() 결과 ({ kind, signal, available? })
// watcher.alertOn (seats): 'open'(0→>0, 기본) | 'increase' | 'change' | 'available'
// watcher.alertWhen (contains): 'present' | 'absent' | 'change'
import { t } from './i18n.js';

export function decide(prev, cur, watcher, lang = 'ko') {
  if (cur.signal === null || cur.signal === undefined) {
    return { alert: false, reason: t(lang, 'decide.noSignal') };
  }
  const first = !prev || prev.signal === null || prev.signal === undefined;

  if (cur.kind === 'seats') {
    const prevN = first ? null : Number(prev.signal);
    const curN = Number(cur.signal);
    const mode = watcher.alertOn || 'open';
    switch (mode) {
      case 'available':
        return { alert: curN > 0, reason: curN > 0 ? t(lang, 'decide.available', { n: curN }) : t(lang, 'decide.none') };
      case 'change':
        return { alert: !first && prevN !== curN, reason: `${prevN} → ${curN}` };
      case 'increase':
        return { alert: !first && curN > prevN, reason: t(lang, 'decide.increase', { prev: prevN, cur: curN }) };
      case 'open':
      default:
        // 0(또는 이전 0/미확인) → 1 이상으로 열림
        if (curN > 0 && (first || prevN === 0)) {
          return { alert: true, reason: t(lang, 'decide.opened', { cur: curN, prev: first ? t(lang, 'decide.unknown') : prevN }) };
        }
        return { alert: false, reason: t(lang, 'decide.same', { cur: curN, prev: first ? t(lang, 'decide.unknown') : prevN }) };
    }
  }

  if (cur.kind === 'contains') {
    const when = watcher.alertWhen || 'present';
    if (when === 'change') {
      return { alert: !first && prev.signal !== cur.signal, reason: `${prev?.signal} → ${cur.signal}` };
    }
    // present/absent 로 "바뀌었을 때"만
    const matches = cur.signal === when;
    const changed = first ? matches : prev.signal !== cur.signal;
    return { alert: matches && changed, reason: `${watcher.needle}: ${cur.signal}` };
  }

  if (cur.kind === 'regex') {
    return { alert: !first && prev.signal !== cur.signal, reason: `${prev?.signal} → ${cur.signal}` };
  }

  return { alert: false, reason: t(lang, 'decide.noRule') };
}
