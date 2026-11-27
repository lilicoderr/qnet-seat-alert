// `qnet-alert doctor [--config f] [--offline]` — 문제가 있으면 종료 코드 1.
import path from 'node:path';
import fs from 'node:fs';
import { loadConfigFile, flagValue } from './cli-util.js';
import { diagnose, formatReport } from './doctor.js';
import { parseEnv } from './env.js';
import { resolveNotifiers } from './notify.js';
import { FIXTURE_NOW, checkFixtureFile } from './fixture-check.js';

// .env 관련 흔한 실수. 값은 출력하지 않는다.
export function diagnoseEnvFiles(dir, { env = process.env, hasChannel = true } = {}) {
  const out = [];
  const has = (n) => fs.existsSync(path.join(dir, n));
  if (!env.QNET_ENV && !has('.env') && !hasChannel) {
    out.push({ level: 'warn', msg: has('.env.txt')
      ? '.env.txt 는 있는데 .env 가 없습니다. → 해결: Rename-Item .env.txt .env'
      : `.env 파일이 없습니다 (${dir}). → 해결: copy .env.example .env 후 메모장으로 열어 채우세요.` });
  }
  if (has('.env.example') && Object.values(parseEnv(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'))).some((v) => v && !v.startsWith('#'))) {
    out.push({ level: 'warn', msg: '.env.example 에 값이 들어 있습니다. 이 파일은 git 에 올라가는 견본입니다. → 해결: 값은 .env 로 옮기고 .env.example 의 값은 지우세요.' });
  }
  return out;
}

export async function runDoctor(argv, { out = console.log, cwd = process.cwd() } = {}) {
  let loaded;
  try { loaded = loadConfigFile(argv); } catch (e) {
    out(`[FAIL] config.json 을 읽을 수 없습니다 (JSON 문법 오류): ${e.message}\n→ 해결: 쉼표/따옴표를 확인하거나 "node bin/qnet-alert.js init --preset gineungsa --jongmok <종목> --region <지역> --force" 로 다시 만드세요.`);
    return 1;
  }
  const { file, config } = loaded;
  if (!config) {
    out(`[FAIL] config file not found: ${file}\n→ 해결: 프로젝트 폴더에서 "node bin/qnet-alert.js init --preset gineungsa --jongmok <종목> --region <지역>" 을 실행하세요.`);
    return 1;
  }
  const fixture = flagValue(argv, '--fixture');
  const items = await diagnose(config, { network: !argv.includes('--offline') && !fixture, cwd: path.dirname(file) });
  if (fixture) {
    try { items.push(...await checkFixtureFile(config, fixture, { now: FIXTURE_NOW })); } catch (e) { items.push({ level: 'fail', msg: `fixture: ${e.message}` }); }
  }
  items.unshift(...diagnoseEnvFiles(cwd, { hasChannel: resolveNotifiers(config).length > 0 }));
  out(formatReport(items));
  return items.some((i) => i.level === 'fail') ? 1 : 0;
}
