// 웹 UI 의 API: 서버(보안) + 선택 목록 + 설정 저장 + 감시 + 그래프를 묶는다.
import path from 'node:path';
import { createUiServer } from './server.js';
import { createOptions } from './options.js';
import { createWatch } from './watch.js';
import { readHistoryTail, venueSeries } from './chart-data.js';
import { checkInterval, requestCost, readConfig, saveConfig, buildUiConfig, uiWatcherIndex, saveSecrets, secretStatus } from './settings.js';
import { loadAssets } from './assets.js';
import { HttpError } from './security.js';
import { resolveNotifiers, notifyAll } from '../notify.js';
import { mentionsFromConfig } from '../mentions.js';
import { redactAll } from '../redact.js';
import { usernameOf } from '../i18n.js';
import { DISCLAIMER } from '../qnet.js';

const TEST_GAP_MS = 10000;
const text = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');

export function createUiApp({ configFile, envFile, cwd = path.dirname(configFile), env = process.env, fetchImpl, runDeps = {}, logger, log = () => {}, now = () => Date.now(), sleep, token, setTimer } = {}) {
  const options = createOptions({ now, ...(fetchImpl ? { fetchImpl } : {}), ...(sleep ? { sleep } : {}) });
  const watch = createWatch({ configFile, cwd, logger, log, now, ...(setTimer ? { setTimer } : {}), runDeps: { ...(fetchImpl ? { fetchImpl } : {}), ...runDeps } });
  let lastTestAt = -Infinity;

  const safeConfig = () => { try { return readConfig(configFile); } catch { return null; } };
  const scrub = (s) => redactAll(s, resolveNotifiers(safeConfig() || {}, {}, env));

  // 화면에 필요한 것만 골라 돌려준다. 설정 원문(웹훅/토큰이 있을 수 있음)은 내보내지 않는다.
  function view() {
    const config = readConfig(configFile);
    const watchers = config?.watchers || [];
    const at = uiWatcherIndex(watchers);
    const w = at >= 0 ? watchers[at] : null;
    const others = watchers.filter((x, i) => i !== at && x.enabled !== false).length;
    const intervalMin = Math.max(1, Number(config?.intervalMin) || 1);
    const selection = w ? { name: String(w.name || ''), examPattern: String(w.examPattern || '기능사'), jongmok: String(w.jongmok || ''), region: String(w.region || '') } : null;
    return {
      selection, intervalMin, others,
      secrets: secretStatus(env),
      channelCount: resolveNotifiers(config || {}, {}, env).length,
      cost: requestCost(Math.min(1440, intervalMin), { region: selection?.region, others }),
      watch: watch.status(),
      disclaimer: DISCLAIMER,
      sample: env.QNET_UI_SAMPLE === '1', // 문서용 스크린샷 표시 (가짜 fixture 데이터임을 화면에 밝힌다)
    };
  }

  const routes = {
    'GET /api/state': async () => view(),
    'GET /api/status': async () => watch.status(),
    // 아래 목록 조회는 Q-Net 에 요청을 보내므로 POST (Origin 검사를 받는다). 사용자가 버튼을 누를 때만 호출된다.
    'POST /api/options/exams': async () => options.exams(),
    'POST /api/options/jongmok': async (b) => options.jongmok(text(b.exam)),
    'POST /api/options/regions': async (b) => options.regions(text(b.exam), text(b.jongmok)),
    'POST /api/cost': async (b) => requestCost(b.intervalMin, { region: text(b.region), others: view().others }),
    'POST /api/settings': async (b) => {
      const intervalMin = checkInterval(b.intervalMin);
      const prev = readConfig(configFile);
      let next;
      if (b.exam) next = buildUiConfig(prev, await options.resolve(text(b.exam), text(b.jongmok), text(b.region)), intervalMin);
      else if (prev) next = { ...prev, intervalMin }; // 간격만 바꾸기
      else throw new HttpError(400, 'no_selection', '시험, 종목, 지역을 먼저 선택하세요.');
      saveConfig(configFile, next);
      watch.configChanged();
      return view();
    },
    'POST /api/secrets': async (b) => saveSecrets(envFile, b, env),
    'POST /api/test-alert': async () => {
      const config = readConfig(configFile) || {};
      const notifiers = resolveNotifiers(config, {}, env);
      if (!notifiers.length) throw new HttpError(409, 'no_channel', '알림 채널이 없습니다. 먼저 Discord 웹훅을 저장하세요.');
      if (now() - lastTestAt < TEST_GAP_MS) throw new HttpError(429, 'cooldown', '테스트 알림은 10초에 한 번만 보낼 수 있습니다.');
      lastTestAt = now();
      const { delivered, errors } = await notifyAll(notifiers, {
        title: '🔔 qnet-alert 테스트 알림', description: '이 메시지가 보이면 알림 채널이 정상입니다.', color: 0x2b6cb0, linkLabel: '열기', mentions: mentionsFromConfig(config, env),
      }, { username: usernameOf(config), ...(fetchImpl ? { fetchImpl } : {}) });
      return { delivered, total: notifiers.length, errors: errors.map((e) => redactAll(e, notifiers).slice(0, 300)) };
    },
    'POST /api/watch/start': async () => { await watch.start(); return watch.status(); },
    'POST /api/watch/stop': async () => { watch.stop(); return watch.status(); },
    'GET /api/history': async (q) => {
      const hours = Math.min(168, Math.max(1, Number(q.get('hours')) || 24));
      const config = readConfig(configFile);
      if (!config?.historyPath) return { hours, now: now(), watchers: [] };
      // 읽는 파일은 config 의 historyPath 뿐이다. 요청 값은 경로에 쓰이지 않는다.
      const ids = (config.watchers || []).filter((w) => w.type === 'qnet').map((w) => w.id || w.name || w.url);
      return { hours, now: now(), watchers: venueSeries(readHistoryTail(path.resolve(cwd, config.historyPath)), ids, { hours, now: now() }) };
    },
  };

  const server = createUiServer({ routes, assets: loadAssets(), log, scrub, ...(token ? { token } : {}) });
  server.on('close', () => watch.stop());
  return { server, watch };
}
