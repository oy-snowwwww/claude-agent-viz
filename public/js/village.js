// 마을 모드 — 우주 배경 + 별/nebula/별똥별
// 로드 순서: utils.js 이후 (constants/state/utils 의존)
// 항상 ON (테마 무관). initVillageTier()가 enableVillage()를 1회 호출.
// 배경색은 styles.css `.workspace.village-mode { background: #080812 }` 에서 적용됨.

// === 별 레이어 (반짝임 + 색깔 + 맥동 + nebula + 은하수) ===
// 별 위치는 Math.random() — 매 새로고침 새 우주
// resize 시 dataset.w/h 캐시로 재생성 방지
var STAR_COLOR_PALETTE = [
  '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff',
  '#ffffff', '#ffffff', '#ffffff',
  '#a8c8ff', // 푸른빛
  '#ffd0a0', // 주황빛
];
var NEBULA_COLORS = [
  'rgba(140, 70, 220, 0.32)', // 보라
  'rgba(70, 110, 230, 0.32)', // 파랑
  'rgba(220, 80, 170, 0.28)', // 마젠타
  'rgba(70, 180, 220, 0.28)', // 시안
];

// === 은하수 색조 프리셋 ===
// halo의 RGB + 별 점 색깔. opacity는 makeGalaxy 내부에서 곱함
var GALAXY_TINTS = {
  white:  { r: 220, g: 210, b: 255, star: '#ffffff' },
  blue:   { r: 168, g: 200, b: 255, star: '#cce0ff' },
  orange: { r: 255, g: 208, b: 160, star: '#ffe8cc' },
};

// === 은하수 1개 생성 ===
// opts: { scaleR, dotCountMul, opacityMul, cyMin, cyMax, tint,
//         avoidCx, avoidCy, avoidDist, avoidAngle }
// avoid* 가 주어지면 그 위치/각도와 충분히 떨어진 곳에 배치 (최대 8회 재시도)
// 반환: { cx, cy, rx, angle } — 다음 은하수 회피용
function makeGalaxy(layer, w, h, opts) {
  opts = opts || {};
  // 엣지값 방어: 0 또는 음수가 들어와도 최소값으로 clamp (별 0개로 사라지는 것 방지)
  var scaleR = Math.max(0.1, opts.scaleR != null ? opts.scaleR : 1);
  var dotCountMul = Math.max(0.1, opts.dotCountMul != null ? opts.dotCountMul : 1);
  var opacityMul = Math.max(0.05, opts.opacityMul != null ? opts.opacityMul : 1);
  var cyMin = opts.cyMin != null ? opts.cyMin : 0.10;
  var cyMax = opts.cyMax != null ? opts.cyMax : 0.40;
  var tint = GALAXY_TINTS[opts.tint] || GALAXY_TINTS.white;

  // 위치 결정 (회피 시도, 최대 8회)
  var mwCx = 0, mwCy = 0;
  for (var posTries = 0; posTries < 8; posTries++) {
    mwCx = w * (0.2 + Math.random() * 0.6); // 가로 20~80%
    mwCy = h * (cyMin + Math.random() * (cyMax - cyMin));
    if (opts.avoidCx == null) break;
    var dx = mwCx - opts.avoidCx;
    var dy = mwCy - opts.avoidCy;
    if (Math.sqrt(dx * dx + dy * dy) >= (opts.avoidDist || 0)) break;
  }

  var mwRx = (32 + Math.random() * 18) * scaleR;
  var mwRy = (7 + Math.random() * 4) * scaleR;

  // 각도 결정 (회피 시도, 최대 6회)
  var mwAngle = 0;
  for (var angTries = 0; angTries < 6; angTries++) {
    mwAngle = -25 + Math.random() * 50;
    if (opts.avoidAngle == null) break;
    if (Math.abs(mwAngle - opts.avoidAngle) >= 20) break;
  }

  var mwAngleRad = mwAngle * Math.PI / 180;
  var cosA = Math.cos(mwAngleRad);
  var sinA = Math.sin(mwAngleRad);
  var numDots = Math.round((45 + Math.floor(Math.random() * 25)) * dotCountMul);

  // 은은한 halo 배경 (tint 색상 적용)
  var haloW = mwRx * 2.4;
  var haloH = mwRy * 2.4;
  var haloOpacity = (0.12 * opacityMul).toFixed(3);
  var halo = document.createElement('div');
  halo.style.cssText = 'position:absolute;' +
    'left:' + (mwCx - haloW / 2) + 'px;top:' + (mwCy - haloH / 2) + 'px;' +
    'width:' + haloW + 'px;height:' + haloH + 'px;' +
    'background:radial-gradient(ellipse,rgba(' + tint.r + ',' + tint.g + ',' + tint.b + ',' + haloOpacity + '),transparent 60%);' +
    'transform:rotate(' + mwAngle.toFixed(1) + 'deg);' +
    'filter:blur(6px);' +
    'pointer-events:none;mix-blend-mode:screen;';
  layer.appendChild(halo);

  // 별 점들 (타원 분포, 중심 편향)
  for (var ms = 0; ms < numDots; ms++) {
    // 중심 편향 분포 (radius^1.8 → 중심에 더 밀집)
    var rRatio = Math.pow(Math.random(), 1.8);
    var theta = Math.random() * Math.PI * 2;
    var lx = rRatio * mwRx * Math.cos(theta);
    var ly = rRatio * mwRy * Math.sin(theta);
    var rx = lx * cosA - ly * sinA;
    var ry = lx * sinA + ly * cosA;
    var sx = Math.round(mwCx + rx);
    var sy = Math.round(mwCy + ry);
    var galaxyDotSize = rRatio < 0.25 ? 2 : 1;
    var galaxyDotOpacity = ((0.85 - rRatio * 0.55) * opacityMul).toFixed(2);
    var galaxyDur = 3 + Math.random() * 4;
    var galaxyDelay = Math.random() * 3;
    var dot = document.createElement('div');
    dot.className = 'village-star';
    dot.style.cssText = 'position:absolute;' +
      'left:' + sx + 'px;top:' + sy + 'px;' +
      'width:' + galaxyDotSize + 'px;height:' + galaxyDotSize + 'px;' +
      'background:' + tint.star + ';border-radius:50%;' +
      'opacity:' + galaxyDotOpacity + ';' +
      'animation:village-twinkle ' + galaxyDur.toFixed(2) + 's ease-in-out ' + galaxyDelay.toFixed(2) + 's infinite';
    layer.appendChild(dot);
  }

  return { cx: mwCx, cy: mwCy, rx: mwRx, angle: mwAngle };
}

