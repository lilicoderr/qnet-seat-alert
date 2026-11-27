// `qnet-alert doctor [--config f] [--offline]` — 문제가 있으면 종료 코드 1.
import path from 'node:path';
import fs from 'node:fs';
import { loadConfigFile, flagValue } from './cli-util.js';
import { diagnose, formatReport } from './doctor.js';
import { FIXTURE_NOW, checkFixtureFile } from './fixture-check.js';

export async function runDoctor(argv, { out = console.log } = {}) {
  const { file, config } = loadConfigFile(argv);
  if (!config) {
    out(`[FAIL] config file not found: ${file}\nRun "qnet-alert init" to create one.`);
    return 1;
  }
  const fixture = flagValue(argv, '--fixture');
  const items = await diagnose(config, { network: !argv.includes('--offline') && !fixture, cwd: path.dirname(file) });
  if (fixture) {
    try { items.push(...await checkFixtureFile(config, fixture, { now: FIXTURE_NOW })); } catch (e) { items.push({ level: 'fail', msg: `fixture: ${e.message}` }); }
  }
  out(formatReport(items));
  return items.some((i) => i.level === 'fail') ? 1 : 0;
}
