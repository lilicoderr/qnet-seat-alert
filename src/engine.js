// 폴링 엔진: 각 워처를 가져와 평가하고, 변화가 있으면 Discord 로 알림.

import { evaluate } from './extract.js';
import { decide } from './watcher.js';
import { sendAlert } from './discord.js';

const DEFAULT_FETCH = (...a) => globalThis.fetch(...a);

const POLITE_UA =
  'qnet-seat-alert/1.0 (personal use; polling respectfully)';

// 워처 하나를 가져와 평가/비교. 네트워크 주입 가능.
export async function runWatcher(watcher, { store, fetchImpl = DEFAULT_FETCH, timeoutMs = 15000 } = {}) {
  const id = watcher.id || watcher.name || watcher.url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let text = '';
  let httpStatus = 0;
  try {
    const res = await fetchImpl(watcher.url, {
      method: watcher.method || 'GET',
      headers: { 'User-Agent': POLITE_UA, Accept: '*/*', ...(watcher.headers || {}) },
      body: watcher.body,
      signal: ctrl.signal,
    });
    httpStatus = res.status;
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    return { id, name: watcher.name, ok: false, error: e.message, alerted: false };
  }
  clearTimeout(timer);

  const cur = evaluate(watcher, text);
  const prev = store?.get(id);
  const verdict = decide(prev, cur, watcher);

  // 현재 신호 저장 (항상 최신으로)
  store?.set(id, { signal: cur.signal, kind: cur.kind });

  return {
    id,
    name: watcher.name,
    ok: true,
    httpStatus,
    signal: cur.signal,
    available: cur.available ?? null,
    detail: cur.detail,
    shouldAlert: verdict.alert,
    reason: verdict.reason,
    alerted: false,
  };
}

// 전체 설정 1회 실행. 알림까지 보낸다.
export async function runOnce(config, { store, fetchImpl = DEFAULT_FETCH, log = () => {} } = {}) {
  const results = [];
  for (const watcher of config.watchers || []) {
    if (watcher.enabled === false) continue;
    const r = await runWatcher(watcher, { store, fetchImpl });
    if (r.ok && r.shouldAlert) {
      const webhook = watcher.webhookUrl || config.webhookUrl;
      if (webhook) {
        try {
          await sendAlert(
            webhook,
            buildAlertPayload(watcher, r),
            { fetchImpl, username: config.username || 'Q-Net 빈자리 알림' },
          );
          r.alerted = true;
        } catch (e) {
          r.alertError = e.message;
        }
      } else {
        r.alertError = '웹훅 URL 없음';
      }
    }
    log(formatLine(r));
    results.push(r);
    // 서버 부담을 줄이기 위한 짧은 간격
    if (config.politeDelayMs) await sleep(config.politeDelayMs);
  }
  return results;
}

export function buildAlertPayload(watcher, r) {
  const fields = [];
  if (r.available !== null && r.available !== undefined) {
    fields.push({ name: '빈자리', value: `${r.available}석`, inline: true });
  }
  if (r.detail && typeof r.detail === 'object' && r.detail.capacity != null) {
    fields.push({ name: '정원/접수', value: `${r.detail.applied}/${r.detail.capacity}`, inline: true });
  }
  return {
    title: `🔔 ${watcher.name || 'Q-Net'} 변화 감지`,
    description: r.reason,
    url: watcher.linkUrl || watcher.url,
    color: (r.available ?? 1) > 0 ? 0x2b8a3e : 0x868e96,
    fields,
    content: watcher.mention || '',
  };
}

function formatLine(r) {
  const flag = r.alerted ? '📨 알림보냄' : r.shouldAlert ? '⚠️ 알림실패' : '·';
  const sig = r.ok ? `signal=${r.signal}` : `오류: ${r.error}`;
  return `[${r.name || r.id}] ${sig} ${r.reason ? `(${r.reason})` : ''} ${flag}${r.alertError ? ` [${r.alertError}]` : ''}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
