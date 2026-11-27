// 종단 간(오프라인): 실제 Q-Net 목록 fixture -> newrows 감지 -> 이미지(표+KST 헤더) + 멘션 1통.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { formatKst } from '../src/table.js';
import { real } from './helpers/real.js';

const WH = 'https://discord.com/api/webhooks/123456789012345678/abc-token';
const USER = '111111111111111111';
const T0 = Date.parse('2026-11-27T06:03:00Z'); // 15:03 KST
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const NEW_ROW = '<tr><td>2027년 정기 기능사 1회 필기</td><td>2027년 1월 5일(화) 10:00 ~ 2027년 1월 9일(토) 18:00</td></tr>';

test('real fixture: 기준선 -> 새 필기 항목 등장 시 이미지+멘션 정확히 1통, 이후 재알림 없음', async () => {
  let html = real('rcv00301-2026-11-27.html');
  const posts = [];
  const tables = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('discord.com')) { posts.push(JSON.parse(init.body.get('payload_json'))); return { ok: true, status: 204, text: async () => '' }; }
    return new Response(html, { status: 200 });
  };
  const config = {
    webhookUrl: WH, politeDelayMs: 0, mentions: { users: [USER] }, tableImage: { every: true },
    watchers: [{ name: '기능사 필기 신규', type: 'newrows', pattern: '기능사.*필기', url: 'https://example.test/rcv00301' }],
  };
  const store = memoryStore();
  const renderImpl = async (table, opts) => { tables.push({ table, opts }); return PNG; };
  const step = (i) => runOnce(config, { store, fetchImpl, now: () => T0 + i * 60000, renderImpl });

  await step(0);
  html = html.replace('</tbody>', `${NEW_ROW}</tbody>`);
  const [r1] = await step(1);
  const [r2] = await step(2);

  assert.equal(r1.shouldAlert, true);
  assert.equal(r2.shouldAlert, false);
  assert.equal(posts.length, 3); // 체크마다 이미지 1통
  assert.ok(!posts[0].content.includes('<@')); assert.match(posts[0].content, /^2026-11-27 15:03 KST/);
  assert.equal(posts[1].content, `<@${USER}>`);
  assert.ok(!posts[2].content.includes('<@'));
  assert.deepEqual(tables[1].table.columns, ['응시시험', '접수기간']);
  assert.equal(tables[1].table.rows.length, 3);
  assert.equal(formatKst(tables[1].opts.checkedAt), '2026-11-27 15:04');
});
