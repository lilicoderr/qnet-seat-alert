// 의존성 없는 최소 SMTP 클라이언트 (알림 메일 전송 전용).
// 지원: 465 암묵적 TLS, STARTTLS(587), AUTH PLAIN/LOGIN. 한 통에 여러 수신자.

import net from 'node:net';
import tls from 'node:tls';

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const noCrlf = (s) => String(s).replace(/[\r\n]+/g, ' ');

export function buildMessage({ from, to, subject, text, date = new Date() }) {
  const body = String(text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return [
    `From: ${noCrlf(from)}`,
    `To: ${[].concat(to).map(noCrlf).join(', ')}`,
    `Subject: =?UTF-8?B?${b64(noCrlf(subject))}?=`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

// 서버 응답(멀티라인 포함)을 하나씩 꺼내는 리더
function reader(socket) {
  let buf = '';
  const waiters = [];
  const pump = () => {
    for (;;) {
      const m = buf.match(/^(?:\d{3}-.*\r?\n)*\d{3} .*\r?\n/);
      if (!m || !waiters.length) return;
      buf = buf.slice(m[0].length);
      waiters.shift().resolve({ code: Number(m[0].slice(0, 3)), text: m[0] });
    }
  };
  socket.on('data', (d) => { buf += d.toString('utf8'); pump(); });
  const fail = (e) => waiters.splice(0).forEach((w) => w.reject(e));
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('SMTP 연결이 끊어졌습니다.')));
  return { next: () => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); pump(); }) };
}

export async function sendMail(opts, { timeoutMs = 15000 } = {}) {
  const { host, port = opts.secure ? 465 : 587, secure = port === 465, user, pass, from, to, subject, text } = opts;
  let socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP 시간 초과')));
  let rd = reader(socket);
  const expect = async (ok) => {
    const r = await rd.next();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${r.text.trim().slice(0, 120)}`);
    return r;
  };
  const cmd = async (line, ok) => { socket.write(`${line}\r\n`); return expect(ok); };
  try {
    await expect([220]);
    let ehlo = await cmd('EHLO qnet-seat-alert', [250]);
    if (!secure && /STARTTLS/i.test(ehlo.text) && opts.starttls !== false) {
      await cmd('STARTTLS', [220]);
      socket.removeAllListeners('data');
      socket = tls.connect({ socket, servername: host });
      rd = reader(socket);
      ehlo = await cmd('EHLO qnet-seat-alert', [250]);
    }
    if (user) {
      if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) {
        await cmd(`AUTH PLAIN ${b64(`\0${user}\0${pass || ''}`)}`, [235]);
      } else {
        await cmd('AUTH LOGIN', [334]);
        await cmd(b64(user), [334]);
        await cmd(b64(pass || ''), [235]);
      }
    }
    await cmd(`MAIL FROM:<${noCrlf(from)}>`, [250]);
    for (const rcpt of [].concat(to)) await cmd(`RCPT TO:<${noCrlf(rcpt)}>`, [250, 251]);
    await cmd('DATA', [354]);
    await cmd(`${buildMessage({ from, to, subject, text })}\r\n.`, [250]);
    await cmd('QUIT', [221]).catch(() => {});
  } finally {
    socket.destroy();
  }
}
