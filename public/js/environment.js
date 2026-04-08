// ⚠️ DEPRECATED (village 모드 전환 후 inactive) ⚠️
// 이 파일의 모든 함수(initEnvironment, toggleEnv, cycleSeason, updateEnvironment,
// startWeather, startSparkles, seasonCycleCheck, createSpaceBackground 등)는
// 현재 어떤 진입점에서도 호출되지 않습니다.
//   - index.html의 initEnvironment() 호출은 주석 처리됨 (village 모드가 대체)
//   - 헤더의 envBtn/seasonBtn이 제거되어 toggleEnv/cycleSeason의 onclick 진입점 없음
//   - _envEnabled는 하드코딩 false로 고정되어 있어 visibilitychange 재개 분기도 no-op
// 삭제 대신 보존하는 이유:
//   - 향후 테마/모드 확장 시 재사용 후보 (계절별 배경·날씨 렌더링 자산)
//   - 외부 기여자가 계절/날씨 패턴을 참고할 수 있음
// 수정 금지 권장. 새 기능은 village.js에 추가하세요.
//
// ─────────────────────────────────────────────────────────────
// (원본 주석) 환경 효과 — 낮/밤 사이클, 4계절, 날씨 파티클, 우주 배경
// 로드 순서: utils.js 이후, 인라인 메인 이전

// === 상수 ===
var SEASONS = ['spring','summer','autumn','winter'];
var SEASON_LABELS = {spring:'🌸',summer:'☀️',autumn:'🍂',winter:'❄️'};
var SEASON_TITLES = {spring:'봄',summer:'여름',autumn:'가을',winter:'겨울'};
var DAY_CYCLE_MS = 60000; // 1분 = 하루

var SEASON_PALETTE = {
  spring: {
    sky:['#87CEEB','#B0E0FF','#FFB347','#2C3E6B'],
    ground:['#90EE90','#7BC77B','#6B8E5A','#2D4A2D'],
    stars:[false,false,false,true]
  },
  summer: {
    sky:['#87CEEB','#B0E0FF','#FFB347','#2C3E6B'],
    ground:['#90EE90','#7BC77B','#6B8E5A','#2D4A2D'],
    stars:[false,false,false,true]
  },
  autumn: {
    sky:['#C9A96E','#E8C07A','#D4634B','#2B2142'],
    ground:['#CD853F','#B8860B','#8B4513','#3D2B1F'],
    stars:[false,false,false,true]
  },
  winter: {
    sky:['#B0C4DE','#D6E8F0','#9B8EC4','#1C2333'],
    ground:['#F0F8FF','#E8E8E8','#C0C0C0','#4A4A5A'],
    stars:[false,false,true,true]
  }
};

// === 상태 (전역) ===
var currentSeason = SEASONS[Math.floor(Math.random() * SEASONS.length)];
var _dayOffset = Math.random() * DAY_CYCLE_MS;
var _lastSeasonCycle = Math.floor((Date.now() + _dayOffset) / DAY_CYCLE_MS);
// village 모드 전환 후 환경 효과는 더 이상 사용하지 않음.
// 이전 버전에서 'on'으로 저장된 잔존 키를 1회 마이그레이션으로 제거해
// visibilitychange 재개 분기(index.html)가 인터벌을 재시작하지 않도록 강제 false 고정.
var _envEnabled = false;
try { localStorage.removeItem('agviz-env'); } catch(e) {}
var _envInterval = null;
var _seasonInterval = null;
var _weatherInterval = null;
var _sparkleInterval = null;