function ensureStarsLayer() {
  var ws = document.querySelector('.workspace');
  if (!ws) return;
  var w = ws.offsetWidth;
  var h = ws.offsetHeight;
  if (w < 50 || h < 50) return;

  var existing = document.getElementById('village-stars-layer');
  if (existing && existing.dataset.w === String(w) && existing.dataset.h === String(h)) return;
  if (existing) existing.remove();

  var layer = document.createElement('div');
  layer.id = 'village-stars-layer';
  layer.dataset.w = String(w);
  layer.dataset.h = String(h);
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:14;overflow:hidden';

  // === 은하수 (안드로메다 느낌) ===
  // 1개 항상 + 65% 확률로 두 번째 은하수
  // 두 번째는: 더 작고 살짝 어둡고, 아래쪽 영역으로 분리, 푸른빛/주황빛 색조 랜덤
  var firstGalaxy = makeGalaxy(layer, w, h, null);
  if (Math.random() < 0.65) {
    var secondTint = Math.random() < 0.5 ? 'blue' : 'orange';
    makeGalaxy(layer, w, h, {
      scaleR: 0.55 + Math.random() * 0.15,   // 첫 번째의 55~70% 크기 (더 멀리)
      dotCountMul: 0.55,                     // 별 점 개수 절반
      opacityMul: 0.55,                      // halo + 별 모두 어둡게
      cyMin: 0.40,                           // 첫 번째(0.10~0.40)와 위/아래 분리
      cyMax: 0.70,
      tint: secondTint,                      // 푸른빛 또는 주황빛
      avoidCx: firstGalaxy.cx,
      avoidCy: firstGalaxy.cy,
      avoidDist: firstGalaxy.rx * 2.0,
      avoidAngle: firstGalaxy.angle,         // 각도 ±20° 이상 차이
    });
  }

  // Nebula 구름 (은은한 깊이감)
  var numNebulae = 2 + Math.floor(Math.random() * 2);
  var nebulaColors = NEBULA_COLORS.slice().sort(function() { return Math.random() - 0.5; });
  for (var n = 0; n < numNebulae; n++) {
    var nebulaSize = Math.round(200 + Math.random() * 250);
    var nebulaColor = nebulaColors[n % nebulaColors.length];
    var nx = Math.round(Math.random() * w - nebulaSize / 2);
    var ny = Math.round(Math.random() * h - nebulaSize / 2);
    var driftDur = 35 + Math.round(Math.random() * 25);
    var driftDelay = Math.round(Math.random() * 15);
    var nebula = document.createElement('div');
    nebula.className = 'village-nebula';
    nebula.style.cssText = 'position:absolute;' +
      'left:' + nx + 'px;top:' + ny + 'px;' +
      'width:' + nebulaSize + 'px;height:' + nebulaSize + 'px;' +
      'background:radial-gradient(circle, ' + nebulaColor + ' 0%, transparent 75%);' +
      'animation:village-nebula-drift ' + driftDur + 's ease-in-out ' + driftDelay + 's infinite';
    layer.appendChild(nebula);
  }

  // 일반 별 (반짝임)
  var numStars = Math.max(30, Math.min(150, Math.floor(w * h / 3500)));
  for (var i = 0; i < numStars; i++) {
    var star = document.createElement('div');
    star.className = 'village-star';
    var starSize = 1 + Math.floor(Math.random() * 3);
    var starDur = 2 + Math.random() * 4;
    var starDelay = Math.random() * 3;
    var starColorIdx = Math.floor(Math.random() * STAR_COLOR_PALETTE.length);
    var starColor = STAR_COLOR_PALETTE[starColorIdx];
    star.style.cssText = 'position:absolute;' +
      'left:' + Math.round(Math.random() * w) + 'px;' +
      'top:' + Math.round(Math.random() * h) + 'px;' +
      'width:' + starSize + 'px;height:' + starSize + 'px;' +
      'background:' + starColor + ';border-radius:50%;' +
      'animation:village-twinkle ' + starDur.toFixed(2) + 's ease-in-out ' + starDelay.toFixed(2) + 's infinite';
    layer.appendChild(star);
  }

  // 큰 맥동 별 (등대)
  var numPulse = 5;
  for (var p = 0; p < numPulse; p++) {
    var pulseSize = 4 + Math.floor(Math.random() * 3);
    var pulseDur = 3 + Math.random() * 3;
    var pulseDelay = Math.random() * 4;
    var pulseColorIdx = Math.floor(Math.random() * 3);
    var pulseColor = ['#ffffff', '#a8c8ff', '#ffd0a0'][pulseColorIdx];
    var pulseStar = document.createElement('div');
    pulseStar.className = 'village-pulse-star';
    pulseStar.style.cssText = 'position:absolute;' +
      'left:' + Math.round(Math.random() * w) + 'px;' +
      'top:' + Math.round(Math.random() * h * 0.7) + 'px;' +
      'width:' + pulseSize + 'px;height:' + pulseSize + 'px;' +
      'background:' + pulseColor + ';border-radius:50%;' +
      'box-shadow:0 0 6px ' + pulseColor + ',0 0 12px ' + pulseColor + ';' +
      'animation:village-pulse ' + pulseDur.toFixed(2) + 's ease-in-out ' + pulseDelay.toFixed(2) + 's infinite';
    layer.appendChild(pulseStar);
  }

  ws.appendChild(layer);
}

