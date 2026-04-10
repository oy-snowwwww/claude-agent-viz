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
// 자동 정리 push — 실행 후 배열에서 제거 (메모리 누적 방지)
function _pushTimer(fn, ms) {
  var id = setTimeout(function() {
    fn();
    var idx = _eventPartTimers.indexOf(id);
    if (idx >= 0) _eventPartTimers.splice(idx, 1);
  }, ms);
  _eventPartTimers.push(id);
}

// 이벤트 스펙: [buffKey, intervalMs, fireFn]
// fireFn은 layer(DOM)와 시간 정보를 받아서 발동
var EVENT_SPECS = [
  { key: 'eventHeartbeat',    interval: 15000,  fire: fireHeartbeat },
  { key: 'eventBooster',      interval: 30000,  fire: fireBooster },
  { key: 'eventNebulaBloom',  interval: 30000,  fire: fireNebulaBloom },
  { key: 'eventGalaxyFlash',  interval: 45000,  fire: fireGalaxyFlash },
  { key: 'eventRainbowWave',  interval: 60000,  fire: fireRainbowWave },
  { key: 'eventColorStorm',   interval: 60000,  fire: fireColorStorm },
  { key: 'eventPulseChain',   interval: 60000,  fire: firePulseChain },
  { key: 'celestialStation',  interval: 300000, fire: fireStation },
  { key: 'legendarySupernova',  interval: 600000,  fire: fireSupernova },
  { key: 'legendaryCosmicRain', interval: 3600000, fire: fireCosmicRain },
];

// 상시 표시형 legendary (이벤트가 아닌 정적 오버레이) — startEventTicks 시 + renderVillage 시 setup 호출
// _setup* 함수는 layer 재생성 후마다 호출되어도 안전 (DOM 기반 중복 가드)


// 버프 헬퍼
function _evBf(key) {
  var b = (typeof window !== 'undefined' && window.gameBuffs) || {};
  return (typeof b[key] === 'number') ? b[key] : 0;
}

function startEventTicks() {
  if (_eventTickInterval) return;
  // 페이지 로드 시점을 기준 시간으로 초기화 — 새로고침 시 모든 이벤트가 즉시 발동되는 것 방지
  // (이전: _eventLastFired 초기값 0 → 첫 틱에서 now - 0 >= interval 항상 참 → 전부 즉시 발동)
  // 이제는 각 이벤트가 자기 interval을 기다려야 처음 발동됨
  var startTs = Date.now();
  EVENT_SPECS.forEach(function(spec) {
    if (!_eventLastFired[spec.key]) _eventLastFired[spec.key] = startTs;
  });
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

  // 상시 legendary setup
  setupTwinMoon();
}

function stopEventTicks() {
  if (_eventTickInterval) {
    clearInterval(_eventTickInterval);
    _eventTickInterval = null;
  }
  _eventPartTimers.forEach(function(id) { clearTimeout(id); });
  _eventPartTimers = [];
  // 진행 중 이벤트 DOM 노드 정리
  document.querySelectorAll('.event-particle, .event-overlay, .village-station').forEach(function(el) { el.remove(); });
}

