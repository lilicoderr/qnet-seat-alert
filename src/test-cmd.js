// `qnet-alert test [--channel discord|slack|telegram|...|type#N] [--dry] [--config f]`
// 선택한 채널로만 테스트 알림을 보낸다. 출력에는 비밀값이 나오지 않는다.
import path from 'node:path';
import fs from 'node:fs';
import { flagValue, loadConfigFile } from './cli-util.js';
import { FIXTURE_NOW, checkFixtureFile } from './fixture-check.js';
import { formatReport } from './doctor.js';
import { resolveNotifiers, sendTo } from './notify.js';
import { loadPlugins } from './plugins.js';
import { describeNotifier } from './doctor.js';
import { redactAll } from './redact.js';
import { mentionsFromConfig } from './mentions.js';

// 'discord' -> 해당 type 전부, 'discord#2' -> 그 type 의 두 번째
export function selectChannels(notifiers, spec) {
  const tagged = [];
  const counts = {};
  for (const n of notifiers) { counts[n.type] = (counts[n.type] || 0) + 1; tagged.push({ n, label: `${n.type}#${counts[n.type]}` }); }
  if (!spec) return tagged;
  return tagged.filter(({ n, label }) => n.type === spec || label === spec);
}

export async function runTest(argv, { out = console.log, fetchImpl, env = process.env } = {}) {
  const { file, config } = loadConfigFile(argv);
  const cfg = config || {};
  const fixture = flagValue(argv, '--fixture');
  if (fixture) { // 오프라인: 알림은 보내지 않고 watcher 를 저장된 페이지에 적용해 본다
    const items = await checkFixtureFile(cfg, fixture, { now: FIXTURE_NOW });
    out(formatReport(items));
    return items.some((i) => i.level === 'fail') ? 1 : 0;
  }
  if (cfg.plugins?.length) await loadPlugins(cfg.plugins, { cwd: path.dirname(file) });
  const all = resolveNotifiers(cfg, {}, env);
  const spec = flagValue(argv, '--channel');
  const picked = selectChannels(all, spec);
  if (!picked.length) {
    out(all.length ? `No channel matches '${spec}'. Available: ${selectChannels(all).map((c) => c.label).join(', ')}` : 'No notification channels configured. → 해결: .env 에 QNET_DISCORD_WEBHOOK=<웹훅 URL> 을 넣고 프로젝트 폴더에서 실행하세요 (점검: node bin/qnet-alert.js doctor).');
    return 1;
  }
  let failed = 0;
  const mentions = mentionsFromConfig(cfg, env); // 실제 알림처럼 멘션을 붙여 ID 도 함께 확인한다
  for (const { n, label } of picked) {
    if (argv.includes('--dry')) { out(`[dry] ${label}: ${describeNotifier(n)}`); continue; }
    try {
      await sendTo(n, { title: 'qnet-alert test', description: 'If you can read this, this channel works.', color: 0x2b6cb0, linkLabel: 'Open', mentions }, { fetchImpl, username: cfg.username });
      out(`[ OK ] ${label}`);
    } catch (e) {
      failed++;
      out(`[FAIL] ${label}: ${redactAll(e.message, all)}`);
    }
  }
  return failed ? 1 : 0;
}
