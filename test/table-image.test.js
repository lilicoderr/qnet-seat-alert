import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTable, renderTableHtml, formatKst } from '../src/table.js';
import { renderPng, renderTableImage, pngSize, findChrome } from '../src/render.js';
import { buildDiscordImageForm, prepareTableImage, notifyAllWithImage, tableImageConfig } from '../src/table-image.js';
import { validateConfig } from '../src/validate.js';
import { runOnce } from '../src/engine.js';
import { memoryStore } from '../src/store.js';

const html = fs.readFileSync(new URL('./fixtures/status-table.html', import.meta.url), 'utf8');
const WH = 'https://discord.com/api/webhooks/123456789012345678/abc-token';
const AT = Date.parse('2026-11-27T05:03:00Z');
const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('formatKst: UTC 를 KST 로', () => assert.equal(formatKst(AT), '2026-11-27 14:03'));

test('parseTable/HTML: 헤더 KST 줄이 맨 위, 빈자리 행 강조', () => {
  const table = parseTable(html, {}, null, 'ko');
  assert.equal(table.rows.length, 5);
  assert.deepEqual(table.rows.map((r) => r.available), [6, 0, 0, 4, 0]);
  const out = renderTableHtml(table, { checkedAt: AT, title: 'T' });
  assert.ok(out.indexOf('2026-11-27 14:03 KST 기준') < out.indexOf('<table>'));
  assert.equal((out.match(/class="open"/g) || []).length, 2);
});

test('PNG 스모크: 유효한 PNG 가 만들어진다 (Chrome 이 있을 때)', async (t) => {
  const chrome = findChrome();
  if (!chrome) return t.skip('Chrome/Edge 없음');
  const table = parseTable(html, {}, null, 'ko');
  const png = await renderTableImage(table, { title: 'T', checkedAt: AT, chrome });
  const size = pngSize(png);
  assert.ok(size && size.width > 400 && size.height > 200);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('renderPng: 헤더 문구가 담긴 HTML 이 렌더러로 전달된다', async () => {
  let seenHtml = '';
  const execFileImpl = (_bin, args, _o, cb) => {
    if (args.includes('--dump-dom')) return cb(null, '<body data-qnet-h="500">');
    const shot = args.find((a) => a.startsWith('--screenshot=')).slice(13);
    const page = new URL(args.at(-1));
    seenHtml = fs.readFileSync(page, 'utf8');
    fs.writeFileSync(shot, FAKE_PNG);
    cb(null);
  };
  const table = parseTable(html, {}, null, 'ko');
  const png = await renderTableImage(table, { checkedAt: AT, chrome: 'fake-chrome', execFileImpl });
  assert.ok(pngSize(png));
  assert.ok(seenHtml.includes('2026-11-27 14:03 KST 기준'));
  await assert.rejects(renderPng('x', {}), /Chrome/);
});

test('Discord multipart: 알림+이미지 한 통, 멘션 1회, allowed_mentions 제한', () => {
  const mentions = { users: ['123456789012345678'], roles: ['345678901234567890'] };
  const payload = { title: 'T', description: 'D', mentions, content: '' };
  const form = buildDiscordImageForm(FAKE_PNG, { payload, username: 'u' });
  const body = JSON.parse(form.get('payload_json'));
  assert.equal(body.content, '<@123456789012345678> <@&345678901234567890>');
  assert.equal(body.embeds[0].image.url, 'attachment://qnet-status.png');
  assert.deepEqual(body.allowed_mentions, { parse: [], users: ['123456789012345678'], roles: ['345678901234567890'] });
  const file = form.get('files[0]');
  assert.equal(file.type, 'image/png');
  assert.equal(file.name, 'qnet-status.png');
  // 이미지 전용: 멘션 없음
  const only = JSON.parse(buildDiscordImageForm(FAKE_PNG, { caption: '2026-11-27 14:03 KST', username: 'u' }).get('payload_json'));
  assert.deepEqual(only.allowed_mentions, { parse: [], users: [], roles: [] });
  assert.ok(!only.embeds);
});

test('Telegram: sendPhoto 한 통(캡션=알림 본문), Slack 은 텍스트만', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const payload = { title: 'T', description: 'D' };
  const ns = [{ type: 'telegram', token: 'tok', chatId: '1' }, { type: 'slack', url: 'https://hooks.slack.com/services/A/B/C' }];
  const { delivered } = await notifyAllWithImage(ns, FAKE_PNG, { fetchImpl, payload });
  assert.equal(delivered, 2);
  assert.match(calls[0].url, /sendPhoto$/);
  assert.match(calls[0].init.body.get('caption'), /T\nD/);
  assert.equal(typeof calls[1].init.body, 'string');
  assert.equal((await notifyAllWithImage([ns[1]], FAKE_PNG, { fetchImpl })).delivered, 0); // 이미지 전용은 Slack 건너뜀
});

test('prepareTableImage: 변화 시에만 / every 면 매번 / attach 면 항상', async () => {
  const renderImpl = async () => FAKE_PNG;
  const r = { id: 'w', ok: true, available: 6, rawText: html };
  const mk = (every, extra = {}) => ({ config: { tableImage: { every } }, watcher: { name: 'W' }, r, store: memoryStore(), now: AT, renderImpl, ...extra });
  const a = mk(false);
  assert.ok(await prepareTableImage(a)); // 첫 관측 = 변화
  assert.equal(await prepareTableImage(a), null); // 같은 표
  assert.ok(await prepareTableImage({ ...a, attach: true }));
  const b = mk(true);
  assert.ok(await prepareTableImage(b)); assert.ok(await prepareTableImage(b));
  assert.equal(await prepareTableImage({ ...mk(true), gate: () => false }), null);
  assert.equal(tableImageConfig({}), null);
  assert.equal(tableImageConfig({ tableImage: { enabled: false } }), null);
});

test('runOnce: tableImage.every 는 체크마다 이미지를 보낸다', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    if (typeof url === 'string' && url.includes('discord')) { bodies.push(init.body); return { ok: true, status: 204 }; }
    return { ok: true, status: 200, text: async () => html };
  };
  const config = { webhookUrl: WH, tableImage: { every: true }, watchers: [{ name: 'W', url: 'https://x.test/', type: 'seats', include: ['서울'] }] };
  const store = memoryStore();
  for (let i = 0; i < 2; i++) await runOnce(config, { store, fetchImpl, renderImpl: async () => FAKE_PNG });
  assert.equal(bodies.filter((b) => b instanceof FormData).length, 2);
});

