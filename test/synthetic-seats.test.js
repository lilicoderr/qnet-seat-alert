// SYNTHETIC: 실제 Q-Net 에서 숫자 잔여석 행을 본 적이 없어, 실제 마크업을 바탕으로 만든 합성 fixture 로
// "잔여 N>0" 경로(알림, 멘션, 강조 표 이미지)를 검증한다. 실제 데이터 검증이 아니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { real } from './helpers/real.js';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { clearQnetCache } from '../src/qnet-chain.js';
import { parseVenueTable } from '../src/qnet-seats.js';
import { renderTableHtml } from '../src/table.js';

const syn = fs.readFileSync(new URL('./fixtures/synthetic/rcv00303s03-open.synthetic.html', import.meta.url), 'utf8');
const WH = 'https://discord.com/api/webhooks/123456789012345678/abc-token';
const USER = '111111111111111111';
const T0 = Date.parse('2026-11-27T06:30:00Z');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

test('합성 fixture: 숫자 잔여가 파싱된다', () => {
  const t = parseVenueTable(syn);
  assert.deepEqual(t.rows.filter((r) => r.open > 0).map((r) => r.open), [7, 3]);
});

test('합성: 전부 마감 -> 잔여 있음 으로 바뀌면 알림 1통 + 멘션 + 강조(open) 행이 있는 표 이미지', async () => {
  clearQnetCache();
  let venue = real('rcv00303s03-closed.html');
  const posts = [];
  const tables = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('discord.com')) { posts.push(JSON.parse(init.body.get('payload_json'))); return { ok: true, status: 204, text: async () => '' }; }
    const id = new URL(url).searchParams.get('id');
    if (id === 'rcv00303s02') return new Response(fs.readFileSync(new URL('./fixtures/real/rcv00303s02.euckr.json', import.meta.url)), { headers: { 'content-type': 'application/x-json;charset=EUC-KR' } });
    const html = { rcv00301: real('rcv00301-2026-11-27.html'), rcv00302: real('rcv00302-schfrm.html'), rcv00303: real('rcv00303-filters.html'), rcv00303s03: venue }[id];
    return new Response(html, { status: 200 });
  };
  const config = {
    webhookUrl: WH, politeDelayMs: 0, mentions: { users: [USER], whileAvailable: false }, tableImage: { every: true },
    watchers: [{ name: '건축도장', type: 'qnet', examPattern: '기능사', jongmok: '건축도장', maxPages: 1, url: 'https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301' }],
  };
  const store = memoryStore();
  const o = Date.now; Date.now = () => T0;
  try {
    const renderImpl = async (table, opts) => { tables.push({ table, opts }); return PNG; };
    const step = (i) => runOnce(config, { store, fetchImpl, now: () => T0 + i * 60000, renderImpl, sleepImpl: async () => {} });
    const [a] = await step(0);
    venue = syn;
    const [b] = await step(1);
    const [c] = await step(2);
    assert.equal(a.available, 0);
    assert.equal(b.shouldAlert, true);
    assert.equal(b.available, 10);
    assert.equal(c.shouldAlert, false);
  } finally { Date.now = o; }
  assert.equal(posts.length, 3);
  assert.ok(!posts[0].content.includes('<@'));
  assert.ok(posts[1].content.startsWith(`<@${USER}>`));
  const open = tables[1].table.rows.filter((r) => r.available > 0);
  assert.equal(open.length, 2);
  assert.match(renderTableHtml(tables[1].table, { checkedAt: T0 }), /class="open"/);
  assert.match(renderTableHtml(tables[1].table, { checkedAt: T0 }), /KST 기준/);
});
