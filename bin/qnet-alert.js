#!/usr/bin/env node
// Q-Net 빈자리 알림 CLI.
//
//   qnet-alert --once            설정의 워처를 1회 검사
//   qnet-alert                   interval 간격으로 반복 (기본: config.intervalMin 분)
//   qnet-alert --config path.json  설정 파일 지정
//
// 설정은 config.json (또는 $QNET_CONFIG). config.example.json 참고.

import fs from 'node:fs';
import path from 'node:path';
import { runOnce, sleep } from '../src/engine.js';
import { createStore, memoryStore } from '../src/store.js';
import { MIN_INTERVAL_MIN, DISCLAIMER } from '../src/qnet.js';
import { nextDelayMs, DEFAULT_JITTER } from '../src/polite.js';
import { loadEnvFile } from '../src/env.js';
import { createLogger } from '../src/log.js';
import { maybeHeartbeat } from '../src/heartbeat.js';
import { createReloader, createWaker } from '../src/reload.js';
import { appendHistory } from '../src/history.js';
import { createMetrics, startMetricsServer } from '../src/metrics.js';

function parseArgs(argv) {
  const args = { once: false, config: process.env.QNET_CONFIG || 'config.json', testWebhook: false, list: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--once') args.once = true;
    else if (argv[i] === '--config') args.config = argv[++i];
    else if (argv[i] === '--test-webhook') args.testWebhook = true;
    else if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--quiet') args.quiet = true;
    else if (argv[i] === '--metrics-port') args.metricsPort = Number(argv[++i]);
    else if (argv[i] === '--dry') { args.dry = true; args.once = true; }
  }
  return args;
}

