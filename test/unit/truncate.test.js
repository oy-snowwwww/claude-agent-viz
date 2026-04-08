// 실행: node --test test/unit/truncate.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { truncate } = require('../../server.js');

test('truncate: 짧은 문자열 그대로', () => {
  assert.strictEqual(truncate('hi', 10), 'hi');
});

test('truncate: 정확히 max 길이 → 그대로', () => {
  assert.strictEqual(truncate('12345', 5), '12345');
});

test('truncate: max 초과 → 잘리고 … 추가', () => {
  const r = truncate('abcdefghij', 5);
  assert.strictEqual(r.endsWith('…'), true);
  assert.ok(r.length <= 6, 'length ≤ max+1');
});

test('truncate: null/빈 문자열 → 빈 문자열', () => {
  // 구현: String(s || '') → null도 '' 로 정규화
  assert.strictEqual(truncate('', 10), '');
  assert.strictEqual(truncate(null, 10), '');
  assert.strictEqual(truncate(undefined, 10), '');
});

test('truncate: 한글 처리', () => {
  const r = truncate('안녕하세요 반갑습니다', 5);
  assert.strictEqual(r.endsWith('…'), true);
});
