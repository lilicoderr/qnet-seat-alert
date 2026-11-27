// 하트비트: N시간마다 "아직 감시 중" 알림 한 번 — 조용히 죽은 감시기를 알아채기 위한 것.
// 첫 실행에는 기준 시각만 기록하고 보내지 않는다(시작할 때마다 스팸 방지).

import { notifyAll, resolveNotifiers } from './notify.js';

const KEY = '__heartbeat';

export function heartbeatDue(config, store, now = Date.now()) {
  const hours = Number(config.heartbeatHours) || 0;
  if (hours <= 0) return { due: false, first: false };
  const prev = store.get(KEY);
  if (!prev || !prev.at) return { due: false, first: true };
  return { due: now - prev.at >= hours * 3600 * 1000, first: false };
}

export function buildHeartbeatPayload(results = [], uptimeMs = 0) {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.length - ok;
  const lines = results.map((r) => `${r.ok ? '✅' : '❌'} ${r.name || r.id}${r.ok ? ` · signal=${r.signal}` : ` · ${r.error}`}`);
  return {
    title: '💓 Q-Net 감시기 정상 동작 중',
    description: `워처 ${results.length}개 (정상 ${ok}, 오류 ${bad}) · 가동 ${Math.floor(uptimeMs / 3600000)}시간\n${lines.join('\n')}`.slice(0, 1800),
    color: bad ? 0xf08c00 : 0x2b8a3e,
  };
}

// 필요할 때만 보낸다. 반환: 'sent' | 'skipped' | 'first' | 'failed'
export async function maybeHeartbeat(config, { store, results, fetchImpl, now = Date.now, startedAt = now() } = {}) {
  const { due, first } = heartbeatDue(config, store, now());
  if (first) {
    store.set(KEY, {});
    return 'first';
  }
  if (!due) return 'skipped';
  const notifiers = resolveNotifiers(config);
  if (notifiers.length === 0) return 'skipped';
  const { delivered } = await notifyAll(notifiers, buildHeartbeatPayload(results, now() - startedAt), {
    fetchImpl,
    username: config.username || 'Q-Net 빈자리 알림',
  });
  if (delivered > 0) {
    store.set(KEY, {});
    return 'sent';
  }
  return 'failed';
}
