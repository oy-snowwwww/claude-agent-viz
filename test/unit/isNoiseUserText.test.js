// 실행: node --test test/unit/isNoiseUserText.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { isNoiseUserText } = require('../../server.js');

test('isNoiseUserText: 빈 문자열 → true', () => {
  assert.strictEqual(isNoiseUserText(''), true);
  assert.strictEqual(isNoiseUserText(null), true);
  assert.strictEqual(isNoiseUserText(undefined), true);
});

test('isNoiseUserText: wrapper 태그 시작 → true', () => {
  assert.strictEqual(isNoiseUserText('<command-name>/rename</command-name>'), true);
  assert.strictEqual(isNoiseUserText('<system-reminder>hook success</system-reminder>'), true);
  assert.strictEqual(isNoiseUserText('<local-command-stdout>...</local-command-stdout>'), true);
  assert.strictEqual(isNoiseUserText('<tool_use_error>error</tool_use_error>'), true);
  assert.strictEqual(isNoiseUserText('<bash-stdout>output</bash-stdout>'), true);
  assert.strictEqual(isNoiseUserText('<bash-input>ls -la</bash-input>'), true);
  assert.strictEqual(isNoiseUserText('<bash-output>result</bash-output>'), true);
  assert.strictEqual(isNoiseUserText('<request_metadata>meta</request_metadata>'), true);
});

test('isNoiseUserText: [Request interrupted → true', () => {
  assert.strictEqual(isNoiseUserText('[Request interrupted by user]'), true);
});

test('isNoiseUserText: 멀티라인 wrapper만 있는 경우 → true', () => {
  const text = '<system-reminder>hook success: OK</system-reminder>\n<bash-input>echo hi</bash-input>';
  assert.strictEqual(isNoiseUserText(text), true);
});

test('isNoiseUserText: wrapper 뒤에 실제 사용자 텍스트가 있으면 → false', () => {
  const text = '<system-reminder>hook OK</system-reminder>\n실제 사용자 질문입니다';
  assert.strictEqual(isNoiseUserText(text), false);
});

test('isNoiseUserText: 일반 사용자 텍스트 → false', () => {
  assert.strictEqual(isNoiseUserText('안녕하세요'), false);
  assert.strictEqual(isNoiseUserText('리팩토링 부탁드립니다'), false);
  assert.strictEqual(isNoiseUserText('hello world'), false);
});