// 이벤트 발동 시 DOM 상한 가드
function _particleGuard(layer) {
  return layer.querySelectorAll('.event-particle, .village-shooting-star, .ambient, .village-station').length < 200;
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

// === 이벤트 6: 무지개 물결 (1분, 2초 hue-rotate) ===
function fireRainbowWave(layer) {
  layer.classList.add('evt-rainbow-wave');
  _eventPartTimers.push(setTimeout(function() { layer.classList.remove('evt-rainbow-wave'); }, 2100));
}

// === 이벤트 8: 컬러 스톰 (1분, 1초 모든 별 hue-rotate 360° + 채도 부스트) ===
// rainbow_wave와 차별점: 짧고 강함 (1초 vs 2초 대신 강도 ↑), 채도 1.6배
function fireColorStorm(layer) {
  layer.classList.add('evt-color-storm');
  _eventPartTimers.push(setTimeout(function() { layer.classList.remove('evt-color-storm'); }, 1100));
}

// === 이벤트 9: 맥동 연쇄 (1분, 큰 별들이 차례로 강하게 맥동) ===
// 큰 별을 인덱스 순으로 0.2초 간격으로 호출하면서 일시적으로 진폭 키우는 클래스 추가
function firePulseChain(layer) {
  var pulses = layer.querySelectorAll('.village-pulse-star');
  pulses.forEach(function(el, idx) {
    _eventPartTimers.push(setTimeout(function() {
      el.classList.add('evt-pulse-chain');
      _eventPartTimers.push(setTimeout(function() { el.classList.remove('evt-pulse-chain'); }, 800));
    }, idx * 200));
  });
}

// === 천체: 우주 정거장 (5분 주기, 매번 다양한 각도) ===
// 4개 각도 중 랜덤 선택 → 빛점 + 트레일이 화면 한 변에서 반대 변으로 이동 (30초 지속)
function fireStation(layer) {
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  // 시작/종료 좌표 — 4가지 경로 중 랜덤
  var paths = [
    // 좌→우 (상단 가까이)
    { sx: -80, sy: h * (0.10 + Math.random() * 0.25), ex: w + 80, ey: h * (0.10 + Math.random() * 0.25) },
    // 우→좌 (상단 가까이)
    { sx: w + 80, sy: h * (0.10 + Math.random() * 0.25), ex: -80, ey: h * (0.10 + Math.random() * 0.25) },
    // 좌상 → 우하 대각선
    { sx: -80, sy: h * 0.10, ex: w + 80, ey: h * 0.75 },
    // 우상 → 좌하 대각선
    { sx: w + 80, sy: h * 0.10, ex: -80, ey: h * 0.75 },
  ];
  var path = paths[Math.floor(Math.random() * paths.length)];
  // 진행 방향 각도 (꼬리가 올바른 방향을 가리키게)
  var angleDeg = Math.atan2(path.ey - path.sy, path.ex - path.sx) * 180 / Math.PI;
  var station = document.createElement('div');
  station.className = 'village-station';
  station.style.left = '0';
  station.style.top = '0';
  station.style.setProperty('--st-sx', path.sx.toFixed(0) + 'px');
  station.style.setProperty('--st-sy', path.sy.toFixed(0) + 'px');
  station.style.setProperty('--st-ex', path.ex.toFixed(0) + 'px');
  station.style.setProperty('--st-ey', path.ey.toFixed(0) + 'px');
  station.style.setProperty('--st-angle', angleDeg.toFixed(1) + 'deg');
  layer.appendChild(station);
  // layer가 renderVillage()로 재생성되면 station도 같이 사라짐 → el.parentNode 체크로 안전 제거
  _eventPartTimers.push(setTimeout(function() {
    if (station && station.parentNode) station.parentNode.removeChild(station);
  }, 31000));
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

// === Legendary 2: Cosmic Rain (1시간, 10초 유성우 폭풍) ===
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
    if (elapsed >= 10000) clearInterval(iv);
  }, 500);
  _eventPartTimers.push(setTimeout(function() { clearInterval(iv); }, 10500));
}

// === Legendary 3: Twin Moons (상시 표시 — 좌우 끝에 행성 2개, 천천히 회전) ===
// 호출 경로: startEventTicks() 최초 1회 + village.js renderVillage() — layer 재생성 후
// DOM 기반 중복 가드로 여러 번 호출되어도 안전
function setupTwinMoon() {
  if (_evBf('legendaryTwinMoon') <= 0) return;
  var layer = document.getElementById('village-stars-layer');
  if (!layer) return;
  if (layer.querySelector('.evt-twinmoon')) return;
  // 좌측 행성 + 우측 행성 (각자 회전 wrapper)
  ['left', 'right'].forEach(function(side) {
    var moon = document.createElement('div');
    moon.className = 'event-overlay evt-twinmoon evt-twinmoon-' + side;
    layer.appendChild(moon);
  });
}

