// `qnet-alert export [--config f] [--hours N] [--out file.csv]` — 이력(JSONL)을 CSV 로 내보낸다.
import fs from 'node:fs';
import { flagValue, loadConfigFile } from './cli-util.js';
import { readHistory } from './history.js';

// RFC 4180 인용 + 스프레드시트 수식 주입 방지(=,+,-,@ 로 시작하면 ' 를 붙임)
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = ['time', 'id', 'name', 'available', 'signal'];

export function historyToCsv(entries, { sinceMs = 0, now = Date.now() } = {}) {
  const rows = entries.filter((e) => !sinceMs || e.t >= now - sinceMs).sort((a, b) => a.t - b.t);
  const lines = rows.map((e) => [new Date(e.t).toISOString(), e.id, e.name, e.available, e.signal].map(csvCell).join(','));
  return [CSV_HEADER.join(','), ...lines].join('\r\n') + '\r\n';
}

export async function runExport(argv, { out = console.log } = {}) {
  const { config } = loadConfigFile(argv);
  const historyPath = config?.historyPath || process.env.QNET_HISTORY || 'history.jsonl';
  const hours = Number(flagValue(argv, '--hours', 0));
  const csv = historyToCsv(readHistory(historyPath), { sinceMs: hours * 3600 * 1000 });
  const file = flagValue(argv, '--out');
  if (file) {
    fs.writeFileSync(file, '﻿' + csv, 'utf8'); // BOM: Excel 에서 한글이 깨지지 않게
    out(`wrote ${csv.split('\r\n').length - 2} rows to ${file}`);
  } else {
    process.stdout.write(csv);
  }
  return 0;
}
