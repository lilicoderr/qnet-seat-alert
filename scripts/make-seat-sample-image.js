// docs/table-sample-seats.png: 실제 공개 시험장 조회(rcv00303s03) fixture 로 만든 잔여석 표 (모두 마감 상태 그대로).
//   node scripts/make-seat-sample-image.js [출력경로] [ko|en]
import fs from 'node:fs';
import { parseVenueTable } from '../src/qnet-seats.js';
import { rowsToHtml } from '../src/qnet-chain.js';
import { parseTable } from '../src/table.js';
import { renderTableImage, findChrome } from '../src/render.js';

const html = fs.readFileSync(new URL('../test/fixtures/real/rcv00303s03-closed.html', import.meta.url), 'utf8');
const lang = process.argv[3] || 'ko';
const rows = parseVenueTable(html).rows.slice(0, 6);
const table = parseTable(rowsToHtml(rows), {}, null, lang);
const out = process.argv[2] || new URL('../docs/table-sample-seats.png', import.meta.url);
const png = await renderTableImage(table, {
  title: lang === 'ko' ? '2026년 상시 기능사 107회 건축도장 (실제 공개 조회, 2026-11-27)' : 'Craftsman 107th, building painting (real public lookup, 2026-11-27)',
  checkedAt: Date.parse('2026-11-27T06:30:00Z'), lang, chrome: findChrome(),
});
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
