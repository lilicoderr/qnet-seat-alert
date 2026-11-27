// `qnet-alert doctor [--config f] [--offline]` — 문제가 있으면 종료 코드 1.
import path from 'node:path';
import { loadConfigFile } from './cli-util.js';
import { diagnose, formatReport } from './doctor.js';

export async function runDoctor(argv, { out = console.log } = {}) {
  const { file, config } = loadConfigFile(argv);
  if (!config) {
    out(`[FAIL] config file not found: ${file}\nRun "qnet-alert init" to create one.`);
    return 1;
  }
  const items = await diagnose(config, { network: !argv.includes('--offline'), cwd: path.dirname(file) });
  out(formatReport(items));
  return items.some((i) => i.level === 'fail') ? 1 : 0;
}