// === 별똥별 (방향/속도/색 다양) ===
var _shootingStarTimer = null;

// 90% 흰색 + 10% 컬러 (희귀)
var SHOOTING_COLOR_PALETTE = [
  '#ffffff','#ffffff','#ffffff','#ffffff','#ffffff',
  '#ffffff','#ffffff','#ffffff','#ffffff', // 9/12 white
  '#a8c8ff', // 푸른빛
  '#ffd0a0', // 주황빛
  '#ffb0d0', // 분홍빛
];

function spawnShootingStar() {
  var layer = document.getElementById('village-stars-layer');
  if (!layer) return;
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  var star = document.createElement('div');
  star.className = 'village-shooting-star';

  // 시작 위치 (좌측 상단 영역)
  star.style.left = (Math.random() * w * 0.6) + 'px';
  star.style.top = (Math.random() * h * 0.3) + 'px';

  // 방향 — -20° ~ +40° (대부분 우하단)
  var angleDeg = -20 + Math.random() * 60;
  var angleRad = angleDeg * Math.PI / 180;
  var distance = 150 + Math.random() * 120; // 150~270px
  var dx = Math.cos(angleRad) * distance;
  var dy = Math.sin(angleRad) * distance;

  // 속도 — 0.8 ~ 2.0초
  var dur = 0.8 + Math.random() * 1.2;

  // 색 — 90% 흰색, 10% 컬러
  var color = SHOOTING_COLOR_PALETTE[Math.floor(Math.random() * SHOOTING_COLOR_PALETTE.length)];

  // 크기/꼬리 길이 — 약간 랜덤
  var size = 2 + Math.floor(Math.random() * 3); // 2~4px
  var trailLen = 30 + Math.floor(Math.random() * 50); // 30~80px

  star.style.setProperty('--shoot-dx', dx.toFixed(0) + 'px');
  star.style.setProperty('--shoot-dy', dy.toFixed(0) + 'px');
  star.style.setProperty('--shoot-trail-angle', angleDeg.toFixed(1) + 'deg');
  star.style.setProperty('--shoot-color', color);
  star.style.setProperty('--shoot-size', size + 'px');
  star.style.setProperty('--shoot-trail-len', trailLen + 'px');
  star.style.animation = 'village-shootingstar ' + dur.toFixed(2) + 's linear forwards';

  layer.appendChild(star);
  setTimeout(function() { star.remove(); }, Math.round(dur * 1000) + 200);
}

