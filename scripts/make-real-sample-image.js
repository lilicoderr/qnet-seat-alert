// docs/table-sample-real.png 생성: 실제(공개·로그인 불필요) 원서접수현황 fixture 기반. 개인정보/세션 없음.
//   node scripts/make-real-sample-image.js [출력경로] [ko|en]
import fs from 'node:fs';
import { parseTable } from '../src/table.js';
import { renderTableImage, findChrome } from '../src/render.js';

const html = fs.readFileSync(new URL('../test/fixtures/real/rcv00301-2026-11-27.html', import.meta.url), 'utf8');
const lang = process.argv[3] || 'ko';
const table = parseTable(html, {}, null, lang);
const out = process.argv[2] || new URL('../docs/table-sample-real.png', import.meta.url);
const png = await renderTableImage(table, {
  title: lang === 'ko' ? '원서접수현황 (실제 공개 페이지, 2026-11-27 스냅샷)' : 'Application list (real public page, 2026-11-27 snapshot)',
  checkedAt: Date.parse('2026-11-27T06:03:00Z'), lang, chrome: findChrome(),
});
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
