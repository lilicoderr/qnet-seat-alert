// `qnet-alert ui [--config f] [--port 8788]` — 한국어 설정/감시 웹 화면 (이 PC 에서만 열림).
import path from 'node:path';
import { flagValue } from './cli-util.js';
import { createLogger } from './log.js';
import { createUiApp } from './ui/app.js';
import { listenUi, launchUrl } from './ui/server.js';
import { readEnvInto } from './ui/settings.js';

export async function runUi(argv, { log = console.error, env = process.env, cwd = process.cwd(), deps = {} } = {}) {
  const configFile = path.resolve(cwd, flagValue(argv, '--config', env.QNET_CONFIG || 'config.json'));
  const envFile = path.resolve(cwd, env.QNET_ENV || '.env');
  const port = Number(flagValue(argv, '--port', 8788));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port 는 0~65535 사이 정수여야 합니다.');
  readEnvInto(envFile, env);
  const { server, watch } = createUiApp({ configFile, envFile, cwd, env, logger: createLogger(), log, ...deps });
  try {
    await listenUi(server, port);
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    log(`[ui] 포트 ${port} 를 이미 다른 프로그램이 쓰고 있습니다. → 해결: 이미 켜 둔 qnet-alert ui 창을 쓰거나 --port 8790 처럼 다른 포트를 지정하세요.`);
    return 1;
  }
  log('[ui] 아래 주소를 이 PC 의 브라우저에 붙여 넣으세요 (주소의 #t=... 는 이번 실행에만 쓰는 열쇠이니 공유하지 마세요):');
  log(`     ${launchUrl(server)}`);
  log('[ui] 알림 전용: 로그인/접수/결제는 하지 않습니다. 이 창을 닫거나 Ctrl+C 를 누르면 감시도 멈춥니다.');
  return { server, watch };
}
