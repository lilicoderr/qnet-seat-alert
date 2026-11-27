// CLI 하위 명령 공용: 인자에서 --config 를 읽고 설정을 불러온다.
import fs from 'node:fs';
import path from 'node:path';

export function flagValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

export function loadConfigFile(argv) {
  const file = path.resolve(flagValue(argv, '--config', process.env.QNET_CONFIG || 'config.json'));
  if (!fs.existsSync(file)) return { file, config: null };
  return { file, config: JSON.parse(fs.readFileSync(file, 'utf8')) };
}
