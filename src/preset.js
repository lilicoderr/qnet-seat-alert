// `qnet-alert init --preset gineungsa`: 질문 없이 만드는 기능사 감시 설정 (비밀값 없음).
import { QNET_STATUS_PAGE } from './qnet.js';

export const PRESETS = ['gineungsa'];

export function gineungsaConfig({ jongmok = '전기기능사', region = '' } = {}) {
  return {
    comment: [
      'ALERT ONLY: no login, no registration, no payment.',
      'WHAT THIS CAN SEE: the public 원서접수현황 list (exam name + 접수기간). It alerts once when a NEW 기능사 필기 entry (a written-exam application window) appears, and every minute posts a table image with a KST time header.',
      'SEATS: the first watcher (type qnet) reads per-venue capacity and remaining seats from the public Q-Net venue lookup (no login) for the open 기능사 exam and the 종목 named in jongmok. Set jongmok/region to yours. Cost: 1 request per result page per check; the static steps are cached for 30 minutes. When no matching exam is open it reports 0 quietly. If jongmok is not offered by the open exam the check shows a parser-broken alert that lists the valid names.',
      'LIMITS: a numeric remaining-seat value has not yet been seen live (all venues were 마감 when verified); only 마감/number cells are understood and anything else raises parser-broken instead of guessing.',
      'Secrets go in .env (QNET_DISCORD_WEBHOOK, QNET_MENTION_USERS = your Discord user ID). Never commit them.',
    ].join(' '),
    intervalMin: 1,
    jitter: 0.1,
    politeDelayMs: 1500,
    failureAlertAfter: 10,
    lang: 'ko',
    statePath: 'state.json',
    tableImage: { every: true },
    watchers: [{ name: '기능사 잔여석 (' + jongmok + (region ? ', ' + region : '') + ')', type: 'qnet', examPattern: '기능사', jongmok, ...(region ? { region } : {}), url: QNET_STATUS_PAGE, linkUrl: QNET_STATUS_PAGE }, {
      name: '기능사 필기 접수 개시',
      type: 'newrows',
      pattern: '기능사.*필기',
      url: QNET_STATUS_PAGE,
      linkUrl: QNET_STATUS_PAGE,
    }],
  };
}

export function presetConfig(name, opts) {
  if (name === 'gineungsa') return gineungsaConfig(opts);
  throw new Error(`unknown preset '${name}' (available: ${PRESETS.join(', ')})`);
}
