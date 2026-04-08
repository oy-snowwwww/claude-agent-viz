// 마을 모드 — 우주 배경 + 별/nebula/별똥별
// 로드 순서: utils.js 이후 (constants/state/utils 의존)
// 항상 ON (테마 무관). initVillageTier()가 enableVillage()를 1회 호출.
// 배경색은 styles.css `.workspace.village-mode { background: #080812 }` 에서 적용됨.
//
// === 게임화 버프 ===
// window.gameBuffs (points.js 또는 main.js가 세팅, 없으면 빈 객체)에서 읽어서 적용.
// 시작 상태(빈 우주): 일반 별 15개만, 나머지 해금 필요.

// 버프 접근 헬퍼 — gameBuffs 미정의/미해금 시 안전 기본값 반환
function _buffs() { return (typeof window !== 'undefined' && window.gameBuffs) || {}; }
function _bf(key, def) { var v = _buffs()[key]; return (typeof v === 'number') ? v : (def || 0); }

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
  layer.className = 'village-stars-layer';  // 이벤트 CSS selector용 (event-ticks.js)
  layer.dataset.w = String(w);
  layer.dataset.h = String(h);
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:14;overflow:hidden';

  // === 은하수 (해금 후) ===
  // unlockGalaxy 해금 필요. 밀도/크기는 버프로 배수, 색조는 blueTint/orangeTint 해금
  if (_bf('unlockGalaxy') > 0) {
    var densityMul = 1 + _bf('galaxyDensityMul');
    var sizeMul = 1 + _bf('galaxySizeMul');
    var forceBlue = _bf('galaxyBlueTint') > 0;
    var forceOrange = _bf('galaxyOrangeTint') > 0;
    var firstTint = forceBlue ? 'blue' : (forceOrange ? 'orange' : 'white');

    var firstGalaxy = makeGalaxy(layer, w, h, {
      scaleR: sizeMul,
      dotCountMul: densityMul,
      tint: firstTint,
    });
    // 추가 은하수 — galaxy_extra 스택으로 +1씩 (최대 +3 → 총 4개)
    // 서로 겹치지 않게 이전 은하수를 회피하며 배치 + cyMin/cyMax 교대 (상/하 영역 분산)
    var extraGalaxies = Math.round(_bf('galaxyExtraAdd'));
    var prevGalaxy = firstGalaxy;
    for (var gi = 0; gi < extraGalaxies; gi++) {
      // 색조: 강제 tint 해금 있으면 따르고, 없으면 [white/blue/orange] 순환으로 다양성
      var gTint;
      if (forceBlue && !forceOrange) gTint = 'blue';
      else if (forceOrange && !forceBlue) gTint = 'orange';
      else gTint = ['blue', 'orange', 'white'][gi % 3];
      // cyMin/cyMax 교대 (짝수 인덱스는 하단, 홀수는 상단)
      var cyMin = (gi % 2 === 0) ? 0.40 : 0.05;
      var cyMax = (gi % 2 === 0) ? 0.75 : 0.40;
      var extraGalaxy = makeGalaxy(layer, w, h, {
        scaleR: (0.55 + Math.random() * 0.15) * sizeMul,
        dotCountMul: 0.55 * densityMul,
        opacityMul: 0.55,
        cyMin: cyMin,
        cyMax: cyMax,
        tint: gTint,
        avoidCx: prevGalaxy.cx,
        avoidCy: prevGalaxy.cy,
        avoidDist: prevGalaxy.rx * 2.0,
        avoidAngle: prevGalaxy.angle,
      });
      prevGalaxy = extraGalaxy;
    }
  }

  // === Nebula 구름 (해금 후) ===
  // unlockNebula 해금 필요. 첫 성운 해금 시 1개 등장, nebula_count로 +1씩 추가
  if (_bf('unlockNebula') > 0) {
    var numNebulae = 1 + Math.round(_bf('nebulaCountAdd'));  // 1 + stacks
    var nebulaSizeMul = 1 + _bf('nebulaSizeMul');
    var nebulaSlowMul = 1 + _bf('nebulaSlowMul');  // 이동 속도 배수 (1.0 = 기본, 1.5 = 1.5배 느림)
    var nebulaColors = NEBULA_COLORS.slice().sort(function() { return Math.random() - 0.5; });
    for (var n = 0; n < numNebulae; n++) {
      var nebulaSize = Math.round((200 + Math.random() * 250) * nebulaSizeMul);
      var nebulaColor = nebulaColors[n % nebulaColors.length];
      var nx = Math.round(Math.random() * w - nebulaSize / 2);
      var ny = Math.round(Math.random() * h - nebulaSize / 2);
      var driftDur = Math.round((35 + Math.random() * 25) * nebulaSlowMul);
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
  }

  // === 일반 별 (반짝임) ===
  // 시작 상태: 0개 (완전 검정 우주 — 캐릭터만 존재). star_count 아이템 구매 시 +10씩 (최대 +100)
  var baseStars = 0;
  var numStars = baseStars + Math.round(_bf('starCountAdd'));
  var twinkleMul = 1 / (1 + _bf('starTwinkleMul'));  // 속도 +10% → duration × 1/1.1
  for (var i = 0; i < numStars; i++) {
    var star = document.createElement('div');
    star.className = 'village-star';
    var starSize = 1 + Math.floor(Math.random() * 3);
    var starDur = (2 + Math.random() * 4) * twinkleMul;
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

  // === 푸른 별 (색상 고정 일반별) ===
  // blue_ratio 아이템: +5 per stack (최대 50개)
  var numBlueStars = Math.round(_bf('blueStarAdd'));
  for (var bs = 0; bs < numBlueStars; bs++) {
    var bStar = document.createElement('div');
    bStar.className = 'village-star';
    var bSize = 1 + Math.floor(Math.random() * 3);
    var bDur = (2 + Math.random() * 4) * twinkleMul;
    var bDelay = Math.random() * 3;
    bStar.style.cssText = 'position:absolute;' +
      'left:' + Math.round(Math.random() * w) + 'px;' +
      'top:' + Math.round(Math.random() * h) + 'px;' +
      'width:' + bSize + 'px;height:' + bSize + 'px;' +
      'background:#a8c8ff;border-radius:50%;' +
      'box-shadow:0 0 3px #a8c8ff;' +
      'animation:village-twinkle ' + bDur.toFixed(2) + 's ease-in-out ' + bDelay.toFixed(2) + 's infinite';
    layer.appendChild(bStar);
  }

  // === 주황 별 ===
  var numOrangeStars = Math.round(_bf('orangeStarAdd'));
  for (var os = 0; os < numOrangeStars; os++) {
    var oStar = document.createElement('div');
    oStar.className = 'village-star';
    var oSize = 1 + Math.floor(Math.random() * 3);
    var oDur = (2 + Math.random() * 4) * twinkleMul;
    var oDelay = Math.random() * 3;
    oStar.style.cssText = 'position:absolute;' +
      'left:' + Math.round(Math.random() * w) + 'px;' +
      'top:' + Math.round(Math.random() * h) + 'px;' +
      'width:' + oSize + 'px;height:' + oSize + 'px;' +
      'background:#ffd0a0;border-radius:50%;' +
      'box-shadow:0 0 3px #ffd0a0;' +
      'animation:village-twinkle ' + oDur.toFixed(2) + 's ease-in-out ' + oDelay.toFixed(2) + 's infinite';
    layer.appendChild(oStar);
  }

  // === 큰 맥동 별 (해금 후) ===
  // 시작: 0. unlockPulse 해금 시 기본 1개 + pulse_count 스택으로 +1씩 (최대 15)
  if (_bf('unlockPulse') > 0) {
    var numPulse = 1 + Math.round(_bf('pulseCountAdd'));
    var pulseSizeBonus = Math.round(_bf('pulseSizeAdd'));
    var pulseGlowMul = 1 + _bf('pulseGlowMul');
    // 푸른/주황 큰 별 확정 개수
    var bluePulseCount = Math.round(_bf('bluePulseAdd'));
    var orangePulseCount = Math.round(_bf('orangePulseAdd'));

    for (var p = 0; p < numPulse; p++) {
      var pulseSize = 4 + Math.floor(Math.random() * 3) + pulseSizeBonus;
      var pulseDur = 3 + Math.random() * 3;
      var pulseDelay = Math.random() * 4;
      // 색상 결정: 앞 N개는 푸른색, 다음 M개는 주황색, 나머지는 랜덤
      var pulseColor;
      if (p < bluePulseCount) pulseColor = '#a8c8ff';
      else if (p < bluePulseCount + orangePulseCount) pulseColor = '#ffd0a0';
      else pulseColor = ['#ffffff', '#a8c8ff', '#ffd0a0'][Math.floor(Math.random() * 3)];

      var glowR1 = Math.round(6 * pulseGlowMul);
      var glowR2 = Math.round(12 * pulseGlowMul);
      var pulseStar = document.createElement('div');
      pulseStar.className = 'village-pulse-star';
      pulseStar.style.cssText = 'position:absolute;' +
        'left:' + Math.round(Math.random() * w) + 'px;' +
        'top:' + Math.round(Math.random() * h * 0.7) + 'px;' +
        'width:' + pulseSize + 'px;height:' + pulseSize + 'px;' +
        'background:' + pulseColor + ';border-radius:50%;' +
        'box-shadow:0 0 ' + glowR1 + 'px ' + pulseColor + ',0 0 ' + glowR2 + 'px ' + pulseColor + ';' +
        'animation:village-pulse ' + pulseDur.toFixed(2) + 's ease-in-out ' + pulseDelay.toFixed(2) + 's infinite';
      layer.appendChild(pulseStar);
    }
  }

  // === 반짝이는 별 (해금 후) ===
  // 시작: 0. unlockRainbow 해금 시 기본 1개 + rainbow_count 스택으로 +1씩 (최대 8)
  if (_bf('unlockRainbow') > 0) {
    var numRainbow = 1 + Math.round(_bf('rainbowCountAdd'));
    var rainbowSpeedMul = 1 / (1 + _bf('rainbowSpeedMul'));  // 속도 +20% → duration ×1/1.2
    for (var rb = 0; rb < numRainbow; rb++) {
      var rbSize = 5 + Math.floor(Math.random() * 3);
      var rbDur = (6 + Math.random() * 3) * rainbowSpeedMul;
      var rbDelay = Math.random() * 3;
      var rbStar = document.createElement('div');
      rbStar.className = 'village-rainbow-star';
      rbStar.style.cssText = 'position:absolute;' +
        'left:' + Math.round(Math.random() * w) + 'px;' +
        'top:' + Math.round(Math.random() * h * 0.7) + 'px;' +
        'width:' + rbSize + 'px;height:' + rbSize + 'px;' +
        'background:#ffffff;border-radius:50%;' +
        'box-shadow:0 0 8px currentColor, 0 0 14px currentColor;' +
        'animation:village-rainbow ' + rbDur.toFixed(2) + 's linear ' + rbDelay.toFixed(2) + 's infinite';
      layer.appendChild(rbStar);
    }
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

// spawnShootingStar(opts?)
// opts:
//   startX, startY  — 시작 위치 지정 (없으면 기본: 좌상단 영역)
//   angleRange      — [minDeg, maxDeg] (없으면 -20~40)
//   forceColor      — 강제 색상 (없으면 확률로 결정)
//   sizeMul         — 크기 배수
//   tailMul         — 꼬리 길이 배수
// → 이벤트 아이템(사방 별똥별, 전체 잔치, 유성우)에서 위치/방향 지정에 사용
function spawnShootingStar(opts) {
  var layer = document.getElementById('village-stars-layer');
  if (!layer) return;
  // DOM 파티클 상한 가드 — 200개 초과 시 신규 생성 skip
  if (layer.querySelectorAll('.village-shooting-star').length >= 200) return;
  opts = opts || {};
  var w = layer.offsetWidth;
  var h = layer.offsetHeight;
  var star = document.createElement('div');
  star.className = 'village-shooting-star';

  // 시작 위치 — 기본은 화면 좌우 전체 × 상단 85% 영역 (방향이 우하단이라 자연스럽게 화면 가로지름)
  // 너무 아래에서 시작하면 짧게 보이지만 화면 전체에 별똥별이 분포되어 위쪽 편향 해소
  star.style.left = (opts.startX != null ? opts.startX : (Math.random() * w)) + 'px';
  star.style.top = (opts.startY != null ? opts.startY : (Math.random() * h * 0.85)) + 'px';

  // 방향
  var angleRange = opts.angleRange || [-20, 40];
  var angleDeg = angleRange[0] + Math.random() * (angleRange[1] - angleRange[0]);
  var angleRad = angleDeg * Math.PI / 180;
  var distance = 150 + Math.random() * 120;
  var dx = Math.cos(angleRad) * distance;
  var dy = Math.sin(angleRad) * distance;

  // 속도
  var dur = 0.8 + Math.random() * 1.2;

  // 색 — forceColor 또는 버프(컬러 확률) 적용
  var color;
  if (opts.forceColor) {
    color = opts.forceColor;
  } else {
    // 기본 흰색 + 버프로 컬러 확률 상승
    var colorChance = 0.10 + _bf('meteorColorAdd');  // 10% + 버프
    if (Math.random() < colorChance) {
      var colorOptions = ['#a8c8ff', '#ffd0a0', '#ffb0d0'];
      color = colorOptions[Math.floor(Math.random() * colorOptions.length)];
    } else {
      color = '#ffffff';
    }
  }

  // 크기/꼬리
  var sizeMul = opts.sizeMul || 1;
  var tailMul = (opts.tailMul || 1) * (1 + _bf('meteorTailMul'));
  var size = Math.round((2 + Math.floor(Math.random() * 3)) * sizeMul);
  var trailLen = Math.round((30 + Math.floor(Math.random() * 50)) * tailMul);

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
  // 해금 안 되어 있으면 시작 안 함
  if (_bf('unlockMeteor') <= 0) return;

  function schedule() {
    // 발생 간격 — 기본 2~6초, meteor_freq 버프로 주기 단축
    var freqMul = 1 / (1 + _bf('meteorFreqMul'));
    var delay = (2000 + Math.random() * 4000) * freqMul;
    _shootingStarTimer = setTimeout(function() {
      // burst 확률 — 기본 30% + meteorBurstAdd
      var burstChance = 0.30 + _bf('meteorBurstAdd');
      var burstN = 2 + Math.floor(Math.random() * 2) + Math.round(_bf('meteorBurstN'));
      var burstCount = Math.random() < burstChance ? burstN : 1;
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
