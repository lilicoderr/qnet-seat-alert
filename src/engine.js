// 폴링 엔진: 각 워처를 가져와 평가하고, 변화가 있으면 Discord 로 알림.

import { evaluate } from './extract.js';
import { applyNewRows } from './newrows.js';
import { decide } from './watcher.js';
import { filterRows } from './filter.js';
import { formatLine } from './log.js';
import { notifyAll, resolveNotifiers } from './notify.js';
import { renderTemplate, varsFor } from './template.js';
import { buildParserBrokenPayload } from './parser-alert.js';
import { langOf, t, usernameOf } from './i18n.js';
import { buildDigestPayload } from './digest.js';
import { inQuietHours, takeRateSlot } from './throttle.js';
import { holdAlert, dropHeld, flushHeld } from './held.js';
import { isDue } from './cron.js';
import { prepareTableImage, notifyAllWithImage, tableImageConfig } from './table-image.js';
import { mentionsFromConfig, mentionDue, recordMention } from './mentions.js';

const DEFAULT_FETCH = (...a) => globalThis.fetch(...a);

import { POLITE_UA } from './polite.js';
import { readBody, isMaintenancePage } from './body.js';
import { fetchQnetSeats } from './qnet-chain.js';
import { QnetLayoutError } from './qnet-seats.js';

