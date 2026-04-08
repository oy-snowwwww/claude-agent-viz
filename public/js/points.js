// 게임화 포인트 클라이언트 — 배지 렌더 + SSE 수신 + 버프 동기화
// 로드 순서: event-ticks 이후, main 이전
// 의존: state.js(API), utils.js(esc), constants.js(ITEMS, computeBuffs)
//
// 동작:
// 1) 초기: GET /api/points → pointsData 로컬 저장 + window.gameBuffs 갱신
// 2) SSE 수신: events.js의 handleLiveEvent가 'points_updated' 이벤트 시 updatePointsFromEvent() 호출
// 3) 구매/초기화 시 shop.js가 이 모듈의 fetchPoints()를 호출해 갱신
//
// ⚠ 프리뷰 모드(?preview=...)에서는 서버 동기화 건너뜀 — main.js가 buildPreviewInventory로 고정

var pointsData = {
  version: 1,
  total: 0,
  totalRaw: 0,
  lifetime: 0,
  inventory: {},
  buffs: {},
};

// 첫 획득 시 플로팅 "+N" 애니메이션 대기열 (배지 옆에서 위로 fade out)
var _pointsFloatQueue = [];

// 서버에서 포인트 상태 조회 → 로컬 반영 + 배지 렌더
function fetchPoints() {
  // 프리뷰 모드면 서버 상태 무시 (main.js가 이미 window.gameBuffs를 가상 인벤토리로 설정함)
  if (window.gamePreviewMode) {
    renderPointsBadge();
    return;
  }
  fetch(API + '/api/points').then(function(r) { return r.json() }).then(function(data) {
    pointsData = data;
    window.gameBuffs = data.buffs || {};
    renderPointsBadge();
    // village/workspace 재렌더 (버프 적용된 상태로)
    if (typeof renderVillage === 'function') renderVillage();
    if (typeof restartAmbient === 'function') restartAmbient();
  }).catch(function() {
    // 서버 없음 — 빈 상태 유지
    renderPointsBadge();
  });
}

// SSE 'points_updated' 이벤트 처리 (events.js의 handleLiveEvent에서 호출)
function updatePointsFromEvent(ev) {
  if (ev.event !== 'points_updated') return;
  // 프리뷰 모드면 서버 상태 무시
  if (window.gamePreviewMode) return;

  // 델타 업데이트 (전체 재요청 없이 SSE 데이터로 로컬 동기화)
  if (typeof ev.total === 'number') {
    pointsData.totalRaw = ev.total;
    pointsData.total = Math.floor(ev.total);
  }
  if (typeof ev.lifetime === 'number') {
    pointsData.lifetime = Math.floor(ev.lifetime);
  }
  if (ev.inventory) {
    pointsData.inventory = ev.inventory;
    // 인벤토리 변경 → buffs 재계산
    if (typeof computeBuffs === 'function') {
      pointsData.buffs = computeBuffs(ev.inventory);
      window.gameBuffs = pointsData.buffs;
    }
  }

  // 획득 시 플로팅 "+N" (0.5초 노출 후 위로 fade)
  if (typeof ev.delta === 'number' && ev.delta > 0) {
    showPointsFloat('+' + (ev.delta % 1 === 0 ? ev.delta : ev.delta.toFixed(1)));
  }

  renderPointsBadge();

  // 인벤토리 변경이 있으면 village 재렌더 (구매/초기화 반영)
  if (ev.inventory || ev.purchasedItem || ev.fullReset || typeof ev.refunded === 'number') {
    if (typeof renderVillage === 'function') renderVillage();
    if (typeof restartAmbient === 'function') restartAmbient();
  }

  // 상점 열려있으면 그리드/지갑 실시간 갱신
  if (typeof onPointsChangedForShop === 'function') onPointsChangedForShop();
}

// 배지 DOM 렌더 — 헤더의 #pointsBadge에 숫자 표시
function renderPointsBadge() {
  var el = document.getElementById('pointsBadge');
  if (!el) return;
  var total = pointsData.total || 0;
  var lifetime = pointsData.lifetime || 0;
  // 프리뷰 모드 표시
  var preview = window.gamePreviewMode;
  if (preview) {
    el.innerHTML = '<span class="points-icon">⭐</span> <strong>PREVIEW</strong> <span class="points-preview-tag">' + esc(preview) + '</span>';
    el.dataset.tip = '프리뷰 모드 — 실제 포인트 저장 안 됨 (?preview=' + esc(preview) + ')';
    return;
  }
  el.innerHTML = '<span class="points-icon">⭐</span> <strong>' + total + '</strong>';
  el.dataset.tip = '포인트 ' + total + ' · 누적 ' + lifetime + ' · 클릭: 상점';
}

// "+3" 같은 획득 플로팅 애니메이션 (배지 옆에서 위로 fade out)
function showPointsFloat(text) {
  var badge = document.getElementById('pointsBadge');
  if (!badge) return;
  var float = document.createElement('span');
  float.className = 'points-float';
  float.textContent = text;
  badge.appendChild(float);
  setTimeout(function() { float.remove() }, 1400);
}
