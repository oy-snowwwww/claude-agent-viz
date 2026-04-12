// transcript 파싱 단위 테스트 — ~/.claude/projects 화이트리스트 + 임시 파일 사용
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseTranscriptTurns, extractLatestRenameFromTranscript, buildTurnSummaries, _clearRenameCache } = require('../../server.js');

// isValidTranscriptPath는 ~/.claude/projects/ 하위만 허용하므로
// 테스트 파일을 해당 디렉토리에 만들고 사용 후 정리
const HOME = process.env.HOME || '';
const TEST_DIR = path.join(HOME, '.claude', 'projects', '__test-transcript__');
const TEST_FILE = path.join(TEST_DIR, 'test.jsonl');

before(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

after(() => {
  try { fs.unlinkSync(TEST_FILE); } catch (e) {}
  try { fs.rmdirSync(TEST_DIR); } catch (e) {}
});

function writeJsonl(lines) {
  fs.writeFileSync(TEST_FILE, lines.map(l => JSON.stringify(l)).join('\n'), 'utf8');
}

// === parseTranscriptTurns ===

test('parseTranscriptTurns: 존재하지 않는 파일 → []', () => {
  const r = parseTranscriptTurns('/tmp/nonexistent.jsonl');
  assert.deepStrictEqual(r, []);
});

test('parseTranscriptTurns: 화이트리스트 밖 경로 → []', () => {
  // /etc/... 같은 경로는 isValidTranscriptPath에서 차단
  const r = parseTranscriptTurns('/etc/passwd');
  assert.deepStrictEqual(r, []);
});

test('parseTranscriptTurns: 정상 user → assistant 쌍 파싱', () => {
  writeJsonl([
    { type: 'user', message: { content: 'hello' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '안녕하세요' }] } },
  ]);
  const r = parseTranscriptTurns(TEST_FILE);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].userText, 'hello');
  assert.strictEqual(r[0].lastAssistantText, '안녕하세요');
});

test('parseTranscriptTurns: tool_result only user 메시지 skip', () => {
  writeJsonl([
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'result' }] } },
    { type: 'user', message: { content: '진짜 질문' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '답변' }] } },
  ]);
  const r = parseTranscriptTurns(TEST_FILE);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].userText, '진짜 질문');
});

test('parseTranscriptTurns: 여러 turn 파싱', () => {
  writeJsonl([
    { type: 'user', message: { content: 'q1' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'a1' }] } },
    { type: 'user', message: { content: 'q2' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'a2' }] } },
  ]);
  const r = parseTranscriptTurns(TEST_FILE);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].userText, 'q1');
  assert.strictEqual(r[1].userText, 'q2');
});

test('parseTranscriptTurns: 손상된 JSON 라인 skip', () => {
  fs.writeFileSync(TEST_FILE,
    JSON.stringify({ type: 'user', message: { content: 'q1' } }) + '\n' +
    'not json\n' +
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'a1' }] } }) + '\n',
    'utf8'
  );
  const r = parseTranscriptTurns(TEST_FILE);
  assert.strictEqual(r.length, 1);
});

test('parseTranscriptTurns: assistant가 마지막 text로 덮어씀', () => {
  writeJsonl([
    { type: 'user', message: { content: 'q' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '첫번째 응답' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '최종 응답' }] } },
  ]);
  const r = parseTranscriptTurns(TEST_FILE);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].lastAssistantText, '최종 응답');
});

// === extractLatestRenameFromTranscript ===

test('extractLatestRenameFromTranscript: /rename 명령 없음 → null', () => {
  _clearRenameCache();
  writeJsonl([
    { type: 'user', message: { content: 'hello' } },
  ]);
  const r = extractLatestRenameFromTranscript(TEST_FILE);
  assert.strictEqual(r, null);
});

test('extractLatestRenameFromTranscript: system/local_command /rename → 이름 추출', () => {
  _clearRenameCache();
  writeJsonl([
    { type: 'system', subtype: 'local_command', content: '<command-name>/rename</command-name>\n<command-args>내세션</command-args>' },
  ]);
  const r = extractLatestRenameFromTranscript(TEST_FILE);
  assert.strictEqual(r, '내세션');
});

test('extractLatestRenameFromTranscript: 여러 /rename 중 가장 최근 것', () => {
  _clearRenameCache();
  writeJsonl([
    { type: 'system', subtype: 'local_command', content: '<command-name>/rename</command-name>\n<command-args>첫번째</command-args>' },
    { type: 'user', message: { content: 'q' } },
    { type: 'system', subtype: 'local_command', content: '<command-name>/rename</command-name>\n<command-args>두번째</command-args>' },
    { type: 'system', subtype: 'local_command', content: '<command-name>/rename</command-name>\n<command-args>최종</command-args>' },
  ]);
  const r = extractLatestRenameFromTranscript(TEST_FILE);
  assert.strictEqual(r, '최종');
});

test('extractLatestRenameFromTranscript: 화이트리스트 밖 → null', () => {
  const r = extractLatestRenameFromTranscript('/etc/passwd');
  assert.strictEqual(r, null);
});

// === buildTurnSummaries ===

test('buildTurnSummaries: tracker prompt와 transcript userText 정확 일치', () => {
  const trackerTurns = [{ prompt: 'hello world' }];
  const transcriptTurns = [{ userText: 'hello world', lastAssistantText: '안녕하세요' }];
  const r = buildTurnSummaries(trackerTurns, transcriptTurns);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0], '안녕하세요');
});

test('buildTurnSummaries: tracker prompt가 truncate(…) → transcript가 prefix로 매칭', () => {
  const trackerTurns = [{ prompt: 'hello wor…' }];
  const transcriptTurns = [{ userText: 'hello world full text', lastAssistantText: '답변' }];
  const r = buildTurnSummaries(trackerTurns, transcriptTurns);
  assert.strictEqual(r[0], '답변');
});

test('buildTurnSummaries: 짧은 prompt(5자 미만) → 매칭 포기', () => {
  const trackerTurns = [{ prompt: 'hi' }];
  const transcriptTurns = [{ userText: 'hi', lastAssistantText: '안녕' }];
  const r = buildTurnSummaries(trackerTurns, transcriptTurns);
  assert.strictEqual(r[0], ''); // 매칭 안 됨
});

test('buildTurnSummaries: 같은 transcript turn 중복 매칭 방지', () => {
  const trackerTurns = [
    { prompt: 'hello world' },
    { prompt: 'hello world' }, // 똑같은 prompt 두 번
  ];
  const transcriptTurns = [
    { userText: 'hello world', lastAssistantText: '첫번째' },
    { userText: 'hello world', lastAssistantText: '두번째' },
  ];
  const r = buildTurnSummaries(trackerTurns, transcriptTurns);
  // 각 tracker turn이 서로 다른 transcript turn에 매칭
  assert.strictEqual(r[0], '첫번째');
  assert.strictEqual(r[1], '두번째');
});

test('buildTurnSummaries: 매칭 안 되는 케이스 → 빈 문자열', () => {
  const trackerTurns = [{ prompt: '매칭 안 되는 긴 질문' }];
  const transcriptTurns = [{ userText: '다른 질문', lastAssistantText: '답변' }];
  const r = buildTurnSummaries(trackerTurns, transcriptTurns);
  assert.strictEqual(r[0], '');
});
