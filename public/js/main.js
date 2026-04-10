// 애플리케이션 부트스트랩
// - Theme 적용/전환
// - renderAll 디바운스 디스패처 (모든 render* 함수 호출)
// - Logo 픽셀아트 IIFE
// - 초기 fetch 호출 + SSE 연결
// - Page Visibility 이벤트 (애니메이션 일시정지/재개)
// - 게임화 버프 (window.gameBuffs) 초기화 + 프리뷰 모드 훅
// 로드 순서: **마지막** (모든 파일 이후)
// 의존: 전체 (renderList/Workspace/Activity/Timeline/Logs + init*, fetch*)

// === 게임화 버프 초기화 (Phase 1: 프리뷰 모드 전용) ===
// Phase 2에서 points.js가 실제 포인트 데이터로 window.gameBuffs를 갱신함
// URL 파라미터 ?preview=full/mid/empty → 가상 인벤토리로 computeBuffs
// ?preview 없으면 빈 우주 (모두 해금 안 됨)
(function initGameBuffs() {
  var preview = null;
  try {
    preview = new URLSearchParams(location.search).get('preview');
  } catch (e) {}
  var inventory = (typeof buildPreviewInventory === 'function') ? buildPreviewInventory(preview) : {};
  window.gameBuffs = (typeof computeBuffs === 'function') ? computeBuffs(inventory) : {};
  window.gamePreviewMode = preview;
  if (preview) {
    console.log('[agent-viz] Preview mode:', preview, 'buffs:', window.gameBuffs);
  }
})();

// === Theme ===
function applyTheme(t) {
  document.documentElement.className = 'theme-' + t;
  currentTheme = t;
  localStorage.setItem('viz-theme', t);
  var btn = document.getElementById('themeBtn');
  btn.textContent = (t === 'dark' ? '🌙' : '☀️');
  btn.dataset.tip = (t === 'dark' ? 'Dark' : 'Light');
}

function cycleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  renderAll();
}

applyTheme(currentTheme);

// === renderAll ===
var _renderTimer = null;

function renderAll() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(function() {
    _renderTimer = null;
    try {
      renderList();
      renderWorkspace();
      renderActivity();
      renderTimeline();
      renderLogs();
      updateHeaderStat();
      renderSessionTabs();
      // renderVillage는 여기서 호출하지 않음 — buffs 변경(구매/초기화) 시에만 points.js에서 호출
      // renderAll이 SSE 이벤트마다 불리는데, 매번 stars layer를 삭제→재생성하면
      // CSS 애니메이션이 초기화되어 "깜빡이는" 현상 발생
    } catch (e) {
      console.error('[agent-viz] renderAll error:', e);
    }
  }, 50);
}

// === Logo ===
(function() {
  var el = document.getElementById('logo');
  var c = ['#00ffc8', '#a78bfa', '#fbbf24', '#00d4ff', '#f472b6', '#10b981', '#fb923c'];
  var p = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
  for (var i = 0; i < 25; i++) {
    var s = document.createElement('i');
    s.style.background = p[i] ? c[i % c.length] : 'transparent';
    s.style.borderRadius = '1px';
    el.appendChild(s);
  }
})();

// === Init ===
initCreatureSystem();      // creature.js
initNotifBtn();            // notifications.js
initVillageTier();         // utils.js — 마을 Tier 자동 감지 + village 활성화
if (typeof startEventTicks === 'function' && !document.hidden) startEventTicks();  // 게임화 이벤트 틱
// 게임화 포인트 초기 로드 — 프리뷰 모드가 아닐 때만 서버에서 실제 상태 가져옴
if (typeof fetchPoints === 'function' && !window.gamePreviewMode) fetchPoints();
if (typeof renderPointsBadge === 'function') renderPointsBadge();  // 프리뷰 모드에서도 배지는 표시
fetchMaster(); fetchSessions(); fetchMcpServers(); fetchHooks(); fetchDailyStats();

// inactive 상태 주기적 갱신 (60초마다 세션 탭 re-render)
setInterval(function() { if (Object.keys(sessions).length > 0) renderSessionTabs() }, 60000);

// fetchAgents 완료 후 SSE 연결 (에이전트 목록 없이 이벤트 수신 시 캐릭터 누락 방지)
fetch(API + '/api/agents').then(function(r) { return r.json() }).then(function(data) {
  agents = data.map(function(a, i) { a.color = agColor(a.id, i); a.active = true; return a });
  setConn(true); _wsBuilt = false; renderAll();
  var cwd = (currentSession && sessions[currentSession]) ? sessions[currentSession].cwd : '';
  if (cwd) fetchProjectAgents(cwd);
  // village도 agents 로드 후 다시 렌더 (init 시점엔 빈 배열이라 안 보임)
  if (typeof renderVillage === 'function') renderVillage();
}).catch(function() { setConn(false) }).finally(function() { connectSSE() });

// === Page Visibility: 탭 비활성 시 애니메이션 일시정지 ===
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // 탭 비활성: 모든 타이머/setTimeout 정지 (CLAUDE.md 강제 규칙)
    stopBlinkInterval();
    stopWalkInterval();
    if (typeof stopShootingStars === 'function') stopShootingStars();
    if (typeof stopEventTicks === 'function') stopEventTicks();
  } else {
    // 탭 활성: 재개
    startBlinkInterval();
    startWalkInterval();
    if (typeof startShootingStars === 'function') startShootingStars();
    if (typeof startEventTicks === 'function') startEventTicks();
    renderAll();
  }
});
