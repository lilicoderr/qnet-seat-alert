import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, suggest, didYouMean } from '../src/suggest.js';

test('editDistance: 기본 케이스', () => {
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('kitten', 'sitting'), 3);
});

test('suggest: 가까운 후보를 고르고 멀면 null', () => {
  assert.equal(suggest('seat', ['seats', 'regex']), 'seats');
  assert.equal(suggest('jsonseat', ['seats', 'jsonseats', 'regex']), 'jsonseats');
  assert.equal(suggest('zzzzzz', ['seats', 'regex']), null);
});

test('suggest: 대소문자 무시', () => {
  assert.equal(suggest('REGEX', ['regex']), 'regex');
});

test('didYouMean: 문구 생성', () => {
  assert.match(didYouMean('regx', ['regex']), /'regex'/);
  assert.equal(didYouMean('qqqqqq', ['regex']), '');
});
