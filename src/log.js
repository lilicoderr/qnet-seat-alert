// 로그 출력: 사람이 읽는 텍스트(기본) 또는 한 줄 JSON(--json, 로그 수집기용).

export function createLogger({ json = false, quiet = false, out = console.log, now = () => new Date() } = {}) {
  return {
    result(r) {
      if (quiet && !r.shouldAlert && r.ok) return;
      if (json) {
        out(JSON.stringify({
          ts: now().toISOString(),
          level: r.ok ? 'info' : 'error',
          watcher: r.name || r.id,
          ok: r.ok,
          signal: r.signal ?? null,
          available: r.available ?? null,
          shouldAlert: !!r.shouldAlert,
          alerted: !!r.alerted,
          dry: !!r.dry,
          reason: r.reason ?? null,
          error: r.error ?? r.alertError ?? null,
          failures: r.failures ?? 0,
        }));
      } else {
        out(`${now().toLocaleTimeString('ko-KR')} ${formatLine(r)}`);
      }
    },
    info(msg) {
      if (json) out(JSON.stringify({ ts: now().toISOString(), level: 'info', msg }));
      else out(`${now().toLocaleTimeString('ko-KR')} ${msg}`);
    },
  };
}

export function formatLine(r) {
  const flag = r.alerted ? '📨 알림보냄' : r.shouldAlert ? (r.dry ? '🔕 알림 대상(dry-run: 전송 생략)' : '⚠️ 알림실패') : '·';
  const sig = r.ok ? `signal=${r.signal}` : `오류: ${r.error}`;
  return `[${r.name || r.id}] ${sig} ${r.reason ? `(${r.reason})` : ''} ${flag}${r.alertError ? ` [${r.alertError}]` : ''}`;
}
