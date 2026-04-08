// 이벤트 아이템 마스터 틱 (주기적 발동형 이펙트)
// 로드 순서: animations 이후, main 이전
// 의존: village.js(spawnShootingStar), workspace.js, utils.js
//
// === 구조 ===
// - Single master setInterval(1000) — 11개 이벤트의 경과 시간을 초 단위로 체크
// - window.gameBuffs.event* > 0 인 이벤트만 활성 판정
// - 각 이벤트는 "발동 주기" 내에 1번 발동 → CSS class 부착 → timeout으로 제거
// - visibilitychange hidden 시 마스터 틱 정지 (main.js의 visibilitychange 핸들러에서 호출)
// - DOM 상한 가드 — 200개 초과 시 파티클 생성 skip

var _eventTickInterval = null;
var _eventLastFired = {};  // { eventKey: timestamp } — 마지막 발동 시각
var _eventPartTimers = []; // 이벤트 내 보조 setTimeout 핸들 (stop 시 일괄 정리)

// 이벤트 스펙: [buffKey, intervalMs, fireFn]
// fireFn은 layer(DOM)와 시간 정보를 받아서 발동
var EVENT_SPECS = [
  { key: 'eventHeartbeat',    interval: 15000,  fire: fireHeartbeat },
  { key: 'eventBooster',      interval: 30000,  fire: fireBooster },
  { key: 'eventAmbientBurst', interval: 30000,  fire: fireAmbientBurst },
  { key: 'eventNebulaBloom',  interval: 30000,  fire: fireNebulaBloom },
  { key: 'eventGalaxyFlash',  interval: 45000,  fire: fireGalaxyFlash },
  { key: 'eventMeteorRush',   interval: 60000,  fire: fireMeteorRush },
  { key: 'eventRainbowWave',  interval: 60000,  fire: fireRainbowWave },
  { key: 'eventFourway',      interval: 90000,  fire: fireFourway },
  { key: 'eventBlackhole',    interval: 120000, fire: fireBlackhole },
  { key: 'eventFullShower',   interval: 180000, fire: fireFullShower },
  { key: 'legendarySupernova',  interval: 600000,  fire: fireSupernova },
  { key: 'legendaryCosmicRain', interval: 3600000, fire: fireCosmicRain },
];

// Aurora는 상시 표시 (이벤트가 아닌 정적 오버레이) — 해금 시 1회 setup
var _auroraAdded = false;

// 버프 헬퍼
function _evBf(key) {
  var b = (typeof window !== 'undefined' && window.gameBuffs) || {};
  return (typeof b[key] === 'number') ? b[key] : 0;
}

function startEventTicks() {
  if (_eventTickInterval) return;
  // 1초 주기 마스터 틱
  _eventTickInterval = setInterval(function() {
    var now = Date.now();
    var layer = document.getElementById('village-stars-layer');
    if (!layer) return;
    EVENT_SPECS.forEach(function(spec) {
      if (_evBf(spec.key) <= 0) return;  // 아이템 구매 안 됨
      var last = _eventLastFired[spec.key] || 0;
      if (now - last >= spec.interval) {
        _eventLastFired[spec.key] = now;
        try { spec.fire(layer, now); }
        catch (e) { console.error('[event-ticks] fire error:', spec.key, e); }
      }
    });
  }, 1000);

  // Aurora는 1회만 setup
  setupAurora();
}

function stopEventTicks() {
  if (_eventTickInterval) {
    clearInterval(_eventTickInterval);
    _eventTickInterval = null;
  }
  _eventPartTimers.forEach(function(id) { clearTimeout(id); });
  _eventPartTimers = [];
  // 진행 중 이벤트 DOM 노드 정리
  document.querySelectorAll('.event-particle, .event-overlay').forEach(function(el) { el.remove(); });
}

// 이벤트 발동 시 DOM 상한 가드
function _particleGuard(layer) {
  return layer.querySelectorAll('.event-particle, .village-shooting-star, .ambient').length < 200;
}

// === 이벤트 1: 우주의 숨결 (15초, 0.5초 fade) ===
function fireHeartbeat(layer) {
  layer.classList.add('evt-heartbeat');
  _eventPartTimers.push(setTimeout(function() { layer.classList.remove('evt-heartbeat'); }, 600));
}

