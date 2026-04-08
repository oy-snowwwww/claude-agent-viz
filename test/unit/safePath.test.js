// 실행: node --test test/unit/safePath.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { safePath } = require('../../server.js');

const BASE = '/tmp/agent-viz-test-base';

test('safePath: 정상 파일명 → 절대경로 반환', () => {
  const r = safePath(BASE, 'file.json');
  assert.strictEqual(r, path.join(BASE, 'file.json'));
});

test('safePath: path traversal ../ → null', () => {
  assert.strictEqual(safePath(BASE, '../evil.json'), null);
  assert.strictEqual(safePath(BASE, '../../etc/passwd'), null);
});

test('safePath: 절대경로 주입 → null 또는 BASE 밖', () => {
  const r = safePath(BASE, '/etc/passwd');
  // 절대경로는 path.resolve 결과가 BASE 밖 → null
  assert.strictEqual(r, null);
});

test('safePath: 중첩 ../../ 공격 → null', () => {
  assert.strictEqual(safePath(BASE, 'sub/../../../outside.json'), null);
});

test('safePath: 영숫자 + 한글 파일명 OK', () => {
  const r = safePath(BASE, '2026-04-08_123456_세션이름.json');
  assert.strictEqual(r, path.join(BASE, '2026-04-08_123456_세션이름.json'));
});

test('safePath: 빈 userInput → null 또는 BASE 자체', () => {
  // 빈 입력은 BASE와 동일해지므로 안전하지 않음
  const r = safePath(BASE, '');
  // 구현에 따라 null 또는 BASE — 어느 쪽이든 traversal은 막힘
  if (r !== null) {
    assert.ok(r === BASE || r.startsWith(BASE), 'BASE 밖으로 나가면 안 됨');
  }
});
