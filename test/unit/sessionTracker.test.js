// 세션 추적 단위 테스트 — sessionTrackers 전역 상태를 다루므로 beforeEach로 격리
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getTracker, recordSessionEvent, ensureCurrentTurn, _resetTestState, _getTestState } = require('../../server.js');

beforeEach(() => _resetTestState());

test('getTracker: 첫 호출 → 새 트래커 생성', () => {
  var t = getTracker('pid-1');
  assert.ok(t);
  assert.strictEqual(t.questions, 0);
  assert.deepStrictEqual(t.turns, []);
  assert.deepStrictEqual(t.agents, {});
  assert.deepStrictEqual(t.tools, {});
});

test('getTracker: 같은 pid → 같은 인스턴스', () => {
  var t1 = getTracker('pid-1');
  var t2 = getTracker('pid-1');
  assert.strictEqual(t1, t2);
});

test('recordSessionEvent: thinking_start → questions 증가 + 새 turn', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'hello world' });
  var t = getTracker('pid-1');
  assert.strictEqual(t.questions, 1);
  assert.strictEqual(t.turns.length, 1);
  assert.match(t.turns[0].prompt, /hello world/);
  assert.strictEqual(t.turns[0].q, 1);
});

test('recordSessionEvent: thinking_end → endTime + sec 기록', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q1' });
  var t = getTracker('pid-1');
  t.thinkStart = Date.now() - 2000; // 2초 전
  recordSessionEvent('pid-1', { event: 'thinking_end' });
  assert.ok(t.turns[0].endTime);
  assert.ok(t.turns[0].sec >= 1);
  assert.strictEqual(t.responseTimes.length, 1);
});

test('recordSessionEvent: tool_use → 도구 카운트 증가', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' });
  recordSessionEvent('pid-1', { event: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/tmp/a.js' } });
  recordSessionEvent('pid-1', { event: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/tmp/a.js' } });
  recordSessionEvent('pid-1', { event: 'tool_use', tool_name: 'Edit', tool_input: { file_path: '/tmp/a.js' } });
  var t = getTracker('pid-1');
  assert.strictEqual(t.tools.Read, 2);
  assert.strictEqual(t.tools.Edit, 1);
  assert.strictEqual(t.turns[0].tools.Read, 2);
  assert.strictEqual(t.turns[0].tools.Edit, 1);
});

test('recordSessionEvent: tool_use file_path → t.files 집계', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' });
  recordSessionEvent('pid-1', { event: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/tmp/a.js' } });
  recordSessionEvent('pid-1', { event: 'tool_use', tool_name: 'Edit', tool_input: { file_path: '/tmp/a.js' } });
  var t = getTracker('pid-1');
  assert.ok(t.files['/tmp/a.js']);
  assert.strictEqual(t.files['/tmp/a.js'].read, 1);
  assert.strictEqual(t.files['/tmp/a.js'].edit, 1);
});

test('recordSessionEvent: agent_start → agents 카운트 증가', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' });
  recordSessionEvent('pid-1', { event: 'agent_start', agent_type: 'coder' });
  recordSessionEvent('pid-1', { event: 'agent_start', agent_type: 'coder' });
  recordSessionEvent('pid-1', { event: 'agent_start', agent_type: 'reviewer' });
  var t = getTracker('pid-1');
  assert.strictEqual(t.agents.coder.count, 2);
  assert.strictEqual(t.agents.reviewer.count, 1);
  assert.strictEqual(t.turns[0].agents.coder, 2);
  assert.strictEqual(t.turns[0].agents.reviewer, 1);
});

test('recordSessionEvent: agent_done → totalSec 누적', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' });
  recordSessionEvent('pid-1', { event: 'agent_start', agent_type: 'coder' });
  var t = getTracker('pid-1');
  t.agents.coder.starts[0] = Date.now() - 3000; // 3초 전 시작
  recordSessionEvent('pid-1', { event: 'agent_done', agent_type: 'coder' });
  assert.ok(t.agents.coder.totalSec >= 2);
  assert.strictEqual(t.agents.coder.starts.length, 0);
});

test('ensureCurrentTurn: 활성 turn 있음 → 그대로 반환', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' });
  var t = getTracker('pid-1');
  var cur = ensureCurrentTurn(t);
  assert.strictEqual(cur, t.turns[0]);
});

test('ensureCurrentTurn: 활성 turn 없음 → 더미 turn 생성', () => {
  // recover 시나리오: thinking_start 없이 tool_use부터 도착
  var t = getTracker('pid-1');
  assert.strictEqual(t.turns.length, 0);
  var cur = ensureCurrentTurn(t);
  assert.ok(cur);
  assert.strictEqual(t.turns.length, 1);
  assert.strictEqual(t.questions, 1);
  assert.strictEqual(cur.prompt, ''); // 더미는 빈 prompt
});

test('ensureCurrentTurn: 이전 turn이 endTime 있으면 새 더미 생성', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q1' });
  var t = getTracker('pid-1');
  t.turns[0].endTime = Date.now(); // 종료된 turn
  var cur = ensureCurrentTurn(t);
  assert.notStrictEqual(cur, t.turns[0]);
  assert.strictEqual(t.turns.length, 2);
});

test('recordSessionEvent: recover 시나리오 — thinking_start 없이 tool_use → 더미 turn에 기록', () => {
  // thinking_start 건너뛰고 tool_use 바로
  recordSessionEvent('pid-1', { event: 'tool_use', tool_name: 'Read', tool_input: {} });
  var t = getTracker('pid-1');
  assert.strictEqual(t.tools.Read, 1);
  assert.strictEqual(t.turns.length, 1); // 더미 turn 생성됨
  assert.strictEqual(t.turns[0].tools.Read, 1);
});

test('recordSessionEvent: 100 질문 cap 초과 → truncated 플래그', () => {
  var t = getTracker('pid-1');
  for (var i = 0; i < 102; i++) {
    recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' + i });
    recordSessionEvent('pid-1', { event: 'thinking_end' });
  }
  assert.strictEqual(t.questions, 102);
  assert.ok(t.turns.length <= 100);
  assert.strictEqual(t.truncated, true);
});

test('_resetTestState: 상태 초기화', () => {
  recordSessionEvent('pid-1', { event: 'thinking_start', prompt: 'q' });
  assert.ok(_getTestState().sessionTrackers['pid-1']);
  _resetTestState();
  assert.strictEqual(_getTestState().sessionTrackers['pid-1'], undefined);
});
