// 실제 Q-Net 공개 페이지(로그인 불필요)에서 받아 정리한 fixture 로 하는 테스트.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTable } from '../src/table.js';
import { evaluate } from '../src/extract.js';

export const real = (n) => fs.readFileSync(new URL(`./fixtures/real/${n}`, import.meta.url), 'utf8');

test('real rcv00301: 목록 행을 이름/접수기간으로 추출', () => {
  const t = parseTable(real('rcv00301-2026-11-27.html'));
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].cells[0], '2026년 상시 기능사 107회 실기');
  assert.match(t.rows[0].cells[1], /^2026년 11월 27일\(금\) 10:00 ~/);
});

test('real rcv00301: 좌석 수는 없으므로 seats 신호는 null', () => {
  assert.equal(evaluate({ type: 'seats' }, real('rcv00301-2026-11-27.html')).signal, null);
});

test('real fixture 에 세션/계획 ID 가 없다', () => {
  const h = real('rcv00301-2026-11-27.html');
  assert.ok(!/JSESSIONID|PL20\d+/.test(h));
});

test('real rcv00301: 표에는 버튼 열과 빈 빈자리 열이 없다', () => {
  const t = parseTable(real('rcv00301-2026-11-27.html'));
  assert.deepEqual(t.columns, ['응시시험', '접수기간']);
  assert.equal(t.rows[0].cells.length, 2);
});
