import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSeats, extractSeatsFromJson, evaluate } from '../src/extract.js';
import { decide } from '../src/watcher.js';
import { isWebhookUrl, sendAlert } from '../src/discord.js';
import { runOnce, runWatcher, buildAlertPayload } from '../src/engine.js';
import { memoryStore } from '../src/store.js';
import { makeQnetWatcher } from '../src/qnet.js';

// ── 추출 ──
test('extractSeats: 정원-접수인원', () => {
  const s = extractSeats('모집정원 30명 접수인원 28명');
  assert.deepEqual({ available: s.available, capacity: s.capacity, applied: s.applied }, { available: 2, capacity: 30, applied: 28 });
});

test('extractSeats: 잔여석 직접 표기', () => {
  assert.equal(extractSeats('잔여 5 석').available, 5);
  assert.equal(extractSeats('남은자리: 0').available, 0);
});

test('extractSeats: 숫자 없으면 null', () => {
  assert.equal(extractSeats('접수 마감되었습니다'), null);
});

test('extractSeatsFromJson: 중첩 필드', () => {
  const s = extractSeatsFromJson({ data: { fixnum: 40, rcptCnt: 40 } });
  assert.equal(s.available, 0);
  const s2 = extractSeatsFromJson({ restCnt: 3 });
  assert.equal(s2.available, 3);
});

test('evaluate: contains / regex', () => {
  assert.equal(evaluate({ type: 'contains', needle: '접수하기' }, '지금 접수하기 가능').signal, 'present');
  assert.equal(evaluate({ type: 'contains', needle: '접수하기' }, '마감').signal, 'absent');
  assert.equal(evaluate({ type: 'regex', pattern: '잔여\\s*(\\d+)' }, '잔여 7석').signal, '7');
});

// ── 변화 판단 ──
test('decide seats open: 0/미확인 → >0 일 때만 알림', () => {
  const w = { alertOn: 'open' };
  // 첫 관측에서 빈자리 있음 → 알림
  assert.equal(decide(null, { kind: 'seats', signal: 3 }, w).alert, true);
  // 0 → 2 열림 → 알림
  assert.equal(decide({ signal: 0 }, { kind: 'seats', signal: 2 }, w).alert, true);
  // 2 → 1 (여전히 열림이지만 open 모드는 재알림 안 함)
  assert.equal(decide({ signal: 2 }, { kind: 'seats', signal: 1 }, w).alert, false);
  // 5 → 0 닫힘 → 알림 안 함
  assert.equal(decide({ signal: 5 }, { kind: 'seats', signal: 0 }, w).alert, false);
});

test('decide seats increase/change', () => {
  assert.equal(decide({ signal: 1 }, { kind: 'seats', signal: 3 }, { alertOn: 'increase' }).alert, true);
  assert.equal(decide({ signal: 3 }, { kind: 'seats', signal: 1 }, { alertOn: 'increase' }).alert, false);
  assert.equal(decide({ signal: 3 }, { kind: 'seats', signal: 1 }, { alertOn: 'change' }).alert, true);
});

test('decide contains: 문구 등장 시 1회', () => {
  const w = { type: 'contains', needle: '접수하기', alertWhen: 'present' };
  assert.equal(decide({ signal: 'absent' }, { kind: 'contains', signal: 'present' }, w).alert, true);
  // 계속 present 면 재알림 안 함
  assert.equal(decide({ signal: 'present' }, { kind: 'contains', signal: 'present' }, w).alert, false);
});

// ── Discord ──
test('isWebhookUrl', () => {
  assert.equal(isWebhookUrl('https://discord.com/api/webhooks/123/abc-DEF_1'), true);
  assert.equal(isWebhookUrl('https://evil.example/webhooks/1/x'), false);
});

test('sendAlert: 잘못된 URL 거부, 정상 전송', async () => {
  await assert.rejects(() => sendAlert('http://x', {}, { fetchImpl: async () => ({}) }), /웹훅 URL/);
  let got;
  const fetchImpl = async (url, opts) => { got = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 204 }; };
  await sendAlert('https://discord.com/api/webhooks/1/abc', { title: '제목', description: '내용', fields: [{ name: '빈자리', value: '2석' }] }, { fetchImpl });
  assert.equal(got.body.embeds[0].title, '제목');
  assert.equal(got.body.embeds[0].fields[0].value, '2석');
});

// ── 엔진 ──
test('runWatcher: 가져와서 평가 + 상태 저장', async () => {
  const store = memoryStore();
  const fetchImpl = async () => ({ status: 200, text: async () => '모집정원 30 접수인원 30' });
  const w = makeQnetWatcher({ name: '시험', url: 'http://x' });
  const r = await runWatcher(w, { store, fetchImpl });
  assert.equal(r.available, 0);
  assert.equal(r.shouldAlert, false);
  assert.equal(store.get('시험').signal, 0);
});

test('runOnce: 빈자리 열리면 1번만 알림 (중복 억제)', async () => {
  const store = memoryStore();
  let seats = 30; // 처음 만석
  const sent = [];
  const fetchImpl = async (url, opts) => {
    if (String(url).includes('discord')) { sent.push(JSON.parse(opts.body)); return { ok: true, status: 204 }; }
    return { status: 200, text: async () => `모집정원 30 접수인원 ${seats}` };
  };
  const config = {
    webhookUrl: 'https://discord.com/api/webhooks/1/abc',
    watchers: [makeQnetWatcher({ id: 'w1', name: '전기기능사', url: 'http://qnet/x', alertOn: 'open' })],
  };
  // 1회차: 만석 → 알림 없음
  let res = await runOnce(config, { store, fetchImpl });
  assert.equal(res[0].alerted, false);
  // 빈자리 2석 열림 → 알림 1회
  seats = 28;
  res = await runOnce(config, { store, fetchImpl });
  assert.equal(res[0].alerted, true);
  assert.equal(sent.length, 1);
  // 다시 폴링(여전히 2석) → 재알림 안 함 (open 모드)
  res = await runOnce(config, { store, fetchImpl });
  assert.equal(res[0].alerted, false);
  assert.equal(sent.length, 1);
  assert.match(sent[0].embeds[0].title, /전기기능사/);
});

test('buildAlertPayload: 정원/접수 필드 포함', () => {
  const p = buildAlertPayload({ name: 'T', url: 'http://x' }, { available: 2, reason: '열림', detail: { capacity: 30, applied: 28 } });
  assert.ok(p.fields.some((f) => f.value === '2석'));
  assert.ok(p.fields.some((f) => f.value === '28/30'));
});
