import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetrics, startMetricsServer } from '../src/metrics.js';

test('render: 빈 상태에도 up/uptime 노출', () => {
  const m = createMetrics(() => 1000);
  const text = m.render();
  assert.match(text, /^qnet_alert_up 1$/m);
  assert.match(text, /^qnet_alert_uptime_seconds 0$/m);
  assert.match(text, /# TYPE qnet_alert_checks_total counter/);
});

test('record: 성공/실패/알림/잔여석이 집계된다', () => {
  let t = 5000;
  const m = createMetrics(() => t);
  m.record([{ name: 'A', ok: true, available: 3, alerted: true }]);
  m.record([{ name: 'A', ok: true, available: 0 }, { name: 'B', ok: false, failures: 2 }]);
  const text = m.render();
  assert.match(text, /qnet_alert_checks_total\{watcher="A",status="ok"\} 2/);
  assert.match(text, /qnet_alert_checks_total\{watcher="B",status="error"\} 1/);
  assert.match(text, /qnet_alert_notifications_total\{watcher="A"\} 1/);
  assert.match(text, /qnet_alert_available_seats\{watcher="A"\} 0/);
  assert.match(text, /qnet_alert_consecutive_failures\{watcher="B"\} 2/);
  assert.doesNotMatch(text, /available_seats\{watcher="B"\}/);
});

test('라벨 이스케이프', () => {
  const m = createMetrics();
  m.record([{ name: 'a"b\nc', ok: true }]);
  assert.match(m.render(), /watcher="a\\"b\\nc"/);
});

test('HTTP: /metrics, /healthz, 404 (127.0.0.1 바인딩)', async () => {
  const m = createMetrics();
  m.record([{ name: 'A', ok: true, available: 1 }]);
  const server = await startMetricsServer(m, { port: 0 });
  try {
    const { port, address } = server.address();
    assert.equal(address, '127.0.0.1');
    const base = `http://127.0.0.1:${port}`;
    const r1 = await fetch(`${base}/metrics`);
    assert.equal(r1.status, 200);
    assert.match(r1.headers.get('content-type'), /text\/plain/);
    assert.match(await r1.text(), /qnet_alert_available_seats\{watcher="A"\} 1/);
    assert.equal(await (await fetch(`${base}/healthz`)).text(), 'ok\n');
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
