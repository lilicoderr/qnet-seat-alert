import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { csvCell, historyToCsv, runExport } from '../src/export-cmd.js';
import { appendHistory } from '../src/history.js';

test('csvCell: 인용, 널, 수식 주입 방지', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(3), '3');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell(-1), '-1'); // 숫자는 그대로
});

test('historyToCsv: 정렬/기간 필터/헤더', () => {
  const e = [{ t: 2000, id: 'a', name: 'A, B', available: 2, signal: 2 }, { t: 1000, id: 'a', name: 'A, B', available: null, signal: null }];
  const csv = historyToCsv(e);
  assert.equal(csv, 'time,id,name,available,signal\r\n1970-01-01T00:00:01.000Z,a,"A, B",,\r\n1970-01-01T00:00:02.000Z,a,"A, B",2,2\r\n');
  assert.equal(historyToCsv(e, { sinceMs: 1500, now: 3000 }).split('\r\n').length, 3);
});

test('export --out: 파일로 쓰고 BOM 포함', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-'));
  const hist = path.join(dir, 'h.jsonl');
  appendHistory(hist, [{ ok: true, id: 'x', name: '전기', available: 4 }], 5000);
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ historyPath: hist }));
  const out = path.join(dir, 'o.csv');
  const lines = [];
  await runExport(['--config', cfg, '--out', out], { out: (s) => lines.push(s) });
  const text = fs.readFileSync(out, 'utf8');
  assert.ok(text.startsWith('﻿time,id,name'));
  assert.match(text, /,x,전기,4,/);
  assert.match(lines[0], /wrote 1 rows/);
});
