// HTTP API 통합 테스트 — 실제 서버 child spawn + http.request
// 실행: node --test test/integration/api.test.js
// (AGENT_VIZ_PORT=54399 격리 포트 사용)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, stopTestServer, request } = require('./helper.js');

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await stopTestServer(server);
});

// === /api/sessions GET ===
test('GET /api/sessions → 200 + 배열', async () => {
  const r = await request('GET', '/api/sessions');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

// === /api/agents GET ===
test('GET /api/agents → 200 + 배열', async () => {
  const r = await request('GET', '/api/agents');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

// === /api/mcp GET ===
test('GET /api/mcp → 200 + 배열', async () => {
  const r = await request('GET', '/api/mcp');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

// === /api/hooks GET ===
test('GET /api/hooks → 200 + 배열', async () => {
  const r = await request('GET', '/api/hooks');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

// === /api/stats GET ===
test('GET /api/stats → 200 + 통계 객체', async () => {
  const r = await request('GET', '/api/stats');
  assert.strictEqual(r.status, 200);
  assert.ok(r.json);
  assert.ok(r.json.hasOwnProperty('prompts'));
  assert.ok(r.json.hasOwnProperty('totalAgents'));
  assert.ok(r.json.hasOwnProperty('totalTools'));
  assert.ok(r.json.hasOwnProperty('weekly'));
});

// === /api/history GET ===
test('GET /api/history → 200 + {items, totalCount, hasFilter}', async () => {
  const r = await request('GET', '/api/history');
  assert.strictEqual(r.status, 200);
  assert.ok(r.json);
  assert.ok(Array.isArray(r.json.items));
  assert.strictEqual(typeof r.json.totalCount, 'number');
  assert.strictEqual(typeof r.json.hasFilter, 'boolean');
});

test('GET /api/history?q=test → 검색 필터 적용', async () => {
  const r = await request('GET', '/api/history?q=test');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.hasFilter, true);
});

test('GET /api/history?days=7 → 날짜 필터 적용', async () => {
  const r = await request('GET', '/api/history?days=7');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.hasFilter, true);
});

// === /api/privacy GET/POST ===
test('GET /api/privacy → 200 + {enabled:boolean}', async () => {
  const r = await request('GET', '/api/privacy');
  assert.strictEqual(r.status, 200);
  assert.ok(r.json);
  assert.strictEqual(typeof r.json.enabled, 'boolean');
});

// === /api/events POST (hook 이벤트) ===
test('POST /api/events session_start → 세션 등록', async () => {
  const r = await request('POST', '/api/events', {
    event: 'session_start',
    session: { pid: 'test-pid-001', cwd: '/tmp', name: 'api-test', sid: 'sid-001' },
    data: { session_id: 'sid-001' },
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.json);
  assert.strictEqual(r.json.ok, true);
});

test('POST /api/events thinking_start/end → 세션 등록된 후 /api/sessions에 노출', async () => {
  const pid = 'test-pid-002';
  await request('POST', '/api/events', {
    event: 'session_start',
    session: { pid: pid, cwd: '/tmp', name: 'flow-test', sid: 'sid-002' },
    data: { session_id: 'sid-002' },
  });
  await request('POST', '/api/events', {
    event: 'thinking_start',
    session: { pid: pid, name: 'flow-test', sid: 'sid-002' },
    data: { session_id: 'sid-002', prompt: 'hello test' },
  });
  await request('POST', '/api/events', {
    event: 'tool_use',
    session: { pid: pid, name: 'flow-test', sid: 'sid-002' },
    data: { tool_name: 'Read', tool_input: { file_path: '/tmp/x.js' } },
  });
  await request('POST', '/api/events', {
    event: 'thinking_end',
    session: { pid: pid, name: 'flow-test', sid: 'sid-002' },
    data: { session_id: 'sid-002' },
  });

  const sessions = await request('GET', '/api/sessions');
  const found = sessions.json.find((s) => s.pid === pid);
  assert.ok(found, 'session should be registered');
  assert.strictEqual(found.name, 'flow-test');
});

// === /api/stats/reset POST ===
test('POST /api/stats/reset → 통계 0으로 초기화', async () => {
  // 먼저 통계 쌓기
  await request('POST', '/api/events', {
    event: 'thinking_start',
    session: { pid: 'stats-pid', name: 's', sid: 'sid-s' },
    data: { session_id: 'sid-s', prompt: 'hi' },
  });
  const before = await request('GET', '/api/stats');
  // reset
  const reset = await request('POST', '/api/stats/reset');
  assert.strictEqual(reset.status, 200);
  assert.strictEqual(reset.json.ok, true);
  assert.ok(reset.json.since);
  // 이후 stats 재조회
  const after = await request('GET', '/api/stats');
  assert.strictEqual(after.json.prompts, 0);
  assert.strictEqual(after.json.totalAgents, 0);
});

// === DELETE /api/history ===
test('DELETE /api/history → 200 + {ok, deleted}', async () => {
  const r = await request('DELETE', '/api/history');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.ok, true);
  assert.strictEqual(typeof r.json.deleted, 'number');
});

// === DELETE /api/history/:filename (path traversal 방어) ===
test('DELETE /api/history/../etc/passwd → 400 invalid filename', async () => {
  const r = await request('DELETE', '/api/history/' + encodeURIComponent('../etc/passwd'));
  assert.strictEqual(r.status, 400);
});

test('DELETE /api/history/notfound.json → 404 not found', async () => {
  const r = await request('DELETE', '/api/history/nonexistent12345.json');
  assert.strictEqual(r.status, 404);
});

test('DELETE /api/history/invalid%20encoding → 400', async () => {
  // decodeURIComponent 실패 유발: %E0%A4 같은 불완전 멀티바이트
  const r = await request('DELETE', '/api/history/%E0%A4');
  // decodeURIComponent try-catch가 400 반환
  assert.ok(r.status === 400);
});

// === 존재하지 않는 경로 ===
test('GET /api/nonexistent → 404', async () => {
  const r = await request('GET', '/api/nonexistent-endpoint');
  assert.strictEqual(r.status, 404);
});

// === CORS preflight ===
test('OPTIONS /api/sessions → 200', async () => {
  const r = await request('OPTIONS', '/api/sessions');
  assert.strictEqual(r.status, 200);
});
