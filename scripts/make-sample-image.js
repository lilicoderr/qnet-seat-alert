// docs/table-sample.png 생성 (가상의 샘플 데이터: test/fixtures/status-table.html). 실제 개인정보 없음.
//   node scripts/make-sample-image.js [출력경로]
import fs from 'node:fs';
import { parseTable } from '../src/table.js';
import { renderTableImage, findChrome } from '../src/render.js';

const html = fs.readFileSync(new URL('../test/fixtures/status-table.html', import.meta.url), 'utf8');
const lang = process.argv[3] || 'ko';
const table = parseTable(html, { name: '전기기능사 (샘플)' }, null, lang);
const out = process.argv[2] || new URL('../docs/table-sample.png', import.meta.url);
const png = await renderTableImage(table, {
  title: lang === 'ko' ? '전기기능사 접수현황 (가상 샘플 데이터)' : 'Electrical craftsman status (fictional sample data)',
  checkedAt: Date.parse('2026-11-27T05:03:00Z'), lang, chrome: findChrome(),
});
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
