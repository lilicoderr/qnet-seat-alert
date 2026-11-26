// 의존성 없는 .env 로더. 이미 설정된 환경변수는 덮어쓰지 않는다.
import fs from 'node:fs';

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(val)) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

export function loadEnvFile(file = '.env', env = process.env) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return 0; }
  let n = 0;
  for (const [k, v] of Object.entries(parseEnv(text))) {
    if (env[k] === undefined) { env[k] = v; n++; }
  }
  return n;
}