// 일시적 오류(네트워크·5xx·429)는 지수 백오프로 재시도한다.
export function backoffMs(attempt, baseMs = 1000, maxMs = 30000) {
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

// 다시 해도 소용없는 응답(4xx, 점검 안내)은 곧바로 포기한다.
const fatal = (message) => Object.assign(new Error(message), { fatal: true });

async function fetchWithRetry(watcher, { fetchImpl, timeoutMs, retries, baseMs, sleepImpl, noRetryStatus }) {
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
      // 오류 응답(4xx/5xx) 본문은 파싱하지 않는다: 오류 페이지를 좌석 정보로 오인하지 않도록 실패로 처리
      if (res.status >= 400 && (!retryable || attempt === retries || res.status === noRetryStatus)) throw fatal(`HTTP ${res.status}`);
      if (!retryable) {
        const body = await readBody(res);
        if (isMaintenancePage(body)) throw fatal('Q-Net maintenance page (점검 중)');
        return { status: res.status, text: body, attempts: attempt + 1 };
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (e.fatal || attempt === retries) break;
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
  { store, fetchImpl = DEFAULT_FETCH, timeoutMs = 15000, retries = 2, backoffBaseMs = 1000, sleepImpl = sleep, lang = 'ko' } = {},
) {
  const id = watcher.id || watcher.name || watcher.url;
  let text = '';
  let httpStatus = 0;
  let layoutNote = '';
  try {
    const opts = { fetchImpl, timeoutMs, retries, baseMs: backoffBaseMs, sleepImpl };
    if (watcher.type === 'qnet') {
      // 읽기 전용 다단계 조회. 레이아웃 변경은 빈 본문(=신호 없음 → parser broken 알림 경로)으로 처리한다.
      // Q-Net 429 는 즉시 재시도하지 않는다: qnet-chain 의 백오프에 맡긴다
      const fetchText = async (req) => (await fetchWithRetry({ ...req, headers: { ...req.headers, ...(watcher.headers || {}) } }, { ...opts, noRetryStatus: 429 })).text;
      try { text = (await fetchQnetSeats(watcher, fetchText, { sleep: sleepImpl })).text; } catch (e) { if (!(e instanceof QnetLayoutError)) throw e; text = ''; layoutNote = e.message; }
      httpStatus = 200;
    } else {
      const got = await fetchWithRetry(watcher, opts);
      text = got.text;
      httpStatus = got.status;
    }
  } catch (e) {
    const prev = store?.get(id);
    const failures = (prev?.failures || 0) + 1;
    store?.set(id, { ...(prev || {}), failures });
    return { id, name: watcher.name, ok: false, error: e.message, failures, alerted: false };
  }

  const rawText = text;
  if (watcher.type !== 'jsonseats' && watcher.type !== 'qnet') text = filterRows(text, watcher).text;
  const prev = store?.get(id);
  const cur0 = applyNewRows(evaluate(watcher, text), prev, watcher);
  const cur = layoutNote ? { ...cur0, detail: layoutNote } : cur0;
  const verdict = decide(prev, cur, watcher, lang);

  // 현재 신호 저장 (항상 최신으로)
  // 신호를 못 뽑았으면 이전 신호는 보존하고 연속 횟수만 센다 (복구 시 정상 비교)
  const nullStreak = cur.signal === null || cur.signal === undefined ? (prev?.nullStreak || 0) + 1 : 0;
  store?.set(id, nullStreak ? { ...(prev || {}), kind: cur.kind, failures: 0, nullStreak } : { signal: cur.signal, kind: cur.kind, failures: 0, nullStreak: 0 });

  const result = {
    id,
    name: watcher.name,
    ok: true,
    httpStatus,
    signal: cur.signal,
    available: cur.available ?? null,
    detail: cur.detail,
    shouldAlert: verdict.alert,
    reason: verdict.reason,
    nullStreak,
    newRows: cur.newKeys,
    alerted: false,
  };
  // 현황표 이미지용 원문 (JSON/로그에는 나오지 않도록 열거 불가)
  Object.defineProperty(result, 'rawText', { value: rawText, enumerable: false });
  return result;
}

// 전체 설정 1회 실행. 알림까지 보낸다.
export async function runOnce(config, { store, fetchImpl = DEFAULT_FETCH, log = () => {}, logger, dry = false, now = () => Date.now(), ...runOpts } = {}) {
  const emit = (r, extra = '') => (logger ? logger.result(r) : log(`${formatLine(r)}${extra}`));
  const results = [];
  const pending = [];
  const quiet = inQuietHours(config.quietHours, new Date(now()));
  for (const watcher of config.watchers || []) {
    if (watcher.enabled === false) continue;
    if (watcher.schedule && !dry && !scheduleDue(watcher, store, now())) continue;
    const before = store?.get(watcher.id || watcher.name || watcher.url);
    const r = await runWatcher(watcher, { store, fetchImpl, lang: langOf(config), ...runOpts });
    if (dry) {
      r.dry = true;
      emit(r);
      results.push(r);
      if (config.politeDelayMs) await sleep(config.politeDelayMs);
      continue;
    }
    // 보류해 둔 알림은 그 사이 자리가 닫혔으면 버린다 (낡은 알림/멘션 방지)
    if (r.ok && r.available === 0) dropHeld(store, r.id);
    // 멘션이 설정돼 있으면 빈자리가 보이는 동안 매 체크(쿨다운 반영) 다시 알린다
    const mm = mentionsFromConfig(config);
    if (r.ok && !r.shouldAlert && mm.any && mm.whileAvailable && r.available > 0 && mentionDue(mm, store, r.id, now())) {
      r.shouldAlert = true;
      r.reason = t(langOf(config), 'decide.stillOpen', { n: r.available });
    }
    const wanted = r.ok && r.shouldAlert;
    const send = wanted && gateAlert(config, { store, watcher, r, quiet, now });
    const toDigest = send && config.digest && !watcher.webhookUrl;
    // 멘션은 알림이 게이트(조용한 시간/빈도 제한)를 통과하고 쿨다운이 지났을 때만, 전송에 성공하면 기록한다
    const ping = send && mm.any && (r.available > 0 || r.newRows?.length > 0) && mentionDue(mm, store, r.id, now());
    if (toDigest) pending.push({ watcher, r, ping, before });
    const imageOn = !!tableImageConfig(config);
    const imgOpts = { config, watcher, r, store, now: now(), renderImpl: runOpts.renderImpl };
    if (send && !toDigest) {
      const notifiers = resolveNotifiers(config, watcher);
      if (notifiers.length > 0) {
        const payload = buildAlertPayload(watcher, r, config);
        if (!ping) payload.mentions = undefined;
        let img = null;
        if (imageOn) {
          try { img = await prepareTableImage({ ...imgOpts, attach: true }); } catch (e) { r.alertError = `image: ${e.message}`; }
        }
        const opts = { fetchImpl, username: usernameOf(config) };
        const { delivered, errors } = img
          ? await notifyAllWithImage(notifiers, img.png, { ...opts, payload, caption: img.caption })
          : await notifyAll(notifiers, payload, opts);
        r.alerted = delivered > 0;
        if (delivered > 0) img?.commit();
        if (errors.length) r.alertError = [r.alertError, errors.join('; ')].filter(Boolean).join('; ');
        settleAlert(store, r, { ping, before, now: now() });
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
          title: t(langOf(config), 'fail.title', { name: watcher.name || 'Q-Net' }),
          description: t(langOf(config), 'fail.desc', { n: r.failures, err: r.error }),
          url: watcher.linkUrl || watcher.url,
          color: 0xe03131,
        }, { fetchImpl, username: usernameOf(config) });
        r.alerted = delivered > 0;
      }
    }
    const plimit = config.parserAlertAfter ?? 3;
    if (r.ok && plimit > 0 && r.nullStreak === plimit) {
      const notifiers = resolveNotifiers(config, watcher);
      if (notifiers.length) {
        const { delivered } = await notifyAll(notifiers, buildParserBrokenPayload(watcher, r, langOf(config)), { fetchImpl, username: usernameOf(config) });
        r.alerted = delivered > 0;
      }
    }
    // 알림이 없는 체크: 이미지 전용 메시지(멘션 없음). 조용한 시간엔 아무것도 보내지 않고, 빈도 제한을 따른다.
    // 알림이 있었으나 게이트에 막혔다면(빈도 제한 등) 이미지도 보내지 않는다.
    if (imageOn && !quiet && (!wanted || toDigest)) {
      const notifiers = resolveNotifiers(config, watcher);
      try {
        const img = notifiers.length ? await prepareTableImage({ ...imgOpts, gate: () => takeRateSlot(config, store, now(), '__rate:image') }) : null;
        if (img) {
          const { errors } = await notifyAllWithImage(notifiers, img.png, { fetchImpl, username: usernameOf(config), caption: img.caption });
          if (errors.length) r.alertError = [r.alertError, ...errors].filter(Boolean).join('; ');
          else img.commit();
        }
      } catch (e) { r.alertError = [r.alertError, `image: ${e.message}`].filter(Boolean).join('; '); }
    }
    emit(r);
    results.push(r);
    // 서버 부담을 줄이기 위한 짧은 간격
    if (config.politeDelayMs) await sleep(config.politeDelayMs);
  }
  if (pending.length) await sendDigest(config, pending, { store, fetchImpl, now });
  // 보류분은 이번 체크 결과를 본 뒤에 보낸다 (방금 보낸 알림과 겹치지 않게)
  if (!dry && !quiet) await flushHeld(config, { store, fetchImpl, log, now });
  return results;
}

