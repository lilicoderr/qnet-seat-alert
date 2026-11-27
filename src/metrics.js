// 선택적 Prometheus 텍스트 메트릭. `metricsPort` 설정 시에만 서버를 연다.
// 기본은 127.0.0.1 에만 바인딩한다(외부 노출은 metricsHost 로 명시).

import http from 'node:http';

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function createMetrics(now = () => Date.now()) {
  const watchers = new Map();
  const startedAt = now();

  function entry(name) {
    if (!watchers.has(name)) {
      watchers.set(name, { ok: 0, error: 0, alerts: 0, alertErrors: 0, available: null, failures: 0, last: 0 });
    }
    return watchers.get(name);
  }

  return {
    record(results = []) {
      for (const r of results) {
        const e = entry(r.name || r.id);
        if (r.ok) e.ok++;
        else e.error++;
        if (r.alerted) e.alerts++;
        if (r.alertError) e.alertErrors++;
        e.available = r.ok && r.available != null ? Number(r.available) : e.available;
        e.failures = r.failures ?? 0;
        e.last = now();
      }
    },

    render() {
      const out = [];
      const metric = (name, help, type, rows) => {
        out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
        for (const [labels, value] of rows) out.push(`${name}${labels} ${value}`);
      };
      const lab = (n) => `{watcher="${esc(n)}"}`;
      const labs = (n, extra) => `{watcher="${esc(n)}",${extra}}`;
      const each = (fn) => [...watchers.entries()].map(([n, e]) => fn(n, e));

      metric('qnet_alert_up', 'Process is running (always 1).', 'gauge', [['', 1]]);
      metric('qnet_alert_uptime_seconds', 'Seconds since start.', 'gauge', [['', Math.floor((now() - startedAt) / 1000)]]);
      metric('qnet_alert_checks_total', 'Checks by outcome.', 'counter',
        each((n, e) => [labs(n, 'status="ok"'), e.ok]).concat(each((n, e) => [labs(n, 'status="error"'), e.error])));
      metric('qnet_alert_notifications_total', 'Alerts delivered.', 'counter', each((n, e) => [lab(n), e.alerts]));
      metric('qnet_alert_notification_errors_total', 'Alert delivery failures.', 'counter', each((n, e) => [lab(n), e.alertErrors]));
      metric('qnet_alert_consecutive_failures', 'Current consecutive fetch failures.', 'gauge', each((n, e) => [lab(n), e.failures]));
      metric('qnet_alert_available_seats', 'Last observed available seats.', 'gauge',
        each((n, e) => (e.available === null ? null : [lab(n), e.available])).filter(Boolean));
      metric('qnet_alert_last_check_timestamp_seconds', 'Unix time of the last check.', 'gauge',
        each((n, e) => [lab(n), Math.floor(e.last / 1000)]));
      return out.join('\n') + '\n';
    },
  };
}

export function startMetricsServer(metrics, { port, host = '127.0.0.1' }) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.split('?')[0] === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(metrics.render());
    } else if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok\n');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
