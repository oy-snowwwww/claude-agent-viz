// 실행: node --test test/unit/isValidTranscriptPath.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { isValidTranscriptPath } = require('../../server.js');

const HOME = process.env.HOME || '';
const VALID_BASE = path.join(HOME, '.claude', 'projects');

test('isValidTranscriptPath: ~/.claude/projects 하위 → true', () => {
  const p = path.join(VALID_BASE, 'my-project', 'session-abc123.jsonl');
  assert.strictEqual(isValidTranscriptPath(p), true);
});

test('isValidTranscriptPath: 다른 디렉토리 → false', () => {
  assert.strictEqual(isValidTranscriptPath('/etc/passwd'), false);
  assert.strictEqual(isValidTranscriptPath('/tmp/evil.jsonl'), false);
  assert.strictEqual(isValidTranscriptPath(path.join(HOME, 'Documents/foo.jsonl')), false);
});

test('isValidTranscriptPath: ../ traversal → false', () => {
  const p = path.join(VALID_BASE, '..', '..', 'etc', 'passwd');
  assert.strictEqual(isValidTranscriptPath(p), false);
});

test('isValidTranscriptPath: 빈 문자열 → false', () => {
  assert.strictEqual(isValidTranscriptPath(''), false);
  assert.strictEqual(isValidTranscriptPath(null), false);
  assert.strictEqual(isValidTranscriptPath(undefined), false);
});
