import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/validate.js';

const base = (over = {}) => ({
  notifiers: [{ type: 'webhook', url: 'https://example.com/hook' }],
  watchers: [{ name: 'a', type: 'seats', url: 'https://example.com/a' }],
  ...over,
});

test('정상 설정은 ok', () => {
  const v = validateConfig(base());
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
});

test('알 수 없는 top-level 키는 경고 + 제안', () => {
  const v = validateConfig(base({ intervalMn: 5 }));
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => w.includes("'intervalMn'") && w.includes("'intervalMin'")));
});

test('알 수 없는 watcher 키는 경고 + 제안', () => {
  const cfg = base();
  cfg.watchers[0].includ = ['서울'];
  const v = validateConfig(cfg);
  assert.ok(v.warnings.some((w) => w.includes("'includ'") && w.includes("'include'")));
});

test('type 오타는 제안과 함께 오류', () => {
  const cfg = base();
  cfg.watchers[0].type = 'seat';
  const v = validateConfig(cfg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("'seats'")));
});

test('alertOn / alertWhen 값 검증', () => {
  const cfg = base();
  cfg.watchers[0].alertOn = 'opn';
  const v = validateConfig(cfg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('alertOn') && e.includes("'open'")));

  const cfg2 = base();
  cfg2.watchers[0] = { name: 'c', type: 'contains', needle: 'x', url: 'https://e.com', alertWhen: 'presnt' };
  const v2 = validateConfig(cfg2);
  assert.ok(v2.errors.some((e) => e.includes('alertWhen') && e.includes("'present'")));
});

test('잘못된 정규식 pattern 은 오류', () => {
  const cfg = base();
  cfg.watchers[0] = { name: 'r', type: 'regex', pattern: '(', url: 'https://e.com' };
  const v = validateConfig(cfg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('정규식')));
});

test('숫자 옵션 타입 검사', () => {
  const v = validateConfig(base({ intervalMin: '5', failureAlertAfter: -1 }));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.startsWith('intervalMin')));
  assert.ok(v.errors.some((e) => e.startsWith('failureAlertAfter')));
});

test('watchers 가 배열이 아니면 오류', () => {
  const v = validateConfig(base({ watchers: {} }));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('배열')));
});

test('metricsPort 는 1 이상', () => {
  assert.equal(validateConfig(base({ metricsPort: 0 })).ok, false);
  assert.equal(validateConfig(base({ metricsPort: 9464 })).ok, true);
});
