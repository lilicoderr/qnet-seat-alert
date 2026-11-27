import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView, renderPage, sparkSvg, startDashboard, esc } from '../src/dashboard.js';

const config = { webhookUrl: 'https://discord.com/api/webhooks/1/SECRETTOKEN', watchers: [{ name: '<b>A</b>', type: 'seats', url: 'https://x.test/' }] };

test('buildView: state/history 를 합쳐 상태를 만든다', () => {
  const rows = buildView(config, { '<b>A</b>': { signal: 3, failures: 0, at: 1000 } }, [{ t: 1, id: '<b>A</b>', available: 1 }, { t: 2, id: '<b>A</b>', available: 3 }], 61000);
  assert.equal(rows[0].status, 'ok');
  assert.equal(rows[0].lastAgo, '1 min ago');
  assert.deepEqual(rows[0].series, [1, 3]);
  assert.equal(buildView(config, {}, [])[0].status, 'unknown');
});

test('renderPage: HTML 이스케이프, 스파크라인, 비밀값 미노출', () => {
  const html = renderPage(buildView(config, {}, []));
  assert.ok(!html.includes('<b>A</b>'));
  assert.match(html, /&lt;b&gt;A/);
  assert.ok(!html.includes('SECRETTOKEN'));
  assert.match(sparkSvg([1, 2, 3]), /<polyline/);
  assert.equal(esc('"&'), '&quot;&amp;');
});

test('서버: 127.0.0.1 바인딩, GET 만 허용, /api/status JSON', async () => {
  const server = await startDashboard({ config, statePath: 'nonexistent-state.json' }, 0);
  try {
    assert.equal(server.address().address, '127.0.0.1');
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /qnet-alert/);
    const api = await (await fetch(base + '/api/status')).json();
    assert.equal(api.length, 1);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/nope')).status, 404);
  } finally { server.close(); }
});