// === 이벤트 2: 별빛 부스터 (30초, 1초 brightness 2배) ===
function fireBooster(layer) {
  layer.classList.add('evt-booster');
  _eventPartTimers.push(setTimeout(function() { layer.classList.remove('evt-booster'); }, 1100));
}

// === 이벤트 3: Ambient 폭발 (30초, 20개 전체 영역 랜덤) ===
function fireAmbientBurst() {
  var ws = document.getElementById('workspace');
  if (!ws) return;
  var colors = ['#00ffc8', '#a78bfa', '#fbbf24', '#00d4ff', '#f472b6', '#84cc16', '#ffffff', '#ff6b6b', '#e879f9'];
  for (var i = 0; i < 20; i++) {
    var p = document.createElement('div');
    p.className = 'ambient event-particle';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    // 전체 화면 랜덤 분포 (중앙 집중 X)
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
    p.style.setProperty('--dy', '-200px');
    p.style.animationDuration = (1.8 + Math.random() * 0.6) + 's';
    var size = 3 + Math.random() * 4;
    p.style.width = size + 'px'; p.style.height = size + 'px';
    ws.appendChild(p);
    (function(el) { _eventPartTimers.push(setTimeout(function() { el.remove(); }, 2500)); })(p);
  }
}

// === 이벤트 4: 성운 개화 (30초, 3초 확장) ===
function fireNebulaBloom(layer) {
  layer.querySelectorAll('.village-nebula').forEach(function(n) { n.classList.add('evt-bloom'); });
  _eventPartTimers.push(setTimeout(function() {
    layer.querySelectorAll('.village-nebula').forEach(function(n) { n.classList.remove('evt-bloom'); });
  }, 3100));
}

// === 이벤트 5: 은하수 번쩍 (45초, 2초 halo 밝기) ===
function fireGalaxyFlash(layer) {
  layer.classList.add('evt-galaxy-flash');
  _eventPartTimers.push(setTimeout(function() { layer.classList.remove('evt-galaxy-flash'); }, 2100));
}

// === 이벤트 6: 유성 러시 (1분, 5초 별똥별 5배) ===
function fireMeteorRush() {
  // 5초간 0.5초 주기로 별똥별 스폰
  var elapsed = 0;
  var iv = setInterval(function() {
    if (typeof spawnShootingStar === 'function') {
      for (var i = 0; i < 3; i++) spawnShootingStar();
    }
    elapsed += 500;
    if (elapsed >= 5000) clearInterval(iv);
  }, 500);
  _eventPartTimers.push(setTimeout(function() { clearInterval(iv); }, 5500));
}

// === 이벤트 7: 무지개 물결 (1분, 2초 hue-rotate) ===
function fireRainbowWave(layer) {
  layer.classList.add('evt-rainbow-wave');
  _eventPartTimers.push(setTimeout(function() { layer.classList.remove('evt-rainbow-wave'); }, 2100));
}

// === 이벤트 8: 사방 별똥별 (1분 30초, 3초 동안 4방향) ===
function fireFourway(layer) {
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  var elapsed = 0;
  var iv = setInterval(function() {
    if (typeof spawnShootingStar !== 'function') return;
    // 4방향 동시 스폰 — 좌/우 진입은 y 범위를 70%로 확장하여 위쪽 편향 해소
    spawnShootingStar({ startX: 0, startY: Math.random() * h * 0.7, angleRange: [0, 40] });             // 좌→우하
    spawnShootingStar({ startX: w, startY: Math.random() * h * 0.7, angleRange: [140, 180] });          // 우→좌하
    spawnShootingStar({ startX: Math.random() * w, startY: 0, angleRange: [60, 120] });                 // 상→하
    spawnShootingStar({ startX: Math.random() * w, startY: h * 0.8, angleRange: [-120, -60] });         // 하→상 (drift up)
    elapsed += 400;
    if (elapsed >= 3000) clearInterval(iv);
  }, 400);
  _eventPartTimers.push(setTimeout(function() { clearInterval(iv); }, 3500));
}

