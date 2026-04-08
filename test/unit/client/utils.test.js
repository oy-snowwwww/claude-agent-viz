// 클라이언트 utils.js 순수 함수 테스트
const { test } = require('node:test');
const assert = require('node:assert');
const { esc, shade, instKey } = require('../../../public/js/utils.js');

// === esc (HTML escape, XSS 방어) ===

test('esc: & → &amp;', () => {
  assert.strictEqual(esc('A & B'), 'A &amp; B');
});

test('esc: < > → &lt; &gt;', () => {
  assert.strictEqual(esc('<script>'), '&lt;script&gt;');
});

test('esc: " → &quot;', () => {
  assert.strictEqual(esc('say "hi"'), 'say &quot;hi&quot;');
});

test("esc: ' → &#x27;", () => {
  assert.strictEqual(esc("it's"), 'it&#x27;s');
});

test('esc: 모두 조합', () => {
  assert.strictEqual(
    esc('<img src="x" onerror=\'alert(1)\'> & fin'),
    '&lt;img src=&quot;x&quot; onerror=&#x27;alert(1)&#x27;&gt; &amp; fin'
  );
});

test('esc: 일반 텍스트 그대로', () => {
  assert.strictEqual(esc('안녕하세요'), '안녕하세요');
});

test('esc: 빈 문자열', () => {
  assert.strictEqual(esc(''), '');
});

test('esc: null/undefined → 문자열 "null"/"undefined"', () => {
  // String(null) → "null"
  assert.strictEqual(esc(null), 'null');
  assert.strictEqual(esc(undefined), 'undefined');
});

// === shade (16진수 색상 명암) ===

test('shade: +50 → 밝게', () => {
  const r = shade('#808080', 50);
  // 0x80 + 50 = 0xB2 (178)
  assert.strictEqual(r.toLowerCase(), '#b2b2b2');
});

test('shade: -50 → 어둡게', () => {
  const r = shade('#808080', -50);
  // 0x80 - 50 = 0x4E (78)
  assert.strictEqual(r.toLowerCase(), '#4e4e4e');
});

test('shade: 포화 상한 (255 넘어가면 255)', () => {
  const r = shade('#ffffff', 50);
  assert.strictEqual(r.toLowerCase(), '#ffffff');
});

test('shade: 포화 하한 (0 아래로 내려가면 0)', () => {
  const r = shade('#000000', -50);
  assert.strictEqual(r.toLowerCase(), '#000000');
});

test('shade: 채널별 독립 계산', () => {
  // #FF0080 → r:255, g:0, b:128
  const r = shade('#ff0080', -50);
  // r:205, g:0, b:78
  assert.strictEqual(r.toLowerCase(), '#cd004e');
});

// === instKey (라이브 인스턴스 키 생성) ===

test('instKey: sessionPid + agentId 결합', () => {
  assert.strictEqual(instKey('pid123', 'coder'), 'pid123_coder');
});

test('instKey: 빈 값도 처리', () => {
  assert.strictEqual(instKey('', 'reviewer'), '_reviewer');
  assert.strictEqual(instKey('pid', ''), 'pid_');
});