async function main() {
  if (process.argv[2] === 'init') {
    const { runInit, runPreset } = await import('../src/init.js');
    const arg = (n) => { const k = process.argv.indexOf(n); return k > 0 ? process.argv[k + 1] : undefined; };
    const force = process.argv.includes('--force');
    if (arg('--preset')) runPreset(arg('--preset'), { force, jongmok: arg('--jongmok'), region: arg('--region') });
    else await runInit({ force });
    return;
  }
  if (process.argv[2] === 'stats') {
    const { runStats } = await import('../src/stats-cmd.js');
    await runStats(process.argv.slice(3));
    return;
  }
  // 하위 명령: 이름 -> [모듈, 함수]. 숫자를 돌려주면 종료 코드로 쓴다.
  const SUBCOMMANDS = {
    dashboard: ['../src/dashboard-cmd.js', 'runDashboard'],
    ui: ['../src/ui-cmd.js', 'runUi'],
    doctor: ['../src/doctor-cmd.js', 'runDoctor'],
    test: ['../src/test-cmd.js', 'runTest'],
    export: ['../src/export-cmd.js', 'runExport'],
  };
  if (SUBCOMMANDS[process.argv[2]]) {
    loadEnvFile(process.env.QNET_ENV || '.env');
    const [mod, fn] = SUBCOMMANDS[process.argv[2]];
    const exit = await (await import(mod))[fn](process.argv.slice(3));
    if (typeof exit === 'number') process.exitCode = exit;
    return;
  }
  loadEnvFile(process.env.QNET_ENV || '.env');
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config);
  if (!fs.existsSync(configPath)) {
    console.error(`설정 파일이 없습니다: ${configPath}`);
    console.error('→ 해결: 프로젝트 폴더에서 node bin/qnet-alert.js init --preset gineungsa --jongmok <종목> --region <지역>');
    process.exit(1);
  }
  let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (Array.isArray(config.plugins) && config.plugins.length) {
    const { loadPlugins } = await import('../src/plugins.js');
    try {
      await loadPlugins(config.plugins, { cwd: path.dirname(configPath) });
    } catch (e) {
      console.error(`❌ 플러그인 로드 실패: ${e.message}`);
      process.exit(1);
    }
  }

  // 설정 검증 (dry 모드에선 웹훅 없어도 OK)
  const { validateConfig } = await import('../src/validate.js');
  const v = validateConfig(config, { requireWebhook: !args.dry });
  for (const w of v.warnings) console.error(`⚠️  ${w}`);
  if (!v.ok) {
    for (const e of v.errors) console.error(`❌ ${e}`);
    process.exit(1);
  }

  // --list: 설정된 워처 목록만 출력
  if (args.list) {
    const all = config.watchers || [];
    console.log(`워처 ${all.length}개 (설정: ${configPath}):`);
    for (const w of all) {
      console.log(`  [${w.enabled === false ? ' ' : 'x'}] ${w.name} · ${w.type} · ${w.alertOn || w.alertWhen || ''} · ${w.url}`);
    }
    return;
  }

  // --test-webhook: 설정된 모든 알림 채널에 테스트 메시지 전송
  if (args.testWebhook) {
    const { notifyAll, resolveNotifiers } = await import('../src/notify.js');
    const notifiers = resolveNotifiers(config);
    if (notifiers.length === 0) {
      console.error('❌ 알림 채널이 없습니다.');
      process.exit(1);
    }
    const { delivered, errors } = await notifyAll(notifiers, {
      title: '🔔 Q-Net 빈자리 알림 — 테스트',
      description: '이 메시지가 보이면 알림 채널이 정상이에요.',
      color: 0x2b6cb0,
    }, { username: config.username || 'Q-Net 빈자리 알림' });
    for (const e of errors) console.error(`❌ ${e}`);
    if (delivered > 0) console.log(`✅ ${delivered}개 채널로 테스트 메시지를 보냈어요.`);
    if (errors.length) process.exit(1);
    return;
  }

  // --dry 는 상태를 저장하지 않는다: 저장하면 이후 실제 실행의 첫 '열림' 알림이 사라질 수 있다
  const store = args.dry ? memoryStore() : createStore(config.statePath);
  const watchers = (config.watchers || []).filter((w) => w.enabled !== false);
  if (watchers.length === 0) {
    console.error('활성화된 watcher 가 없습니다.');
    process.exit(1);
  }

  const intervalOf = (c) => Math.max(MIN_INTERVAL_MIN, Number(c.intervalMin) || 5);
  let intervalMin = intervalOf(config);
  const { validateConfig: validateNew } = await import('../src/validate.js');
  const { loadPlugins } = await import('../src/plugins.js');
  const reloader = createReloader({
    file: configPath,
    initial: config,
    validate: (c) => validateNew(c, { requireWebhook: !args.dry }),
    prepare: (c) => loadPlugins(c.plugins || [], { cwd: path.dirname(configPath) }).then(() => {}),
  });
  let hupPending = false;
  const waker = createWaker();
  if (!args.once && process.platform !== 'win32') {
    process.on('SIGHUP', () => { hupPending = true; waker.wake(); });
  }
  console.error(`[qnet-alert] 워처 ${watchers.length}개, 간격 ${intervalMin}분${args.once ? ' (1회)' : ''}`);
  console.error(`[주의] ${DISCLAIMER}`);

  const logger = createLogger({ json: args.json, quiet: args.quiet });

  const metrics = createMetrics();
  const metricsPort = args.metricsPort || config.metricsPort;
  if (metricsPort && !args.once) {
    try {
      await startMetricsServer(metrics, { port: metricsPort, host: config.metricsHost });
      console.error(`[metrics] http://${config.metricsHost || '127.0.0.1'}:${metricsPort}/metrics`);
    } catch (e) {
      console.error(`[metrics] 서버 시작 실패: ${e.message}`);
    }
  }

  const startedAt = Date.now();
  const tick = async () => {
    try {
      const rr = await reloader.check({ force: hupPending });
      hupPending = false;
      for (const e of rr.errors) console.error(`[reload] ❌ ${e} (이전 설정 유지)`);
      if (rr.changed) {
        config = rr.config;
        intervalMin = intervalOf(config);
        logger.info(`🔄 설정 다시 불러옴 (워처 ${(config.watchers || []).length}개, 간격 ${intervalMin}분)`);
      }
      const results = await runOnce(config, { store, logger, dry: args.dry });
      metrics.record(results);
      if (config.historyPath && !args.dry) appendHistory(config.historyPath, results);
      if (!args.dry) {
        const hb = await maybeHeartbeat(config, { store, results, startedAt });
        if (hb === 'sent') logger.info('💓 하트비트 전송');
      }
    } catch (e) {
      console.error('[tick 오류]', e.message);
    }
  };

  await tick();
  if (args.once) return;

  // 간격 반복 (SIGINT 로 종료)
  let running = true;
  process.on('SIGINT', () => { running = false; console.error('\n종료합니다.'); process.exit(0); });
  while (running) {
    // 설정 파일 변경도 30초 안에 감지하도록 짧게 쪼개서 잔다
    const until = Date.now() + nextDelayMs(intervalMin, config.jitter ?? DEFAULT_JITTER);
    while (running && Date.now() < until) {
      const woke = await waker.sleep(Math.min(30000, until - Date.now()));
      if (woke || reloader.dirty()) {
        hupPending = woke;
        break;
      }
    }
    if (running) await tick();
  }
}

main().catch((e) => {
  console.error('[치명적 오류]', e);
  process.exit(1);
});
