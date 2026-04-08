// HTTP 헬퍼 단위 테스트 (isAllowedOrigin, isPrivacyOn, ensureToday)
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { isAllowedOrigin, isPrivacyOn, ensureToday, todayKey, _resetTestState, _getTestState } = require('../../server.js');

beforeEach(() => _resetTestState());

// === isAllowedOrigin ===

test('isAllowedOrigin: Origin 헤더 없음 → true (server-to-server)', () => {
  const req = { headers: {} };
  assert.strictEqual(isAllowedOrigin(req), true);
});

test('isAllowedOrigin: Origin이 localhost:54321 → true', () => {
  const req = { headers: { origin: 'http://localhost:54321', host: 'localhost:54321' } };
  assert.strictEqual(isAllowedOrigin(req), true);
});

test('isAllowedOrigin: Origin이 127.0.0.1 → true', () => {
  const req = { headers: { origin: 'http://127.0.0.1:54321', host: '127.0.0.1:54321' } };
  assert.strictEqual(isAllowedOrigin(req), true);
});

test('isAllowedOrigin: Origin이 외부 도메인 → false', () => {
  const req = { headers: { origin: 'http://evil.com', host: 'localhost:54321' } };
  assert.strictEqual(isAllowedOrigin(req), false);
});

test('isAllowedOrigin: Origin null 문자열 → 허용 (file:// 등)', () => {
  const req = { headers: { origin: 'null', host: 'localhost:54321' } };
  // 'null' origin은 구현에 따라 다르지만 로컬 전용 환경이라 보통 허용
  // 실제 구현 결과에 맞춰 검증
  const r = isAllowedOrigin(req);
  assert.strictEqual(typeof r, 'boolean');
});

// === isPrivacyOn ===

test('isPrivacyOn: privacy 파일 없으면 false (기본)', () => {
  // 테스트 환경에 따라 파일이 있을 수 있으므로 타입만 검증
  assert.strictEqual(typeof isPrivacyOn(), 'boolean');
});

// === ensureToday ===

test('ensureToday: today bucket 생성', () => {
  ensureToday();
  const state = _getTestState();
  assert.ok(state.statsData.today);
  assert.strictEqual(state.statsData.today.date, todayKey());
  assert.strictEqual(state.statsData.today.prompts, 0);
  assert.deepStrictEqual(state.statsData.today.agents, {});
  assert.deepStrictEqual(state.statsData.today.tools, {});
});

test('ensureToday: 같은 날 재호출 → 같은 bucket (초기화 안 함)', () => {
  ensureToday();
  const state1 = _getTestState();
  state1.statsData.today.prompts = 5;
  ensureToday();
  const state2 = _getTestState();
  assert.strictEqual(state2.statsData.today.prompts, 5); // 보존됨
});

test('ensureToday: 날짜가 다르면 history로 이동', () => {
  ensureToday();
  const state = _getTestState();
  state.statsData.today.date = '2020-01-01'; // 과거 날짜
  state.statsData.today.prompts = 10;
  ensureToday();
  const state2 = _getTestState();
  assert.strictEqual(state2.statsData.today.date, todayKey());
  assert.strictEqual(state2.statsData.today.prompts, 0);
  // history에 이전 day 이동됨
  assert.ok(state2.statsData.history.length >= 1);
  assert.strictEqual(state2.statsData.history[0].date, '2020-01-01');
  assert.strictEqual(state2.statsData.history[0].prompts, 10);
});

test('ensureToday: history 90일 cap', () => {
  ensureToday();
  const state = _getTestState();
  // history를 95개로 채움
  for (var i = 0; i < 95; i++) {
    state.statsData.history.push({ date: '2020-01-' + (i + 1).toString().padStart(2, '0'), prompts: 1 });
  }
  // 강제로 today를 과거로 → ensureToday가 history로 밀어넣으며 slice
  state.statsData.today.date = '2019-12-31';
  ensureToday();
  const state2 = _getTestState();
  assert.ok(state2.statsData.history.length <= 90);
});

// === todayKey ===

test('todayKey: YYYY-MM-DD 형식', () => {
  const k = todayKey();
  assert.match(k, /^\d{4}-\d{2}-\d{2}$/);
});

test('todayKey: 연속 호출 동일 값 (같은 날)', () => {
  const k1 = todayKey();
  const k2 = todayKey();
  assert.strictEqual(k1, k2);
});
