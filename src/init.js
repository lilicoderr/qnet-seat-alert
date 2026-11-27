// `qnet-alert init` — 대화형 설정 마법사.
// config.json 과 .env.example 만 만든다. 웹훅/토큰 같은 비밀값은 묻지도, 쓰지도 않는다.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export const CHANNEL_ENV = {
  discord: ['QNET_DISCORD_WEBHOOK'],
  slack: ['QNET_SLACK_WEBHOOK'],
  telegram: ['QNET_TELEGRAM_TOKEN', 'QNET_TELEGRAM_CHAT'],
  webhook: ['QNET_WEBHOOK_URL'],
};

const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// 답변 → config 객체 (비밀값 없음)
export function buildConfig(a) {
  const watcher = {
    name: a.name || 'Q-Net 감시',
    type: a.type || 'seats',
    alertOn: a.alertOn || 'open',
    url: a.url,
  };
  if (a.linkUrl) watcher.linkUrl = a.linkUrl;
  const include = splitList(a.include);
  const exclude = splitList(a.exclude);
  if (include.length) watcher.include = include;
  if (exclude.length) watcher.exclude = exclude;
  if (a.dateFrom) watcher.dateFrom = a.dateFrom;
  if (a.dateTo) watcher.dateTo = a.dateTo;
  if (watcher.type === 'contains') watcher.needle = a.needle || '접수하기';
  if (watcher.type === 'regex') watcher.pattern = a.pattern || '잔여\\s*(\\d+)';

  const cfg = {
    comment: '비밀값(웹훅/토큰)은 .env 에 두세요. 이 파일은 커밋 금지.',
    intervalMin: Math.max(2, Number(a.intervalMin) || 5),
    politeDelayMs: 1500,
    failureAlertAfter: 5,
    statePath: 'state.json',
    watchers: [watcher],
  };
  return cfg;
}

export function buildEnvExample(channels = ['discord']) {
  const lines = [
    '# 비밀값은 .env 에 두고 절대 커밋하지 마세요. 이 파일을 .env 로 복사해 채우세요.',
  ];
  for (const ch of channels) {
    if (!CHANNEL_ENV[ch]) continue;
    lines.push(`# ${ch}`);
    for (const k of CHANNEL_ENV[ch]) lines.push(`${k}=`);
  }
  return lines.join('\n') + '\n';
}

export function parseChannels(input) {
  const out = [];
  for (const c of splitList(input).map((x) => x.toLowerCase())) {
    if (CHANNEL_ENV[c] && !out.includes(c)) out.push(c);
  }
  return out.length ? out : ['discord'];
}

// 파일 쓰기. 기존 파일은 force 없으면 건드리지 않는다. 반환: { written, skipped }
export function writeFiles(dir, config, envExample, { force = false } = {}) {
  const written = [];
  const skipped = [];
  const targets = [
    ['config.json', JSON.stringify(config, null, 2) + '\n'],
    ['.env.example', envExample],
  ];
  for (const [name, body] of targets) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && !force) skipped.push(name);
    else {
      fs.writeFileSync(p, body, 'utf8');
      written.push(name);
    }
  }
  return { written, skipped };
}

export async function runInit({ input = process.stdin, output = process.stderr, dir = process.cwd(), force = false } = {}) {
  const rl = readline.createInterface({ input, terminal: false });
  const it = rl[Symbol.asyncIterator]();
  let eof = false;

  const ask = async (q, def = '') => {
    output.write(`${q}${def ? ` [${def}]` : ''}: `);
    const { value, done } = await it.next();
    if (done) {
      eof = true;
      output.write('\n');
      return def;
    }
    return String(value).trim() || def;
  };

  output.write('qnet-alert 설정 마법사 — 비밀값(웹훅/토큰)은 묻지 않습니다.\n\n');
  const answers = {};
  answers.name = await ask('감시 이름', 'Q-Net 감시');
  answers.url = await ask('가져올 URL (열람 가능한 접수현황 페이지/엔드포인트)');
  while (!/^https?:\/\//.test(answers.url)) {
    if (eof) throw new Error('유효한 URL 이 없어 중단합니다. (http:// 또는 https://)');
    answers.url = await ask('http(s):// 로 시작하는 URL 을 입력하세요');
  }
  answers.linkUrl = await ask('알림에 붙일 링크 (엔터=생략)');
  answers.type = await ask('유형 seats/jsonseats/contains/regex', 'seats');
  answers.include = await ask('포함 키워드, 쉼표 구분 (예: 서울,전기기능사)');
  answers.exclude = await ask('제외 키워드, 쉼표 구분 (예: 마감)');
  answers.alertOn = await ask('알림 조건 open/increase/change/available', 'open');
  answers.intervalMin = await ask('폴링 간격(분, 최소 1)', '5');
  const channels = parseChannels(await ask('알림 채널 discord/slack/telegram/webhook, 쉼표 구분', 'discord'));
  rl.close();

  const config = buildConfig(answers);
  const { written, skipped } = writeFiles(dir, config, buildEnvExample(channels), { force });
  for (const f of written) output.write(`✅ ${f} 생성\n`);
  for (const f of skipped) output.write(`⏭  ${f} 이미 있어 건너뜀 (--force 로 덮어쓰기)\n`);
  output.write('\n다음 단계:\n  1) .env.example 을 .env 로 복사하고 웹훅/토큰을 채우세요 (.env 는 커밋 금지)\n  2) node bin/qnet-alert.js --dry   로 추출 결과 확인\n');
  return { config, channels, written, skipped };
}