// === 시간 유틸 ===
// 0~1 범위의 하루 시간 (0=새벽, 0.25=아침, 0.5=낮, 0.75=저녁, 1=밤)
function getDayPhase() {
  return ((Date.now() + _dayOffset) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
}

function lerpColor(a, b, t) {
  var ar = parseInt(a.slice(1,3), 16), ag = parseInt(a.slice(3,5), 16), ab = parseInt(a.slice(5,7), 16);
  var br = parseInt(b.slice(1,3), 16), bg = parseInt(b.slice(3,5), 16), bb = parseInt(b.slice(5,7), 16);
  var r = Math.round(ar + (br - ar) * t);
  var g = Math.round(ag + (bg - ag) * t);
  var bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

// === 환경 업데이트 (8초 주기) ===
function updateEnvironment() { try {
  var ws = document.getElementById('workspace'); if (!ws) return;
  var phase = getDayPhase();
  var p = SEASON_PALETTE[currentSeason];
  var idx = Math.min(3, Math.floor(phase * 4));
  var nextIdx = Math.min(3, idx + 1);
  var localT = (phase * 4) % 1;
  var skyColor = lerpColor(p.sky[idx], p.sky[nextIdx], localT);
  var groundColor = lerpColor(p.ground[idx], p.ground[nextIdx], localT);
  var showStars = phase > 0.7;

  ws.style.background = 'linear-gradient(180deg,' + skyColor + ' 0%,' + lerpColor(skyColor, groundColor, 0.3) + ' 80%,' + groundColor + ' 100%)';
  ws.style.setProperty('--ground-color', groundColor);

  // 별
  var starsEl = ws.querySelector('.ws-stars');
  if (showStars) {
    if (!starsEl) {
      starsEl = document.createElement('div'); starsEl.className = 'ws-stars';
      starsEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0';
      var dots = '';
      for (var s = 0; s < 20; s++) {
        var sx = Math.random() * 100, sy = Math.random() * 60, ss = 1 + Math.random() * 2;
        dots += '<span style="position:absolute;left:' + sx + '%;top:' + sy + '%;width:' + ss + 'px;height:' + ss + 'px;background:white;border-radius:50%;opacity:' + (0.3 + Math.random() * 0.5) + ';animation:twinkle ' + (2 + Math.random() * 3) + 's ease-in-out infinite alternate"></span>';
      }
      starsEl.innerHTML = dots;
      ws.insertBefore(starsEl, ws.firstChild);
    }
    starsEl.style.opacity = Math.min(1, (phase - 0.7) / 0.15);
  } else { if (starsEl) starsEl.style.opacity = '0'; }

  // 태양
  var sun = ws.querySelector('.ws-sun');
  if (!sun) { sun = document.createElement('div'); sun.className = 'ws-celestial ws-sun'; sun._visible = false; ws.insertBefore(sun, ws.firstChild); }
  sun.textContent = '☀️'; sun.style.fontSize = '48px';
  var sunVisible = phase > 0.05 && phase < 0.6;
  var sunPhase = Math.max(0, Math.min(1, (phase - 0.05) / 0.55));
  var sunX = 5 + sunPhase * 90;
  var sunY = 45 - Math.sin(sunPhase * Math.PI) * 42;
  if (sunVisible && !sun._visible) { sun.style.transition = 'none'; sun.style.left = sunX + '%'; sun.style.top = Math.max(2, sunY) + '%'; sun.offsetHeight; sun.style.transition = ''; }
  else { sun.style.left = sunX + '%'; sun.style.top = Math.max(2, sunY) + '%'; }
  sun.style.opacity = sunVisible ? Math.min(1, Math.min((phase - 0.05) / 0.05, (0.6 - phase) / 0.05)) : '0';
  sun.style.filter = 'drop-shadow(0 0 16px rgba(255,200,50,.7))';
  sun._visible = sunVisible;

  // 달
  var moon = ws.querySelector('.ws-moon');
  if (!moon) { moon = document.createElement('div'); moon.className = 'ws-celestial ws-moon'; moon._visible = false; ws.insertBefore(moon, ws.firstChild); }
  moon.textContent = '🌙'; moon.style.fontSize = '40px';
  var moonVisible = phase > 0.65 && phase < 0.95;
  var moonPhase = Math.max(0, Math.min(1, (phase - 0.65) / 0.3));
  var moonX = 10 + moonPhase * 80;
  var moonY = 40 - Math.sin(moonPhase * Math.PI) * 35;
  if (moonVisible && !moon._visible) { moon.style.transition = 'none'; moon.style.left = moonX + '%'; moon.style.top = Math.max(3, moonY) + '%'; moon.offsetHeight; moon.style.transition = ''; }
  else { moon.style.left = moonX + '%'; moon.style.top = Math.max(3, moonY) + '%'; }
  moon.style.opacity = moonVisible ? Math.min(1, Math.min((phase - 0.65) / 0.05, (0.95 - phase) / 0.05)) : '0';
  moon.style.filter = 'drop-shadow(0 0 14px rgba(200,200,255,.7))';
  moon._visible = moonVisible;

  // 구름
  if (!ws._cloudInterval) {
    function spawnCloud(startX) {
      var ws2 = document.getElementById('workspace'); if (!ws2) return;
      if (ws2.querySelectorAll('.ws-cloud').length >= 4) return;
      var cloud = document.createElement('div'); cloud.className = 'ws-cloud';
      cloud.textContent = '☁️';
      cloud.style.fontSize = (36 + Math.random() * 40) + 'px';
      cloud.style.top = (2 + Math.random() * 22) + '%';
      cloud.style.opacity = (0.25 + Math.random() * 0.35);
      var fromX = startX !== undefined ? startX : -15;
      var totalDist = 110 - fromX;
      var speed = 1.5 + Math.random() * 1;
      var duration = totalDist / speed;
      cloud.style.left = fromX + '%';
      cloud.style.transition = 'left ' + duration + 's linear';
      ws2.insertBefore(cloud, ws2.firstChild);
      setTimeout(function() { cloud.style.left = '110%'; }, 50);
      setTimeout(function() { cloud.remove(); }, (duration + 1) * 1000);
    }
    for (var ci = 0; ci < 4; ci++) spawnCloud(Math.random() * 80);
    ws._cloudInterval = setInterval(function() { spawnCloud(); }, 10000 + Math.random() * 8000);
  }

  // 나무 (계절 변경 시 갱신)
  var treeKey = 'tree-' + currentSeason;
  if (!ws.dataset.treeKey || ws.dataset.treeKey !== treeKey) {
    ws.dataset.treeKey = treeKey;
    ws.querySelectorAll('.ws-tree').forEach(function(t) { t.remove(); });
    var TREES = {spring:['🌸','🌳','🌿'], summer:['🌳','🌴','🌿'], autumn:['🍁','🌳','🍂'], winter:['🌲','❄️🌲','🌲']};
    var treePositions = [{x:3,s:28},{x:12,s:22},{x:22,s:18},{x:78,s:20},{x:88,s:26},{x:96,s:22}];
    var treesArr = TREES[currentSeason];
    treePositions.forEach(function(tp, ti) {
      var tree = document.createElement('span'); tree.className = 'ws-tree';
      tree.style.cssText = 'position:absolute;bottom:8%;left:' + tp.x + '%;font-size:' + tp.s + 'px;z-index:1;pointer-events:none;opacity:.85';
      tree.textContent = treesArr[ti % treesArr.length];
      ws.appendChild(tree);
    });
  }

  // 땅 디테일 (계절 변경 시 갱신)
  var gdKey = 'gd-' + currentSeason;
  if (!ws.dataset.groundDetail || ws.dataset.groundDetail !== gdKey) {
    ws.dataset.groundDetail = gdKey;
    ws.querySelectorAll('.ws-ground-detail').forEach(function(g) { g.remove(); });
    var GROUND_ITEMS = {
      spring: {items:['🌷','🌼','🌸','🌻','🦋','💐'], count:8},
      summer: {items:['🌿','🌾','🌺','🌻','🐞','☘️'], count:8},
      autumn: {items:['🍄','🌰','🍂','🍁','🎃','🦔'], count:8},
      winter: {items:['⛄','❄️','🎄','🏔️','☃️','🌨️'], count:8}
    };
    var seasonCfg = GROUND_ITEMS[currentSeason];
    for (var gi = 0; gi < seasonCfg.count; gi++) {
      var gd = document.createElement('span'); gd.className = 'ws-ground-detail';
      gd.textContent = seasonCfg.items[Math.floor(Math.random() * seasonCfg.items.length)];
      gd.style.left = (3 + Math.random() * 90) + '%';
      gd.style.bottom = (0 + Math.random() * 8) + '%';
      gd.style.fontSize = (10 + Math.random() * 8) + 'px';
      ws.appendChild(gd);
    }
  }

  // 반딧불 (여름 밤) — isNight는 기존 코드와 동일 (원본 버그 유지)
  var fireflyEl = ws.querySelector('.ws-fireflies');
  if (currentSeason === 'summer' && typeof isNight !== 'undefined' && isNight) {
    if (!fireflyEl) {
      fireflyEl = document.createElement('div'); fireflyEl.className = 'ws-fireflies';
      fireflyEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
      for (var fi = 0; fi < 15; fi++) {
        var ff = document.createElement('span');
        var fSize = 2 + Math.random() * 3;
        ff.style.cssText = 'position:absolute;width:' + fSize + 'px;height:' + fSize + 'px;border-radius:50%;background:#ADFF2F;box-shadow:0 0 8px #ADFF2F,0 0 16px #7FFF00;animation:fireflyFloat ' + (2 + Math.random() * 5) + 's ease-in-out infinite alternate;left:' + (5 + Math.random() * 90) + '%;top:' + (25 + Math.random() * 60) + '%;animation-delay:' + (Math.random() * 6) + 's';
        fireflyEl.appendChild(ff);
      }
      ws.appendChild(fireflyEl);
    }
    fireflyEl.style.opacity = '1';
  } else { if (fireflyEl) fireflyEl.style.opacity = '0'; }

} catch(e) { console.error('[agent-viz] updateEnvironment error:', e); } }

// === 계절 자동 순환 ===
function seasonCycleCheck() {
  var currentCycle = Math.floor((Date.now() + _dayOffset) / DAY_CYCLE_MS);
  if (currentCycle !== _lastSeasonCycle) {
    _lastSeasonCycle = currentCycle;
    var idx = SEASONS.indexOf(currentSeason);
    currentSeason = SEASONS[(idx + 1) % SEASONS.length];
    var _sb = document.getElementById('seasonBtn');
    if (_sb) {
      _sb.textContent = SEASON_LABELS[currentSeason];
      _sb.dataset.tip = SEASON_TITLES[currentSeason];
    }
    var ws = document.getElementById('workspace');
    if (ws) {
      ws.dataset.groundDetail = '';
      ws.dataset.treeKey = '';
      ws.querySelectorAll('.ws-fireflies').forEach(function(f) { f.remove(); });
    }
    updateEnvironment(); startWeather(); startSparkles();
    _wsBuilt = false; renderAll();
  }
}

// === 날씨 파티클 ===
function startWeather() {
  if (_weatherInterval) clearInterval(_weatherInterval);
  var ws = document.getElementById('workspace'); if (!ws) return;
  ws.querySelectorAll('.weather-particle').forEach(function(p) { p.remove(); });

  var config = {
    spring: {type:'petal', interval:500, duration:4000},
    summer: {type:'petal', interval:600, duration:4000},
    autumn: {type:'leaf',  interval:700, duration:5000},
    winter: {type:'snow',  interval:400, duration:6000}
  }[currentSeason];

  _weatherInterval = setInterval(function() {
    var p = document.createElement('span'); p.className = 'weather-particle ' + config.type;
    p.style.left = Math.random() * 100 + '%'; p.style.top = '-5px';
    if (config.type === 'rain') {
      p.style.height = (8 + Math.random() * 12) + 'px';
      p.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
    } else if (config.type === 'snow') {
      var sz = 2 + Math.random() * 4; p.style.width = sz + 'px'; p.style.height = sz + 'px';
      p.style.animationDuration = (3 + Math.random() * 4) + 's';
    } else if (config.type === 'leaf') {
      var leaves = ['🍂','🍁','🍃']; p.textContent = leaves[Math.floor(Math.random() * leaves.length)];
      p.style.animationDuration = (4 + Math.random() * 3) + 's';
    } else if (config.type === 'petal') {
      p.style.animationDuration = (3 + Math.random() * 3) + 's';
      if (Math.random() > 0.7) { p.style.background = 'rgba(255,255,255,.6)'; }
    }
    ws.appendChild(p);
    setTimeout(function() { p.remove(); }, config.duration);
  }, config.interval);
}

// === 반짝이 파티클 (밤에만) ===
function startSparkles() {
  if (_sparkleInterval) clearInterval(_sparkleInterval);
  var ws = document.getElementById('workspace'); if (!ws) return;
  var SPARKLE_COLORS = {
    spring:['#FFB7C5','#FFF0F5','#FFD700'],
    summer:['#FFD700','#FFF8DC','#FFFFFF'],
    autumn:['#FFD700','#FFA500','#DEB887'],
    winter:['#FFFFFF','#E0FFFF','#B0E0E6']
  };
  _sparkleInterval = setInterval(function() {
    var phase = getDayPhase();
    if (phase < 0.6) return;
    var colors = SPARKLE_COLORS[currentSeason];
    var sp = document.createElement('span'); sp.className = 'sparkle-fall';
    sp.style.left = Math.random() * 100 + '%'; sp.style.top = '0';
    var dot = document.createElement('span');
    dot.style.background = colors[Math.floor(Math.random() * colors.length)];
    var sz = 1 + Math.random() * 2; dot.style.width = sz + 'px'; dot.style.height = sz + 'px';
    dot.style.boxShadow = '0 0 4px ' + dot.style.background;
    dot.style.animationDuration = (5 + Math.random() * 4) + 's';
    sp.appendChild(dot); ws.appendChild(sp);
    setTimeout(function() { sp.remove(); }, 9000);
  }, 500);
}

// === 우주 배경 (환경 효과 OFF 시) ===
function createSpaceBackground(ws) {
  ws.style.background = 'linear-gradient(180deg,#050510 0%,#0a0a20 40%,#12123a 70%,#1a1a45 100%)';
  ws.querySelectorAll('.ws-stars').forEach(function(e) { e.remove(); });
  var starsEl = document.createElement('div'); starsEl.className = 'ws-stars';
  starsEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0';
  var dots = '';
  var starColors = ['#ffffff','#ffe8d0','#d0e8ff','#fffde0','#e0d0ff'];
  for (var s = 0; s < 60; s++) {
    var sx = Math.random() * 100, sy = Math.random() * 100, ss = 0.5 + Math.random() * 1.5;
    var sc = starColors[Math.floor(Math.random() * starColors.length)];
    dots += '<span style="position:absolute;left:' + sx + '%;top:' + sy + '%;width:' + ss + 'px;height:' + ss + 'px;background:' + sc + ';border-radius:50%;animation:twinkle ' + (2 + Math.random() * 4) + 's ease-in-out infinite;animation-delay:' + (Math.random() * 5) + 's"></span>';
  }
  for (var b = 0; b < 12; b++) {
    var bx = Math.random() * 100, by = Math.random() * 100, bs = 1.5 + Math.random() * 2;
    var bc = starColors[Math.floor(Math.random() * starColors.length)];
    dots += '<span style="position:absolute;left:' + bx + '%;top:' + by + '%;width:' + bs + 'px;height:' + bs + 'px;background:' + bc + ';border-radius:50%;box-shadow:0 0 ' + (2 + Math.random() * 4) + 'px ' + bc + ';animation:twinkleBright ' + (1.5 + Math.random() * 3) + 's ease-in-out infinite;animation-delay:' + (Math.random() * 4) + 's"></span>';
  }
  starsEl.innerHTML = dots;
  ws.insertBefore(starsEl, ws.firstChild);
}

// === 토글 함수 (onclick에서 호출) ===
function toggleEnv() {
  _envEnabled = !_envEnabled;
  localStorage.setItem('agviz-env', _envEnabled ? 'on' : 'off');
  var ws = document.getElementById('workspace');
  var btn = document.getElementById('envBtn');
  if (!btn) return; // 헤더에서 제거된 경우 noop
  if (_envEnabled) {
    btn.textContent = '🌍';
    if (ws) ws.querySelectorAll('.ws-stars').forEach(function(e) { e.remove(); });
    updateEnvironment(); startWeather(); startSparkles();
    if (!_envInterval) _envInterval = setInterval(updateEnvironment, 8000);
    if (!_seasonInterval) _seasonInterval = setInterval(seasonCycleCheck, 3000);
  } else {
    btn.textContent = '✨';
    if (_weatherInterval) { clearInterval(_weatherInterval); _weatherInterval = null; }
    if (_sparkleInterval) { clearInterval(_sparkleInterval); _sparkleInterval = null; }
    if (_envInterval) { clearInterval(_envInterval); _envInterval = null; }
    if (_seasonInterval) { clearInterval(_seasonInterval); _seasonInterval = null; }
    if (ws) {
      ws.querySelectorAll('.weather-particle,.sparkle-fall,.ws-cloud,.ws-sun,.ws-moon,.ws-stars,.ws-tree,.ws-ground-detail,.ws-fireflies').forEach(function(e) { e.remove(); });
      if (ws._cloudInterval) { clearInterval(ws._cloudInterval); ws._cloudInterval = null; }
      ws.dataset.groundDetail = ''; ws.dataset.treeKey = '';
      createSpaceBackground(ws);
    }
  }
}

function cycleSeason() {
  if (!_envEnabled) { toast('환경 효과를 먼저 켜주세요'); return; }
  var idx = SEASONS.indexOf(currentSeason);
  currentSeason = SEASONS[(idx + 1) % SEASONS.length];
  localStorage.setItem('agviz-season', currentSeason);
  var _sb2 = document.getElementById('seasonBtn');
  if (_sb2) {
    _sb2.textContent = SEASON_LABELS[currentSeason];
    _sb2.dataset.tip = SEASON_TITLES[currentSeason];
  }
  var ws = document.getElementById('workspace');
  if (ws) {
    ws.dataset.groundDetail = '';
    ws.dataset.treeKey = '';
    ws.querySelectorAll('.ws-fireflies').forEach(function(f) { f.remove(); });
  }
  updateEnvironment(); startWeather(); startSparkles();
  _wsBuilt = false; renderAll();
}

// === 초기화 ===
// 인라인 Init 섹션에서 호출 (DOM + toast + renderAll 등 의존성 때문)
function initEnvironment() {
  // 헤더에서 envBtn/seasonBtn이 제거되었을 수 있어 null-safe 처리
  var _sb3 = document.getElementById('seasonBtn');
  if (_sb3) {
    _sb3.textContent = SEASON_LABELS[currentSeason];
    _sb3.dataset.tip = SEASON_TITLES[currentSeason];
  }
  if (_envEnabled) {
    updateEnvironment();
    startWeather();
    startSparkles();
    _envInterval = setInterval(updateEnvironment, 8000);
    _seasonInterval = setInterval(seasonCycleCheck, 3000);
  } else {
    var _envBtnEl = document.getElementById('envBtn');
    if (_envBtnEl) _envBtnEl.textContent = '✨';
    var ws0 = document.getElementById('workspace');
    if (ws0) createSpaceBackground(ws0);
  }
}