// 워처별 cron 일정: 마지막 실행 이후 일정에 맞는 분이 있으면 실행한다.
function scheduleDue(watcher, store, nowMs) {
  const key = `__sched:${watcher.id || watcher.name || watcher.url}`;
  const due = isDue(watcher.schedule, store?.get(key)?.last, nowMs);
  if (due) store?.set(key, { last: nowMs });
  return due;
}

// 전송 결과 반영: 성공이면 멘션 기록 + 보류분 정리, 전부 실패면 이전 신호로 되돌려 다음 체크에 다시 알린다.
function settleAlert(store, r, { ping, before, now }) {
  if (r.alerted) {
    if (ping) recordMention(store, r.id, now);
    if (r.available !== null) dropHeld(store, r.id);
    return;
  }
  const cur = store?.get(r.id);
  if (cur) store.set(r.id, { ...cur, signal: before?.signal });
}

async function sendDigest(config, pending, { store, fetchImpl, now }) {
  const notifiers = resolveNotifiers(config);
  const payload = pending.length === 1 ? buildAlertPayload(pending[0].watcher, pending[0].r, config) : buildDigestPayload(pending, langOf(config));
  payload.mentions = pending.some((p) => p.ping) ? mentionsFromConfig(config) : undefined;
  if (!notifiers.length) {
    for (const { r } of pending) r.alertError = '알림 채널 없음';
    return;
  }
  const { delivered, errors } = await notifyAll(notifiers, payload, { fetchImpl, username: usernameOf(config) });
  for (const { r, ping, before } of pending) {
    r.alerted = delivered > 0;
    if (errors.length) r.alertError = errors.join('; ');
    settleAlert(store, r, { ping, before, now: now() });
  }
}

// 조용한 시간이면 보류, 빈도 제한이면 건너뜀. 지금 보내도 되면 true.
function gateAlert(config, { store, watcher, r, quiet, now }) {
  if (quiet) {
    holdAlert(store, r.id, buildAlertPayload(watcher, r, config), { append: r.newRows?.length > 0 });
    r.alertError = '조용한 시간: 끝난 뒤 전송';
    return false;
  }
  if (!takeRateSlot(config, store, now())) {
    r.alertError = '빈도 제한(rateLimit): 건너뜀';
    return false;
  }
  return true;
}

export { flushHeld };

export function buildAlertPayload(watcher, r, config = {}) {
  const tpl = { ...(config.templates || {}), ...(watcher.template || {}) };
  const vars = varsFor(watcher, r);
  const lang = langOf(config);
  const fields = [];
  if (r.available !== null && r.available !== undefined) {
    fields.push({ name: t(lang, 'field.seats'), value: t(lang, 'field.seatsVal', { n: r.available }), inline: true });
  }
  if (r.detail && typeof r.detail === 'object' && r.detail.capacity != null) {
    fields.push({ name: t(lang, 'field.cap'), value: `${r.detail.applied}/${r.detail.capacity}`, inline: true });
  }
  return {
    title: tpl.title ? renderTemplate(tpl.title, vars) : t(lang, 'alert.title', { name: watcher.name || 'Q-Net' }),
    description: tpl.description ? renderTemplate(tpl.description, vars) : r.reason,
    url: watcher.linkUrl || watcher.url,
    color: (r.available ?? 1) > 0 ? 0x2b8a3e : 0x868e96,
    fields,
    linkLabel: t(lang, 'openLink'),
    content: watcher.mention || '',
    mentions: (r.available ?? 1) > 0 ? mentionsFromConfig(config) : undefined,
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