// === 이벤트 9: 블랙홀 파동 (2분, 3초 원형 파동) ===
function fireBlackhole(layer) {
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  for (var i = 0; i < 3; i++) {
    var ring = document.createElement('div');
    ring.className = 'event-particle evt-blackhole-ring';
    ring.style.left = (w / 2) + 'px';
    ring.style.top = (h / 2) + 'px';
    ring.style.animationDelay = (i * 0.6) + 's';
    layer.appendChild(ring);
    (function(el) { _eventPartTimers.push(setTimeout(function() { el.remove(); }, 3500)); })(ring);
  }
}

// === 이벤트 10: 전체 별똥별 잔치 (3분, 6초 폭풍) ===
function fireFullShower(layer) {
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  var elapsed = 0;
  var iv = setInterval(function() {
    if (typeof spawnShootingStar !== 'function') return;
    // 5개씩 랜덤 방향으로 스폰
    for (var i = 0; i < 5; i++) {
      var side = Math.floor(Math.random() * 4);
      var opts;
      if (side === 0) opts = { startX: 0, startY: Math.random() * h, angleRange: [-30, 60] };
      else if (side === 1) opts = { startX: w, startY: Math.random() * h, angleRange: [120, 210] };
      else if (side === 2) opts = { startX: Math.random() * w, startY: 0, angleRange: [30, 150] };
      else opts = { startX: Math.random() * w, startY: h, angleRange: [-150, -30] };
      opts.sizeMul = 1.2;
      spawnShootingStar(opts);
    }
    elapsed += 300;
    if (elapsed >= 6000) clearInterval(iv);
  }, 300);
  _eventPartTimers.push(setTimeout(function() { clearInterval(iv); }, 6500));
}

// === Legendary 1: Supernova (10분, 화면 중앙 폭발) ===
function fireSupernova(layer) {
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  // 플래시 오버레이
  var flash = document.createElement('div');
  flash.className = 'event-overlay evt-supernova-flash';
  layer.appendChild(flash);
  _eventPartTimers.push(setTimeout(function() { flash.remove(); }, 1500));

  // 중심에서 파티클 50개 방사
  for (var i = 0; i < 50; i++) {
    var angle = (i / 50) * Math.PI * 2;
    var dist = 100 + Math.random() * 200;
    var dx = Math.cos(angle) * dist;
    var dy = Math.sin(angle) * dist;
    var p = document.createElement('div');
    p.className = 'event-particle evt-supernova-particle';
    p.style.left = (w / 2) + 'px';
    p.style.top = (h / 2) + 'px';
    p.style.setProperty('--sx', dx + 'px');
    p.style.setProperty('--sy', dy + 'px');
    var colors = ['#fff', '#fbbf24', '#ff6b6b', '#a78bfa'];
    p.style.background = colors[i % colors.length];
    layer.appendChild(p);
    (function(el) { _eventPartTimers.push(setTimeout(function() { el.remove(); }, 2500)); })(p);
  }
}

// === Legendary 2: Aurora Borealis (상시 표시, setup 1회) ===
function setupAurora() {
  if (_auroraAdded) return;
  if (_evBf('legendaryAurora') <= 0) return;
  var layer = document.getElementById('village-stars-layer');
  if (!layer) return;
  var aurora = document.createElement('div');
  aurora.className = 'event-overlay evt-aurora';
  layer.appendChild(aurora);
  _auroraAdded = true;
}

// === Legendary 3: Cosmic Rain (1시간, 20초 유성우 폭풍) ===
function fireCosmicRain() {
  var elapsed = 0;
  var iv = setInterval(function() {
    if (typeof spawnShootingStar !== 'function') return;
    // 10개씩 화면 전체에서 — 더 큰 크기, 더 긴 꼬리
    for (var i = 0; i < 10; i++) {
      var layer = document.getElementById('village-stars-layer');
      if (!layer) return;
      var w = layer.offsetWidth;
      var h = layer.offsetHeight;
      spawnShootingStar({
        startX: Math.random() * w,
        startY: Math.random() * h * 0.85,  // 상단 50% → 85%로 확장 (위쪽 편향 해소)
        angleRange: [-30, 70],
        sizeMul: 1.5,
        tailMul: 1.5,
      });
    }
    elapsed += 500;
    if (elapsed >= 20000) clearInterval(iv);
  }, 500);
  _eventPartTimers.push(setTimeout(function() { clearInterval(iv); }, 20500));
}
