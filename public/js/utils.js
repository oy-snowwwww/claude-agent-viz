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

// 워크스페이스 픽셀아트 "집" DOM 생성
function buildHouse() {
  var t = 'transparent', r = '#8B4513', w = '#D2B48C', d = '#654321', wi = '#87CEEB', g = '#228B22';
  var houseMap = [
    [t,t,t,t,r,t,t,t,t],
    [t,t,t,r,r,r,t,t,t],
    [t,t,r,r,r,r,r,t,t],
    [t,r,r,r,r,r,r,r,t],
    [w,w,w,w,w,w,w,w,w],
    [w,wi,w,w,d,w,w,wi,w],
    [w,wi,w,w,d,w,w,wi,w],
    [w,w,w,w,d,w,w,w,w],
    [g,g,g,g,g,g,g,g,g],
  ];
  var el = document.createElement('div');
  el.className = 'ws-house';
  el.id = 'ws-house';
  var body = document.createElement('div');
  body.className = 'ws-house-body';
  houseMap.forEach(function(row) {
    row.forEach(function(c) {
      var cell = document.createElement('i');
      cell.style.background = c;
      body.appendChild(cell);
    });
  });
  el.appendChild(body);
  // 굴뚝 연기
  var smoke = document.createElement('div');
  smoke.className = 'ws-house-smoke';
  for (var s = 0; s < 3; s++) {
    var sp = document.createElement('span');
    sp.style.animationDelay = (s * 1) + 's';
    smoke.appendChild(sp);
  }
  el.appendChild(smoke);
  return el;
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
