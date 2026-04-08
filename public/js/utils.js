// 순수 헬퍼 함수 — 다른 모듈에서 호출
// 로드 순서: 3번째 (constants, state 이후)
// 일부 함수는 state (currentTheme)를 read-only로 참조

// HTML escape (XSS 방어)
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// 16진수 색상 명암 조절 (+50: 밝게, -50: 어둡게)
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.min(255, Math.max(0, (n >> 16) + amt));
  var g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  var b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// 에이전트 ID → 색상 매핑 (AGENT_COLORS 상수 사용)
function agColor(id, idx) {
  return AGENT_COLORS[id] || AGENT_COLORS._default[(idx || 0) % AGENT_COLORS._default.length];
}

// 라이브 인스턴스 key 생성 (sessionPid + agentId)
function instKey(sp, ai) {
  return sp + '_' + ai;
}

// === Village Tier 자동 감지/적용 ===
// 워크스페이스 폭에 따라 currentVillageTier 결정 + .tier-N 클래스 부착
// CSS 변수 --char-size가 .workspace.tier-N으로 캐릭터 크기를 자동 적용
function detectVillageTier() {
  var ws = document.querySelector('.workspace');
  var w = ws ? ws.offsetWidth : window.innerWidth;
  return pickVillageTier(w);
}

function _applyTierClass(tierNum) {
  var ws = document.querySelector('.workspace');
  if (ws) {
    ws.classList.remove('tier-1', 'tier-2', 'tier-3');
    ws.classList.add('tier-' + tierNum);
  }
  currentVillageTier = tierNum;
  // tier 변경 시 캐릭터 활동 범위 캐시도 무효화 (--char-size 바뀌므로)
  // creature.js가 utils.js 이후 로드되므로 typeof 가드 필요
  if (typeof invalidateWsBoxCache === 'function') invalidateWsBoxCache();
}

// 페이지 로드 시 1회 + resize 시 디바운스 200ms
// village 활성화는 enableVillage() 단일 진입
var _tierResizeTimer = null;
function initVillageTier() {
  _applyTierClass(detectVillageTier());
  if (typeof enableVillage === 'function') enableVillage();
  window.addEventListener('resize', function() {
    if (_tierResizeTimer) clearTimeout(_tierResizeTimer);
    _tierResizeTimer = setTimeout(function() {
      var next = detectVillageTier();
      if (next !== currentVillageTier) _applyTierClass(next);
      // resize 시 별 레이어 폭/높이 갱신 (ensureStarsLayer 캐시 mismatch → 재생성)
      if (typeof renderVillage === 'function') renderVillage();
    }, 200);
  });
}

// 에이전트 픽셀아트 캐릭터 DOM 생성 (PMAPS 상수 + currentTheme 상태 참조)
function buildPix(id, color, size, model) {
  var map = (PMAPS[id] || PMAPS._default).map(function(row) { return row.slice(); });
  // 모델별 머리 변형 (master는 이미 왕관이므로 제외)
  if (id !== 'master' && model) {
    var headMod = PMAPS['_' + model];
    if (headMod) {
      map[0] = headMod[0].slice();
      map[1] = headMod[1].slice();
    }
  }
  var el = document.createElement('div');
  el.className = size === 'lg' ? 'pix-lg' : 'pix';
  var dark = shade(color, -50);
  var skin = '#ffe0bd';
  var eye = currentTheme === 'dark' ? '#080810' : '#1a1a1a';
  var gold = '#fbbf24';
  el.dataset.color = color;
  el.dataset.dark = dark;
  for (var y = 0; y < 8; y++) {
    for (var x = 0; x < 7; x++) {
      var c = document.createElement('i');
      var v = map[y][x];
      c.style.background = v === 1 ? color
        : v === 2 ? dark
        : v === 3 ? skin
        : v === 4 ? eye
        : v === 5 ? gold
        : 'transparent';
      if (v === 4) c.dataset.eye = '1';
      el.appendChild(c);
    }
  }
  return el;
}

// === 즉시 뜨는 글로벌 툴팁 (data-tip 속성) ===
// HTML title 속성의 OS 기본 1~2초 지연을 회피하기 위한 통합 시스템.
// 사용법: <button data-tip="설명">버튼</button>
//        또는 동적: el.dataset.tip = '설명'; (JS)
// fixed position이라 부모 overflow에 잘리지 않고, viewport 경계 자동 보정.
(function initGlobalTip() {
  var tipEl = null;
  // 마지막 target 캐싱 — 같은 target에서 mouseover가 반복 발생해도 reflow 방지
  var _lastTarget = null;
  function ensureTip() {
    if (tipEl && document.body && document.body.contains(tipEl)) return tipEl;
    if (!document.body) return null;
    tipEl = document.createElement('div');
    tipEl.id = 'global-tip';
    tipEl.style.cssText = 'position:fixed;top:0;left:0;background:var(--surface,#111120);' +
      'border:1px solid var(--accent2,#a78bfa);color:var(--text,#d0ffd0);' +
      'padding:4px 8px;border-radius:4px;font-size:.5rem;font-family:monospace;' +
      'white-space:nowrap;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.5);' +
      'pointer-events:none;opacity:0;transition:opacity .12s ease;max-width:90vw;' +
      'overflow:hidden;text-overflow:ellipsis;';
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function findTipTarget(node) {
    while (node && node.nodeType === 1) {
      if (node.hasAttribute && node.hasAttribute('data-tip')) return node;
      node = node.parentNode;
    }
    return null;
  }
  function showTip(target) {
    var text = target.getAttribute('data-tip');
    if (!text) return;
    var el = ensureTip();
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    // textContent 후 측정 (실제 크기로 보정)
    var tipRect = el.getBoundingClientRect();
    var rect = target.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    // 기본: 아래쪽 가운데
    var top = rect.bottom + 6;
    var left = rect.left + (rect.width - tipRect.width) / 2;
    // 좌우 viewport 보정
    if (left + tipRect.width > vw - 8) left = vw - tipRect.width - 8;
    if (left < 8) left = 8;
    // 아래로 넘치면 위쪽으로
    if (top + tipRect.height > vh - 8) top = rect.top - tipRect.height - 6;
    if (top < 8) top = 8;
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }
  function hideTip() {
    // 이미 숨겨진 상태면 no-op (scroll capture 등 빈번 이벤트에서 불필요한 style 할당 방지)
    if (!tipEl || tipEl.style.opacity === '0') { _lastTarget = null; return; }
    tipEl.style.opacity = '0';
    _lastTarget = null;
  }
  // 외부에서 명시 호출 가능 (DOM 재생성 전에 호출하면 detached node 툴팁 박제 방지)
  window.hideGlobalTip = hideTip;
  document.addEventListener('mouseover', function(e) {
    // safety net: 이전 target이 DOM에서 떨어졌으면 툴팁 정리
    if (_lastTarget && !document.body.contains(_lastTarget)) hideTip();
    var t = findTipTarget(e.target);
    if (!t) return;
    if (t === _lastTarget) return; // 동일 target 반복 → skip
    _lastTarget = t;
    showTip(t);
  }, true);
  document.addEventListener('mouseout', function(e) {
    var t = findTipTarget(e.target);
    if (!t) return;
    // 자식 → 부모 등 같은 target 안 이동은 무시
    var related = e.relatedTarget;
    if (related && t.contains(related)) return;
    hideTip();
  }, true);
  // 스크롤/리사이즈 시 위치 어긋남 방지 → 숨김
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', hideTip);
})();
