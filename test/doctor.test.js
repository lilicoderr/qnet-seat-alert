import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, formatReport, describeNotifier } from '../src/doctor.js';

const HOOK = 'https://discord.com/api/webhooks/' + '123456789012345678/SECRETSECRETSECRET'; // fake
const base = { notifiers: [{ type: 'discord', url: HOOK }], watchers: [{ name: 'A', type: 'seats', url: 'https://x.test/a' }] };
const okFetch = async () => ({ status: 200, text: async () => '' });

test('정상 설정: 모두 OK 이고 알림은 보내지 않는다', async () => {
  let posts = 0;
  const fetchImpl = async (u, o) => { if (o.method === 'POST') posts++; return okFetch(); };
  const items = await diagnose(base, { fetchImpl, env: {} });
  assert.ok(items.every((i) => i.level !== 'fail'));
  assert.equal(posts, 0);
  assert.match(formatReport(items), /All good/);
});

test('비밀값은 리포트에 나오지 않는다', async () => {
  const cfg = { ...base, notifiers: [...base.notifiers, { type: 'telegram', token: '999:TOKENTOKEN', chatId: '42' }] };
  const text = formatReport(await diagnose(cfg, { fetchImpl: okFetch, env: {} }));
  assert.ok(!text.includes('SECRETSECRET') && !text.includes('TOKENTOKEN'));
  assert.match(text, /telegram chat 42/);
  assert.equal(describeNotifier({ type: 'email', host: 'h', to: ['a@b.c'] }), 'email -> 1 recipient(s) via h');
});

test('채널 없음/네트워크 실패/HTTP 오류를 구분한다', async () => {
  const none = await diagnose({ watchers: base.watchers }, { fetchImpl: okFetch, env: {} });
  assert.ok(none.some((i) => i.level === 'fail' && /no notification channels/.test(i.msg)));
  const down = await diagnose(base, { fetchImpl: async () => { throw new Error('ENOTFOUND'); }, env: {} });
  assert.ok(down.some((i) => i.level === 'fail' && /unreachable \(ENOTFOUND\)/.test(i.msg)));
  const http403 = await diagnose(base, { fetchImpl: async () => ({ status: 403, text: async () => '' }), env: {} });
  assert.ok(http403.some((i) => i.level === 'warn' && /HTTP 403/.test(i.msg)));
});

test('--offline 은 네트워크를 건드리지 않는다', async () => {
  let calls = 0;
  await diagnose(base, { network: false, env: {}, fetchImpl: async () => { calls++; return okFetch(); } });
  assert.equal(calls, 0);
});