test('tableImage 설정 검증', () => {
  const base = { webhookUrl: WH, watchers: [{ url: 'https://x.test/', name: 'a' }] };
  assert.equal(validateConfig({ ...base, tableImage: { every: true } }).ok, true);
  assert.equal(validateConfig({ ...base, tableImage: { every: 'yes' } }).ok, false);
  assert.equal(validateConfig({ ...base, tableImage: 5 }).ok, false);
});

test('needsNoSandbox: root 로 도는 Linux 에서만', async () => {
  const { needsNoSandbox } = await import('../src/render.js');
  assert.equal(needsNoSandbox({ platform: 'linux', uid: 0 }), true);
  assert.equal(needsNoSandbox({ platform: 'linux', uid: 1000 }), false);
  assert.equal(needsNoSandbox({ platform: 'win32', uid: undefined }), false);
  assert.equal(needsNoSandbox({ platform: 'darwin', uid: 0 }), false);
});

test('estimateHeight: 긴 장소명이 줄바꿈되면 높이가 커진다', async () => {
  const { estimateHeight } = await import('../src/table.js');
  const mk = (venue) => ({ columns: ['시험장', '빈자리'], rows: [{ cells: [venue, '3석'], available: 3 }] });
  assert.ok(estimateHeight(mk('서울'.repeat(60))) > estimateHeight(mk('서울')) + 60);
});

test('렌더: 긴 장소명 행도 측정 높이로 잘리지 않는다 (Chrome 이 있을 때)', async (t) => {
  const chrome = findChrome();
  if (!chrome) return t.skip('Chrome/Edge 없음');
  const mk = (venue) => ({ columns: ['시험장', '빈자리'], rows: [{ cells: [venue, '3석'], available: 3 }] });
  const short = pngSize(await renderTableImage(mk('서울'), { title: 'T', checkedAt: AT, chrome }));
  const long = pngSize(await renderTableImage(mk('서울강남시험장 '.repeat(40)), { title: 'T', checkedAt: AT, chrome }));
  assert.ok(long.height > short.height + 100, `${long.height} vs ${short.height}`);
});
