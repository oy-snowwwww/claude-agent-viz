// node:test 기반 단위 테스트 (의존성 0 — Node 18+ 내장)
// 실행: node --test test/unit/maskSecrets.test.js
// 또는: bash test/run.sh

const { test } = require('node:test');
const assert = require('node:assert');
const { maskSecrets } = require('../../server.js');

test('maskSecrets: null/empty → 그대로', () => {
  assert.strictEqual(maskSecrets(''), '');
  assert.strictEqual(maskSecrets(null), null);
  assert.strictEqual(maskSecrets(undefined), undefined);
});

test('maskSecrets: sk-* OpenAI/Anthropic 키 마스킹', () => {
  const r = maskSecrets('my key is sk-proj-abcdefghij1234567890xyz end');
  assert.match(r, /\[REDACTED_KEY\]/);
  assert.doesNotMatch(r, /sk-proj-abcdefghij/);
});

test('maskSecrets: GitHub 토큰 (ghp_, ghs_, gho_, ghu_) 마스킹', () => {
  assert.match(maskSecrets('ghp_abcdefghij1234567890AB'), /\[REDACTED_GH\]/);
  assert.match(maskSecrets('ghs_abcdefghij1234567890AB'), /\[REDACTED_GH\]/);
  assert.match(maskSecrets('gho_abcdefghij1234567890AB'), /\[REDACTED_GH\]/);
  assert.match(maskSecrets('ghu_abcdefghij1234567890AB'), /\[REDACTED_GH\]/);
});

test('maskSecrets: github_pat_* 마스킹', () => {
  assert.match(
    maskSecrets('github_pat_11ABCDEFG01234567890_abcdefghij'),
    /\[REDACTED_GH\]/
  );
});

test('maskSecrets: Slack 토큰 (xoxb/xoxp) 마스킹', () => {
  assert.match(maskSecrets('xoxb-1234567890-abcdefghij'), /\[REDACTED_SLACK\]/);
  assert.match(maskSecrets('xoxp-9876543210-zyxwvutsrq'), /\[REDACTED_SLACK\]/);
});

test('maskSecrets: AWS Access Key 마스킹', () => {
  assert.match(maskSecrets('AKIAIOSFODNN7EXAMPLE'), /\[REDACTED_AWS\]/);
});

test('maskSecrets: JWT 3-segment base64url 마스킹', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  assert.match(maskSecrets(jwt), /\[REDACTED_JWT\]/);
});

test('maskSecrets: Authorization 헤더 Bearer 마스킹', () => {
  const r = maskSecrets('Authorization: Bearer abcdefghij1234567890xyzABC');
  assert.match(r, /Authorization\s*:\s*Bearer \[REDACTED\]/);
});

test('maskSecrets: Bearer + JWT 마스킹 (JWT가 먼저 치환됨)', () => {
  const r = maskSecrets('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature_part');
  // JWT 패턴이 Bearer 처리보다 먼저 동작하므로 [REDACTED_JWT]로 치환됨 (보안상 OK)
  assert.match(r, /Bearer \[REDACTED_JWT\]/);
});

test('maskSecrets: Bearer + 40자 이상 토큰 마스킹', () => {
  const r = maskSecrets('Bearer ' + 'a'.repeat(45));
  assert.match(r, /Bearer \[REDACTED\]/);
});

test('maskSecrets: Bearer + 일반 영어 단어는 false positive 방지 (마스킹 X)', () => {
  const r = maskSecrets('Bearer hello');
  assert.doesNotMatch(r, /\[REDACTED\]/);
  assert.strictEqual(r, 'Bearer hello');
});

test('maskSecrets: 일반 텍스트는 그대로', () => {
  const r = maskSecrets('안녕하세요. 오늘 날씨가 좋네요.');
  assert.strictEqual(r, '안녕하세요. 오늘 날씨가 좋네요.');
});
