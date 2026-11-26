// 폴링 엔진: 각 워처를 가져와 평가하고, 변화가 있으면 Discord 로 알림.

import { evaluate } from './extract.js';
import { decide } from './watcher.js';
import { filterRows } from './filter.js';
import { formatLine } from './log.js';
import { notifyAll, resolveNotifiers } from './notify.js';

const DEFAULT_FETCH = (...a) => globalThis.fetch(...a);

const POLITE_UA =
  'qnet-seat-alert/1.0 (personal use; polling respectfully)';

// 일시적 오류(네트워크·5xx·429)는 지수 백오프로 재시도한다.
export function backoffMs(attempt, baseMs = 1000, maxMs = 30000) {
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

async function fetchWithRetry(watcher, { fetchImpl, timeoutMs, retries, baseMs, sleepImpl }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(watcher.url, {
        method: watcher.method || 'GET',
        headers: { 'User-Agent': POLITE_UA, Accept: '*/*', ...(watcher.headers || {}) },
        body: watcher.body,
        signal: ctrl.signal,
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === retries) return { status: res.status, text: await res.text(), attempts: attempt + 1 };
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
    await sleepImpl(backoffMs(attempt, baseMs));
  }
  throw lastErr;
}

// 워처 하나를 가져와 평가/비교. 네트워크 주입 가능.
export async function runWatcher(
  watcher,
  { store, fetchImpl = DEFAULT_FETCH, timeoutMs = 15000, retries = 2, backoffBaseMs = 1000, sleepImpl = sleep } = {},
) {
  const id = watcher.id || watcher.name || watcher.url;
  let text = '';
  let httpStatus = 0;
  try {
    const got = await fetchWithRetry(watcher, { fetchImpl, timeoutMs, retries, baseMs: backoffBaseMs, sleepImpl });
    text = got.text;
    httpStatus = got.status;
  } catch (e) {
    const prev = store?.get(id);
    const failures = (prev?.failures || 0) + 1;
    store?.set(id, { ...(prev || {}), failures });
    return { id, name: watcher.name, ok: false, error: e.message, failures, alerted: false };
  }

  if (watcher.type !== 'jsonseats') text = filterRows(text, watcher).text;
  const cur = evaluate(watcher, text);
  const prev = store?.get(id);
  const verdict = decide(prev, cur, watcher);

  // 현재 신호 저장 (항상 최신으로)
  store?.set(id, { signal: cur.signal, kind: cur.kind, failures: 0 });

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
export async function runOnce(config, { store, fetchImpl = DEFAULT_FETCH, log = () => {}, logger, dry = false, ...runOpts } = {}) {
  const emit = (r, extra = '') => (logger ? logger.result(r) : log(`${formatLine(r)}${extra}`));
  const results = [];
  for (const watcher of config.watchers || []) {
    if (watcher.enabled === false) continue;
    const r = await runWatcher(watcher, { store, fetchImpl, ...runOpts });
    if (dry) {
      r.dry = true;
      emit(r);
      results.push(r);
      if (config.politeDelayMs) await sleep(config.politeDelayMs);
      continue;
    }
    if (r.ok && r.shouldAlert) {
      const notifiers = resolveNotifiers(config, watcher);
      if (notifiers.length > 0) {
        const { delivered, errors } = await notifyAll(notifiers, buildAlertPayload(watcher, r), {
          fetchImpl,
          username: config.username || 'Q-Net 빈자리 알림',
        });
        r.alerted = delivered > 0;
        if (errors.length) r.alertError = errors.join('; ');
      } else {
        r.alertError = '알림 채널 없음';
      }
    }
    // 연속 실패가 임계치에 닿으면 한 번만 "감시 이상" 알림
    const limit = config.failureAlertAfter ?? 5;
    if (!r.ok && limit > 0 && r.failures === limit) {
      const notifiers = resolveNotifiers(config, watcher);
      if (notifiers.length) {
        const { delivered } = await notifyAll(notifiers, {
          title: `⚠️ ${watcher.name || 'Q-Net'} 감시 오류 지속`,
          description: `${r.failures}회 연속 실패: ${r.error}`,
          url: watcher.linkUrl || watcher.url,
          color: 0xe03131,
        }, { fetchImpl, username: config.username || 'Q-Net 빈자리 알림' });
        r.alerted = delivered > 0;
      }
    }
    emit(r);
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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
