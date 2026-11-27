import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, varsFor, unknownVars } from '../src/template.js';
import { buildAlertPayload } from '../src/engine.js';
import { validateConfig } from '../src/validate.js';

test('renderTemplate: 변수 치환, 모르는 변수는 보존, null 은 빈칸', () => {
  assert.equal(renderTemplate('{name} {available}석', { name: 'A', available: 3 }), 'A 3석');
  assert.equal(renderTemplate('{foo}', {}), '{foo}');
  assert.equal(renderTemplate('[{applied}]', { applied: null }), '[]');
  assert.equal(renderTemplate('{available}', { available: 0 }), '0');
});

test('varsFor: detail 의 정원/접수 포함', () => {
  const v = varsFor({ name: 'W', url: 'u' }, { available: 2, detail: { applied: 28, capacity: 30 }, signal: 2, reason: 'r' });
  assert.equal(v.capacity, 30);
  assert.equal(v.applied, 28);
  assert.equal(v.url, 'u');
});

test('unknownVars', () => {
  assert.deepEqual(unknownVars('{name} {nope} {zzz}'), ['nope', 'zzz']);
});

test('buildAlertPayload: 기본 문구 유지', () => {
  const p = buildAlertPayload({ name: 'W', url: 'u' }, { available: 1, reason: 'why' });
  assert.equal(p.title, '🔔 W 변화 감지');
  assert.equal(p.description, 'why');
});

test('buildAlertPayload: 전역/워처 템플릿 (워처가 우선)', () => {
  const cfg = { templates: { title: '전역 {name}', description: '{available}석' } };
  const w = { name: 'W', url: 'u', template: { title: '워처 {name}' } };
  const p = buildAlertPayload(w, { available: 4, reason: 'why' }, cfg);
  assert.equal(p.title, '워처 W');
  assert.equal(p.description, '4석');
});

test('validate: 템플릿 알 수 없는 변수/키는 경고, 비객체는 오류', () => {
  const base = {
    notifiers: [{ type: 'webhook', url: 'https://e.com/h' }],
    watchers: [{ name: 'a', type: 'seats', url: 'https://e.com' }],
  };
  const v = validateConfig({ ...base, templates: { title: '{nope}', foo: 'x' } });
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => w.includes('{nope}')));
  assert.ok(v.warnings.some((w) => w.includes("'foo'")));
  assert.equal(validateConfig({ ...base, templates: 'x' }).ok, false);
});
