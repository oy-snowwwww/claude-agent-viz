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
// 캐릭터 효과 (char_halo 등) workspace data attribute 동기화
// CSS에서 [data-char-halo="1"] selector로 효과 적용
function syncCharBuffs() {
  var ws = document.querySelector('.workspace');
  if (!ws) return;
  var b = window.gameBuffs || {};
  ws.dataset.charHalo = (b.charHalo > 0) ? '1' : '0';
  ws.dataset.charTrail = (b.charTrail > 0) ? '1' : '0';
  ws.dataset.charJump = (b.charJump > 0) ? '1' : '0';
  // 메타 스트릭 배지 업데이트
  var badge = document.getElementById('streakBadge');
  if (badge) {
    if (b.metaStreak > 0 && pointsData.streak > 0) {
      badge.style.display = '';
      badge.textContent = '🔥 ' + pointsData.streak;
    } else {
      badge.style.display = 'none';
    }
  }
}

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
    syncCharBuffs();
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
  if (typeof ev.streak === 'number') {
    pointsData.streak = ev.streak;
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

  // 드롭 보너스 토스트
  if (typeof ev.drop === 'number' && ev.drop > 0) {
    if (typeof toast === 'function') toast('🎰 보너스 드롭! +' + ev.drop + 'P');
  }

  // 성취 달성 토스트
  if (ev.achievements && ev.achievements.length > 0) {
    ev.achievements.forEach(function(a) {
      if (typeof toast === 'function') toast('🏆 ' + a.name + ' 달성! +' + a.reward + 'P');
    });
    // 로컬 achievements도 갱신
    if (!pointsData.achievements) pointsData.achievements = {};
    ev.achievements.forEach(function(a) {
      pointsData.achievements[a.id] = new Date().toISOString();
    });
  }

  renderPointsBadge();
  syncCharBuffs();

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

// === 포인트 히스토리 + 성취 모달 (lazy 생성) ===
var _chartModalBuilt = false;

// 성취 데이터 캐시 (모달 열 때 1회 fetch, 탭 전환은 캐시 사용)
var _achData = null;
var _achCurrentCat = null;

function openPointsChart() {
  if (!_chartModalBuilt) {
    _chartModalBuilt = true;
    var overlay = document.createElement('div');
    overlay.className = 'chart-overlay';
    overlay.id = 'chartOverlay';
    overlay.onclick = function(e) { if (e.target === overlay) closePointsChart(); };
    overlay.innerHTML =
      '<div class="chart-modal">' +
        '<div class="chart-header">' +
          '<div class="ach-summary" id="achSummary"></div>' +
          '<button class="chart-close" onclick="closePointsChart()">&times;</button>' +
        '</div>' +
        '<div class="ach-tabs" id="achTabs"></div>' +
        '<div class="chart-body" id="chartBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
  }
  document.getElementById('chartOverlay').classList.add('show');
  _achData = null;
  _fetchAndRenderAch();
}

function closePointsChart() {
  var overlay = document.getElementById('chartOverlay');
  if (overlay) overlay.classList.remove('show');
}

function _fetchAndRenderAch() {
  var body = document.getElementById('chartBody');
  if (!body) return;
  body.innerHTML = '<div class="chart-loading">로딩 중...</div>';
  fetch(API + '/api/points/achievements').then(function(r) { return r.json(); }).then(function(data) {
    _achData = data;
    var defs = data.achievementDefs || [];
    var cats = data.categories || {};
    // 달성률 요약
    var total = defs.length;
    var unlocked = defs.filter(function(a) { return a.unlocked; }).length;
    var summaryEl = document.getElementById('achSummary');
    if (summaryEl) summaryEl.textContent = unlocked + ' / ' + total + ' 달성';
    // 카테고리 순서 보존
    var catOrder = [];
    defs.forEach(function(a) {
      var c = a.cat || 'master';
      if (catOrder.indexOf(c) < 0) catOrder.push(c);
    });
    // 탭 렌더 (이모지만)
    var tabsEl = document.getElementById('achTabs');
    if (tabsEl) {
      tabsEl.innerHTML = '';
      catOrder.forEach(function(c) {
        var label = cats[c] || c;
        var emoji = label.split(' ')[0] || c;  // "🎯 질문" → "🎯"
        var catItems = defs.filter(function(a) { return a.cat === c; });
        var catDone = catItems.filter(function(a) { return a.unlocked; }).length;
        var btn = document.createElement('button');
        btn.className = 'ach-tab' + (c === (_achCurrentCat || catOrder[0]) ? ' active' : '');
        btn.textContent = emoji;
        btn.dataset.cat = c;
        btn.dataset.tip = label + ' ' + catDone + '/' + catItems.length;
        (function(catId) { btn.onclick = function() { _switchAchTab(catId); }; })(c);
        tabsEl.appendChild(btn);
      });
    }
    // 첫 탭 또는 이전 선택 탭 렌더
    if (!_achCurrentCat || catOrder.indexOf(_achCurrentCat) < 0) _achCurrentCat = catOrder[0];
    _renderAchTab(_achCurrentCat);
  }).catch(function() {
    body.innerHTML = '<div class="chart-empty">서버 연결 실패</div>';
  });
}

function _switchAchTab(cat) {
  _achCurrentCat = cat;
  document.querySelectorAll('.ach-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  _renderAchTab(cat);
}

function _renderAchTab(cat) {
  var body = document.getElementById('chartBody');
  if (!body || !_achData) return;
  var defs = _achData.achievementDefs || [];
  var cats = _achData.categories || {};
  var items = defs.filter(function(a) { return a.cat === cat; });
  var label = cats[cat] || cat;
  var catDone = items.filter(function(a) { return a.unlocked; }).length;
  var html = '<div class="ach-section-header">' + esc(label) + ' <span class="ach-section-count">' + catDone + '/' + items.length + '</span></div>';
  html += '<div class="ach-grid">';
  items.forEach(function(a) {
    html += '<div class="ach-card' + (a.unlocked ? ' unlocked' : '') + '">' +
      '<div class="ach-icon">' + (a.unlocked ? '✓' : '·') + '</div>' +
      '<div class="ach-info">' +
        '<div class="ach-name">' + esc(a.name) + '</div>' +
        '<div class="ach-desc">' + esc(a.desc) + '</div>' +
        '<div class="ach-reward">+' + esc(String(a.reward)) + 'P</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  body.innerHTML = html;
}
