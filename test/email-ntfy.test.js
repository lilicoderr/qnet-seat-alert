import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { sendTo, validateNotifier, notifiersFromEnv } from '../src/notify.js';
import { buildMessage } from '../src/smtp.js';

function fakeSmtp() {
  const log = [];
  const server = net.createServer((s) => {
    let data = false;
    let buf = '';
    s.write('220 hi\r\n');
    s.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0 || (data && buf.includes('\r\n.\r\n'))) {
        if (data) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          log.push(`BODY:${buf.slice(0, end)}`);
          buf = buf.slice(end + 5);
          data = false;
          s.write('250 queued\r\n');
          continue;
        }
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        log.push(line);
        if (line.startsWith('EHLO')) s.write('250-x\r\n250 AUTH PLAIN\r\n');
        else if (line === 'DATA') { data = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') s.write('221 bye\r\n');
        else if (line.startsWith('AUTH')) s.write('235 ok\r\n');
        else s.write('250 ok\r\n');
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, log, port: server.address().port })));
}

test('SMTP: 가짜 서버로 메일 전송 (AUTH PLAIN, UTF-8 본문)', async () => {
  const { server, log, port } = await fakeSmtp();
  try {
    await sendTo(
      { type: 'email', host: '127.0.0.1', port, secure: false, user: 'u', pass: 'p', from: 'a@x.io', to: ['b@x.io', 'c@x.io'] },
      { title: '빈자리', description: '3석', url: 'https://q-net.or.kr' },
    );
  } finally { server.close(); }
  assert.ok(log.some((l) => l.startsWith('AUTH PLAIN')));
  assert.ok(log.includes('RCPT TO:<c@x.io>'));
  const body = log.find((l) => l.startsWith('BODY:'));
  assert.match(body, /Subject: =\?UTF-8\?B\?/);
});

test('buildMessage: 헤더 인젝션 방지', () => {
  const m = buildMessage({ from: 'a@x.io\r\nBcc: z@x.io', to: 'b@x.io', subject: 's', text: '.dot' });
  assert.ok(!/\r\nBcc:/.test(m));
});

test('ntfy: 전송 형식과 비ASCII 제목 인코딩', async () => {
  let call;
  const fetchImpl = async (url, init) => { call = { url, init }; return { ok: true, status: 200 }; };
  await sendTo({ type: 'ntfy', topic: 'seats', token: 'tk' }, { title: '빈자리 열림', description: '3석', url: 'https://q.net' }, { fetchImpl });
  assert.equal(call.url, 'https://ntfy.sh/seats');
  assert.match(call.init.headers.Title, /^=\?UTF-8\?B\?/);
  assert.equal(call.init.headers.Click, 'https://q.net');
  assert.equal(call.init.headers.Authorization, 'Bearer tk');
  assert.equal(call.init.body, '3석');
});

test('email/ntfy 검증 + 환경변수 구성', () => {
  assert.match(validateNotifier({ type: 'email', host: 'h' }), /email/);
  assert.match(validateNotifier({ type: 'ntfy', topic: 'bad topic!' }), /ntfy/);
  assert.equal(validateNotifier({ type: 'ntfy', topic: 'ok_1' }), null);
  const l = notifiersFromEnv({ QNET_SMTP_HOST: 'h', QNET_EMAIL_TO: 'a@b.c, d@e.f', QNET_EMAIL_FROM: 'x@y.z', QNET_NTFY_TOPIC: 't' });
  assert.deepEqual(l[0].to, ['a@b.c', 'd@e.f']);
  assert.equal(l[1].type, 'ntfy');
});
