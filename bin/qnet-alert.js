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
import { createStore } from '../src/store.js';
import { MIN_INTERVAL_MIN, DISCLAIMER } from '../src/qnet.js';

function parseArgs(argv) {
  const args = { once: false, config: process.env.QNET_CONFIG || 'config.json', testWebhook: false, list: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--once') args.once = true;
    else if (argv[i] === '--config') args.config = argv[++i];
    else if (argv[i] === '--test-webhook') args.testWebhook = true;
    else if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--dry') { args.dry = true; args.once = true; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config);
  if (!fs.existsSync(configPath)) {
    console.error(`설정 파일이 없습니다: ${configPath}`);
    console.error('config.example.json 을 복사해 config.json 으로 만들고 webhookUrl·watchers 를 채우세요.');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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

  const store = createStore(config.statePath);
  const watchers = (config.watchers || []).filter((w) => w.enabled !== false);
  if (watchers.length === 0) {
    console.error('활성화된 watcher 가 없습니다.');
    process.exit(1);
  }

  const intervalMin = Math.max(MIN_INTERVAL_MIN, Number(config.intervalMin) || 5);
  console.error(`[qnet-alert] 워처 ${watchers.length}개, 간격 ${intervalMin}분${args.once ? ' (1회)' : ''}`);
  console.error(`[주의] ${DISCLAIMER}`);

  const log = (line) => console.log(`${new Date().toLocaleTimeString('ko-KR')} ${line}`);

  const tick = async () => {
    try {
      await runOnce(config, { store, log, dry: args.dry });
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
    await sleep(intervalMin * 60 * 1000);
    if (running) await tick();
  }
}

main().catch((e) => {
  console.error('[치명적 오류]', e);
  process.exit(1);
});