// burst 보조 setTimeout 핸들 (stopShootingStars에서 일괄 정리)
var _shootingStarBursts = [];

function startShootingStars() {
  if (_shootingStarTimer) return;
  function schedule() {
    var delay = 2000 + Math.random() * 4000;
    _shootingStarTimer = setTimeout(function() {
      var burstCount = Math.random() < 0.3 ? (2 + Math.floor(Math.random() * 2)) : 1;
      for (var i = 0; i < burstCount; i++) {
        _shootingStarBursts.push(setTimeout(spawnShootingStar, i * 200));
      }
      schedule();
    }, delay);
  }
  schedule();
}

function stopShootingStars() {
  if (_shootingStarTimer) {
    clearTimeout(_shootingStarTimer);
    _shootingStarTimer = null;
  }
  // burst로 발사된 보조 setTimeout도 일괄 정리 (CLAUDE.md 강제 규칙)
  _shootingStarBursts.forEach(function(id) { clearTimeout(id); });
  _shootingStarBursts = [];
  // 진행 중 별 노드도 정리 (탭 비활성/라이트 전환 시 잔존 방지)
  document.querySelectorAll('.village-shooting-star').forEach(function(s){ s.remove(); });
}

// === Village 활성화 (테마와 무관하게 항상 ON) ===
// village-mode 클래스가 워크스페이스의 배경(우주) + 집 숨김을 CSS로 처리
function enableVillage() {
  var ws = document.querySelector('.workspace');
  if (ws) ws.classList.add('village-mode');
  ensureStarsLayer();
  // 페이지가 백그라운드 탭에서 처음 로드된 경우 별똥별 시작 안 함
  // (visibilitychange visible 분기에서 startShootingStars 호출됨)
  if (!document.hidden) startShootingStars();
}

// === 메인 렌더 — 별 레이어 보장 ===
// 캐릭터 크기는 CSS 변수(--char-size, .workspace.tier-N)로 처리됨
function renderVillage() {
  try {
    ensureStarsLayer();
  } catch (e) {
    console.error('[village] renderVillage error:', e);
  }
}
