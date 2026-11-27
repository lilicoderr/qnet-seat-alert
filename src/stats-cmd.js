// `qnet-alert stats [--config f] [--hours 24] [--json]`
import fs from 'node:fs';
import path from 'node:path';
import { readHistory, summarize, formatStats } from './history.js';

export async function runStats(argv, { out = console.log } = {}) {
  let config = process.env.QNET_CONFIG || 'config.json';
  let hours = 24;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') config = argv[++i];
    else if (argv[i] === '--hours') hours = Number(argv[++i]);
    else if (argv[i] === '--json') json = true;
  }
  const cfgPath = path.resolve(config);
  let historyPath = process.env.QNET_HISTORY || 'history.jsonl';
  if (fs.existsSync(cfgPath)) historyPath = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).historyPath || historyPath;
  const summary = summarize(readHistory(historyPath), { sinceMs: hours * 3600 * 1000 });
  out(json ? JSON.stringify(summary, null, 2) : `최근 ${hours}시간 · ${historyPath}\n${formatStats(summary)}`);
  return summary;
}
