// `qnet-alert dashboard [--config f] [--port 8787]`
import { flagValue, loadConfigFile } from './cli-util.js';
import { startDashboard } from './dashboard.js';

export async function runDashboard(argv, { log = console.error } = {}) {
  const { file, config } = loadConfigFile(argv);
  if (!config) throw new Error(`설정 파일이 없습니다: ${file}`);
  const port = Number(flagValue(argv, '--port', 8787));
  const server = await startDashboard({ config, statePath: config.statePath || 'state.json', historyPath: config.historyPath }, port);
  log(`[dashboard] http://127.0.0.1:${server.address().port}/ (read-only, localhost only)`);
  return server;
}
