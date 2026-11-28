// 웹 UI 의 감시 시작/중지. CLI 와 같은 엔진(runOnce)을 같은 프로세스에서 돌린다.
// 예의: 시작/중지를 반복해도 직전 확인에서 60초가 지나기 전에는 다시 확인하지 않는다.
import path from 'node:path';
import { runOnce } from '../engine.js';
import { createStore } from '../store.js';
import { appendHistory } from '../history.js';
import { maybeHeartbeat } from '../heartbeat.js';
import { validateConfig } from '../validate.js';
import { loadPlugins } from '../plugins.js';
import { nextDelayMs, DEFAULT_JITTER, MIN_INTERVAL_MIN } from '../polite.js';
import { qnetVenues } from '../extract.js';
import { resolveNotifiers } from '../notify.js';
import { redactAll } from '../redact.js';
import { readConfig } from './settings.js';
import { HttpError } from './security.js';

export function createWatch({ configFile, cwd = path.dirname(configFile), runDeps = {}, logger, log = () => {}, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let running = false;
  let timer = null;
  let current = null; // 진행 중인 확인 (겹쳐 돌지 않게)
  let startedAt = null;
  let lastCheckAt = null;
  let nextCheckAt = null;
  let lastError = null;
  let results = [];
  let store = null;
  let storeFile = null;

  async function loadChecked() {
    const config = readConfig(configFile);
    if (!config) throw new HttpError(409, 'no_config', '먼저 설정을 저장하세요.');
    if (config.plugins?.length) await loadPlugins(config.plugins, { cwd: path.dirname(configFile) });
    const v = validateConfig(config, { requireWebhook: true });
    if (!v.ok) throw new HttpError(409, 'invalid_config', v.errors.join(' / '));
    if (!(config.watchers || []).some((w) => w.enabled !== false)) throw new HttpError(409, 'no_watchers', '활성화된 감시 항목이 없습니다.');
    return config;
  }

  const clean = (msg, config) => (msg ? redactAll(msg, resolveNotifiers(config)).slice(0, 400) : null);

  const summarize = (r, config) => ({
    name: r.name || r.id, ok: r.ok, available: r.available ?? null, alerted: !!r.alerted,
    error: clean(r.error || r.alertError, config),
    // 값을 못 읽은 이유 (종목 오타, 페이지 구조 변경 등)
    note: r.ok && r.signal === null && typeof r.detail === 'string' ? clean(r.detail, config) : null,
    venues: r.detail?.source === 'qnet' && r.rawText ? qnetVenues(r.rawText) : null,
  });

  async function tick() {
    let config;
    try {
      config = await loadChecked();
      const file = path.resolve(cwd, config.statePath || 'state.json');
      if (file !== storeFile) { store = createStore(file); storeFile = file; }
      lastCheckAt = now();
      const out = await runOnce(config, { store, logger, now, ...runDeps });
      results = out.map((r) => summarize(r, config));
      if (config.historyPath) appendHistory(path.resolve(cwd, config.historyPath), out, now());
      await maybeHeartbeat(config, { store, results: out, now, startedAt, fetchImpl: runDeps.fetchImpl });
      lastError = null;
    } catch (e) {
      lastError = config ? clean(e.message, config) : e.message;
      log(`[ui] 확인 오류: ${lastError}`);
    }
    return config;
  }

  const earliest = () => (lastCheckAt === null ? now() : Math.max(now(), lastCheckAt + MIN_INTERVAL_MIN * 60000));

  function schedule(at) {
    clearTimer(timer);
    nextCheckAt = at;
    timer = setTimer(fire, Math.max(0, at - now()));
  }

  async function fire() {
    if (!running || current) return;
    nextCheckAt = null;
    current = tick();
    const config = await current;
    current = null;
    if (!running) return;
    let intervalMin = 5;
    let jitter = DEFAULT_JITTER;
    if (config) { intervalMin = Number(config.intervalMin) || 5; jitter = config.jitter ?? DEFAULT_JITTER; }
    schedule(now() + nextDelayMs(intervalMin, jitter));
  }

  return {
    async start() {
      if (running) return;
      await loadChecked();
      if (running) return;
      running = true;
      startedAt = now();
      if (!current) schedule(earliest());
    },
    stop() {
      running = false;
      clearTimer(timer);
      timer = null;
      nextCheckAt = null;
    },
    // 설정이 바뀌면 이전 결과를 지우고, 감시 중이면 되도록 빨리(60초 규칙 안에서) 다시 확인한다.
    configChanged() {
      results = [];
      lastError = null;
      if (running && !current) schedule(earliest());
    },
    settled: () => current || Promise.resolve(),
    status: () => ({ running, checking: !!current, lastCheckAt, nextCheckAt, lastError, results }),
  };
}
