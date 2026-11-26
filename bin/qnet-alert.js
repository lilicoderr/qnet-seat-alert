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
  const args = { once: false, config: process.env.QNET_CONFIG || 'config.json' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--once') args.once = true;
    else if (argv[i] === '--config') args.config = argv[++i];
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
      await runOnce(config, { store, log });
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
