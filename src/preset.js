// `qnet-alert init --preset gineungsa`: 질문 없이 만드는 기능사 감시 설정 (비밀값 없음).
import { QNET_STATUS_PAGE } from './qnet.js';

export const PRESETS = ['gineungsa'];

export function gineungsaConfig() {
  return {
    comment: [
      'ALERT ONLY: no login, no registration, no payment.',
      'WHAT THIS CAN SEE: the public 원서접수현황 list (exam name + 접수기간). It alerts once when a NEW 기능사 필기 entry (a written-exam application window) appears, and every minute posts a table image with a KST time header.',
      'WHAT THIS CANNOT SEE: remaining seats (잔여석). Q-Net shows seat counts only after login, so no seat alert is possible from this page.',
      'Secrets go in .env (QNET_DISCORD_WEBHOOK, QNET_MENTION_USERS = your Discord user ID). Never commit them.',
    ].join(' '),
    intervalMin: 1,
    jitter: 0.1,
    politeDelayMs: 1500,
    failureAlertAfter: 10,
    lang: 'ko',
    statePath: 'state.json',
    tableImage: { every: true },
    watchers: [{
      name: '기능사 필기 접수 개시',
      type: 'newrows',
      pattern: '기능사.*필기',
      url: QNET_STATUS_PAGE,
      linkUrl: QNET_STATUS_PAGE,
    }],
  };
}

export function presetConfig(name) {
  if (name === 'gineungsa') return gineungsaConfig();
  throw new Error(`unknown preset '${name}' (available: ${PRESETS.join(', ')})`);
}
