// 아주 작은 JSON 스냅샷 도우미. 갱신: UPDATE_SNAPSHOTS=1 node --test
import fs from 'node:fs';
import assert from 'node:assert/strict';

export function matchSnapshot(name, value) {
  const file = new URL(`./snapshots/${name}.json`, import.meta.url);
  const text = JSON.stringify(value, null, 2) + '\n';
  if (process.env.UPDATE_SNAPSHOTS || !fs.existsSync(file)) {
    fs.writeFileSync(file, text);
    return;
  }
  assert.equal(text, fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `스냅샷 불일치: ${name} (의도한 변경이면 UPDATE_SNAPSHOTS=1 로 갱신)`);
}
