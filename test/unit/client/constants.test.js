// 클라이언트 constants.js 순수 함수 테스트
const { test } = require('node:test');
const assert = require('node:assert');
const { pickVillageTier, VILLAGE_TIER_MIN_W, PMAPS } = require('../../../public/js/constants.js');

test('pickVillageTier: 매우 작은 폭(0) → tier 1', () => {
  assert.strictEqual(pickVillageTier(0), 1);
});

test('pickVillageTier: 중간(500) → tier 1', () => {
  assert.strictEqual(pickVillageTier(500), 1);
});

test('pickVillageTier: tier 2 경계(780) → tier 2', () => {
  assert.strictEqual(pickVillageTier(780), 2);
});

test('pickVillageTier: tier 2 범위(1000) → tier 2', () => {
  assert.strictEqual(pickVillageTier(1000), 2);
});

test('pickVillageTier: tier 3 경계(1500) → tier 3', () => {
  assert.strictEqual(pickVillageTier(1500), 3);
});

test('pickVillageTier: 큰 폭(2000) → tier 3', () => {
  assert.strictEqual(pickVillageTier(2000), 3);
});

test('VILLAGE_TIER_MIN_W: 각 tier 최소 폭 상수', () => {
  assert.strictEqual(VILLAGE_TIER_MIN_W[1], 0);
  assert.strictEqual(VILLAGE_TIER_MIN_W[2], 780);
  assert.strictEqual(VILLAGE_TIER_MIN_W[3], 1500);
});

test('PMAPS: master/coder/reviewer/qa/architect/planner/_default 존재', () => {
  assert.ok(PMAPS.master);
  assert.ok(PMAPS.coder);
  assert.ok(PMAPS.reviewer);
  assert.ok(PMAPS.qa);
  assert.ok(PMAPS.architect);
  assert.ok(PMAPS.planner);
  assert.ok(PMAPS._default);
});

test('PMAPS: 각 픽셀맵은 8행 × 7열', () => {
  Object.keys(PMAPS).forEach(function(k) {
    if (k.startsWith('_') && k !== '_default') return; // _opus 등 모델별 머리만은 2행
    const map = PMAPS[k];
    assert.strictEqual(map.length, 8, k + ' 행 수');
    map.forEach(function(row, i) {
      assert.strictEqual(row.length, 7, k + ' row ' + i + ' 열 수');
    });
  });
});

test('PMAPS: 모델별 머리 변형 (_opus, _sonnet, _haiku)는 2행', () => {
  assert.strictEqual(PMAPS._opus.length, 2);
  assert.strictEqual(PMAPS._sonnet.length, 2);
  assert.strictEqual(PMAPS._haiku.length, 2);
});
