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

// === 레이아웃 캐시 ===
// 문제: renderVillage()가 buff 변경 시 layer를 강제 재생성하면 Math.random() 호출이 매번 새 위치를 반환해
//       성운/별 등이 이전과 다른 자리에 그려져서 사용자가 "위치가 갑자기 바뀜" 을 경험.
// 해결: 위치/색/리듬은 비율(0~1) 기반으로 한 번만 결정하고 캐시. 이후 buff로 size/glow/개수만 동적 계산.
//       w/h가 변하면 리사이즈로 보고 캐시 무효화.
// 캐시 구조: 별 종류별로 spec 배열. spec은 한 별의 고유 위치/색/애니메이션 시드 정보
var _layoutCache = null;

function _ensureLayout(w, h) {
  if (!_layoutCache || _layoutCache.w !== w || _layoutCache.h !== h) {
    _layoutCache = {
      w: w, h: h,
      stars: [],         // { xRatio, yRatio, baseSize(1~3), dur, delay, colorIdx }
      blueStars: [],     // { xRatio, yRatio, baseSize, dur, delay }
      orangeStars: [],   // 동일
      pulses: [],        // { xRatio, yRatio, baseSize(4~6), dur, delay, colorRoll }
      rainbows: [],      // { xRatio, yRatio, baseSize(5~7), dur, delay }
      nebulae: [],       // { xRatio, yRatio, sizeRatio, driftDur, driftDelay, pulseDur, pulseDelay }
      nebulaColorOrder: NEBULA_COLORS.slice().sort(function() { return Math.random() - 0.5; }),
      // celestial — 위치는 화면 한 번 결정 후 고정
      moonCorner: Math.floor(Math.random() * 4),  // 0: 좌상, 1: 우상, 2: 좌하, 3: 우하
      planets: [],       // { orbitRadiusRatio, orbitDur, startAngle, sizePx, color }
      pulsars: [],       // { xRatio, yRatio, sizePx, color, blinkDur }
    };
  }
  return _layoutCache;
}

// 떠도는 행성 색상 팔레트 — 함수 밖 상수로 추출 (hot path 미세 최적화)
var PLANET_COLORS = ['#a8c8ff', '#ffd0a0', '#c8a8ff', '#a0e8c8'];

function _ensurePlanetsCount(arr, count) {
  while (arr.length < count) {
    arr.push({
      orbitRadiusRatio: 0.30 + Math.random() * 0.15,  // 화면 30~45% 반경
      orbitDur: 90 + Math.floor(Math.random() * 60),   // 90~150초 1바퀴
      startAngle: Math.floor(Math.random() * 360),
      sizePx: 6 + Math.floor(Math.random() * 4),      // 6~9px
      color: PLANET_COLORS[arr.length % PLANET_COLORS.length],
    });
  }
}

function _ensurePulsarsCount(arr, count) {
  while (arr.length < count) {
    arr.push({
      xRatio: 0.15 + Math.random() * 0.7,
      yRatio: 0.10 + Math.random() * 0.5,
      sizePx: 4 + Math.floor(Math.random() * 2),
      color: ['#ffffff', '#a8c8ff', '#ffd0a0'][Math.floor(Math.random() * 3)],
      blinkDur: (0.25 + Math.random() * 0.25).toFixed(2),  // 0.25~0.5초 매우 빠른 점멸
    });
  }
}

// === Lazy generators — count가 늘어나면 추가 생성, 줄어들면 앞 N개만 사용해 위치 안정 ===

function _ensureStarsCount(arr, count) {
  // 확장 팔레트 포함 13색까지 colorIdx 0~12 — star_palette 미구매 시 8 이상은 fallback
  var maxIdx = STAR_COLOR_PALETTE.length + STAR_COLOR_PALETTE_EXT.length;
  while (arr.length < count) {
    arr.push({
      xRatio: Math.random(),
      yRatio: Math.random(),
      baseSize: 1 + Math.floor(Math.random() * 3),  // 1~3px
      dur: 2 + Math.random() * 4,                    // 2~6초
      delay: Math.random() * 3,                      // 0~3초
      colorIdx: Math.floor(Math.random() * maxIdx),
    });
  }
}

function _ensureColoredStarsCount(arr, count) {
  // 푸른별/주황별 공용 (색은 렌더 시 고정)
  while (arr.length < count) {
    arr.push({
      xRatio: Math.random(),
      yRatio: Math.random(),
      baseSize: 1 + Math.floor(Math.random() * 3),
      dur: 2 + Math.random() * 4,
      delay: Math.random() * 3,
    });
  }
}

function _ensurePulsesCount(arr, count) {
  while (arr.length < count) {
    arr.push({
      xRatio: Math.random(),
      yRatio: Math.random() * 0.7,  // 상단 70% 영역만
      baseSize: 4 + Math.floor(Math.random() * 3),  // 4~6px
      dur: 3 + Math.random() * 3,
      delay: Math.random() * 4,
      colorRoll: Math.random(),     // 색 결정용 (블루/오렌지 확정 후 나머지)
      randomColorIdx: Math.floor(Math.random() * 3),  // ['#ffffff','#a8c8ff','#ffd0a0'] 중
    });
  }
}

function _ensureRainbowsCount(arr, count) {
  while (arr.length < count) {
    arr.push({
      xRatio: Math.random(),
      yRatio: Math.random() * 0.7,
      baseSize: 5 + Math.floor(Math.random() * 3),  // 5~7px
      dur: 6 + Math.random() * 3,
      delay: Math.random() * 3,
    });
  }
}

function _ensureNebulaeCount(arr, count) {
  while (arr.length < count) {
    arr.push({
      xRatio: Math.random(),
      yRatio: Math.random(),
      sizeRatio: 0.44 + Math.random() * 0.56,        // 0.44~1.0 (200~450 / 450 비율)
      driftDur: Math.round(35 + Math.random() * 25),
      driftDelay: Math.round(Math.random() * 15),
      pulseDur: (4 + Math.random() * 2).toFixed(1),
      pulseDelay: (Math.random() * 3).toFixed(1),
    });
  }
}

// === 별 레이어 (반짝임 + 색깔 + 맥동 + nebula + 은하수) ===
// 별 위치는 Math.random() — 매 새로고침 새 우주
// resize 시 dataset.w/h 캐시로 재생성 방지
// 기본 팔레트 — 80% 흰색에 푸른/주황 약간 (10/8 비율)
var STAR_COLOR_PALETTE = [
  '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff',
  '#ffffff', '#ffffff', '#ffffff',
  '#a8c8ff', // 푸른빛
  '#ffd0a0', // 주황빛
];
// star_palette 아이템 구매 시 추가되는 색상 — 분홍/시안/연노랑 3종
var STAR_COLOR_PALETTE_EXT = ['#ffb0d0', '#c0f0ff', '#fff5a8'];
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

// === 별자리 렌더링 (유명 별자리 템플릿) ===
// 실제 별자리 모양을 정규화 좌표(0~1)로 정의. 화면에 배치 시 위치/크기 랜덤.
// 별자리당 DOM: 별 N개(2px dot) + 선 M개(div rotate). 애니메이션 없음 — 정적 렌더.
var CONSTELLATION_TEMPLATES = [
  { name: '오리온',
    stars: [[0.2,0],[0.8,0.05],[0.35,0.4],[0.5,0.42],[0.65,0.4],[0.25,0.9],[0.75,0.95]],
    lines: [[0,2],[1,4],[2,3],[3,4],[2,5],[4,6],[0,1]] },
  { name: '북두칠성',
    stars: [[0,0.3],[0.15,0],[0.3,0.25],[0.15,0.55],[0.45,0.3],[0.65,0.25],[0.9,0.15]],
    lines: [[0,1],[1,2],[2,3],[3,0],[2,4],[4,5],[5,6]] },
  { name: '카시오페이아',
    stars: [[0,0],[0.25,0.9],[0.5,0.15],[0.75,0.85],[1,0.05]],
    lines: [[0,1],[1,2],[2,3],[3,4]] },
  { name: '백조자리',
    stars: [[0.5,0],[0.5,0.4],[0,0.35],[1,0.45],[0.5,1]],
    lines: [[0,1],[1,4],[2,1],[1,3]] },
  { name: '쌍둥이자리',
    stars: [[0.15,0],[0.85,0.05],[0.1,0.35],[0.8,0.4],[0.2,0.7],[0.75,0.75],[0.3,1],[0.7,0.95]],
    lines: [[0,2],[2,4],[4,6],[1,3],[3,5],[5,7],[0,1]] },
];

function _drawConstellations(layer, layoutStars, w, h, count) {
  // 별자리 배치 캐시 — 위치/크기/회전은 최초 1회만 결정
  if (!layoutStars.constellationPlacements) layoutStars.constellationPlacements = [];
  while (layoutStars.constellationPlacements.length < count) {
    var idx = layoutStars.constellationPlacements.length % CONSTELLATION_TEMPLATES.length;
    layoutStars.constellationPlacements.push({
      templateIdx: idx,
      cx: 0.15 + Math.random() * 0.7,   // 중심 x (15~85%)
      cy: 0.15 + Math.random() * 0.7,   // 중심 y
      scale: 0.08 + Math.random() * 0.07, // 화면 대비 크기 (8~15%)
      rotation: Math.random() * 360,      // 회전
    });
  }
  for (var ci = 0; ci < count; ci++) {
    var pl = layoutStars.constellationPlacements[ci];
    var tpl = CONSTELLATION_TEMPLATES[pl.templateIdx];
    if (!tpl) continue;
    var rad = pl.rotation * Math.PI / 180;
    var cosR = Math.cos(rad);
    var sinR = Math.sin(rad);
    var sz = Math.min(w, h) * pl.scale;
    // 별 위치 계산 (회전 적용)
    var pts = tpl.stars.map(function(s) {
      var lx = (s[0] - 0.5) * sz;
      var ly = (s[1] - 0.5) * sz;
      return {
        x: Math.max(0, Math.min(w, Math.round(pl.cx * w + lx * cosR - ly * sinR))),
        y: Math.max(0, Math.min(h, Math.round(pl.cy * h + lx * sinR + ly * cosR))),
      };
    });
    // 별 점 렌더
    pts.forEach(function(p) {
      var dot = document.createElement('div');
      dot.className = 'village-constellation-star';
      dot.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;' +
        'width:2px;height:2px;background:#c8dcff;border-radius:50%;' +
        'box-shadow:0 0 3px #c8dcff;pointer-events:none;';
      layer.appendChild(dot);
    });
    // 선 렌더
    tpl.lines.forEach(function(ln) {
      var a = pts[ln[0]];
      var b = pts[ln[1]];
      if (!a || !b) return;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) return;
      var angle = Math.atan2(dy, dx) * 180 / Math.PI;
      var line = document.createElement('div');
      line.className = 'village-constellation-line';
      line.style.cssText = 'position:absolute;left:' + a.x + 'px;top:' + a.y + 'px;' +
        'width:' + Math.round(len) + 'px;height:1px;' +
        'background:rgba(200,220,255,0.12);' +
        'transform-origin:0 0;transform:rotate(' + angle.toFixed(2) + 'deg);' +
        'pointer-events:none;';
      layer.appendChild(line);
    });
  }
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
  // z-index:5 — 천체(달/행성)가 캐릭터(.ws-agent z:10) 뒤에 깔리도록
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden';

  // === 은하수 (해금 후) ===
  // unlockGalaxy 해금 필요. 밀도/크기는 버프로 배수, 색조는 blueTint/orangeTint 해금
  // galaxy_rotation 활성 시 별도 wrapper에 회전 클래스 — 일반 별/성운은 회전하지 않게 격리
  // galaxy_arms는 density에 +20%/stack 추가 (나선팔 강조)
  if (_bf('unlockGalaxy') > 0) {
    var galaxyArmsBoost = 1 + (_bf('galaxyArmsAdd') * 0.20);
    var densityMul = (1 + _bf('galaxyDensityMul')) * galaxyArmsBoost;
    var sizeMul = 1 + _bf('galaxySizeMul');
    var forceBlue = _bf('galaxyBlueTint') > 0;
    var forceOrange = _bf('galaxyOrangeTint') > 0;
    var firstTint = forceBlue ? 'blue' : (forceOrange ? 'orange' : 'white');
    var galaxyContainer = document.createElement('div');
    galaxyContainer.className = 'village-galaxy-wrapper' + (_bf('galaxyRotation') > 0 ? ' rotating' : '');
    galaxyContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    layer.appendChild(galaxyContainer);

    var firstGalaxy = makeGalaxy(galaxyContainer, w, h, {
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
      var extraGalaxy = makeGalaxy(galaxyContainer, w, h, {
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

  // 공통 layout cache — 성운/일반별/푸른별/주황별/큰별/반짝이는별/천체 모두 공유
  var layoutStars = _ensureLayout(w, h);

  // === Nebula 구름 (해금 후) — 위치는 _layoutCache에 비율로 고정, buff로는 크기/맥동만 동적 ===
  // unlockNebula 해금 필요. 첫 성운 해금 시 1개 등장, nebula_count로 +1씩 추가 (최대 3개)
  // nebula_purple로 보라 성운 1개 추가 (기존 count와 별개로 +1)
  if (_bf('unlockNebula') > 0) {
    var basicNebulae = 1 + Math.round(_bf('nebulaCountAdd'));  // 1 + stacks
    var purpleNebulae = _bf('nebulaPurpleAdd') > 0 ? 1 : 0;
    var numNebulae = basicNebulae + purpleNebulae;
    _ensureNebulaeCount(layoutStars.nebulae, numNebulae);  // 부족하면 추가 생성, 있으면 재사용
    var nebulaSizeMul = 1 + _bf('nebulaSizeMul');
    // 화면 단축 축의 35%를 절대 상한 — 작은 화면에서 성운이 뷰포트를 덮지 않도록
    var nebulaMaxSize = Math.round(Math.min(w, h) * 0.35);
    var nebulaPulseAmp = _bf('nebulaPulseAdd');  // 0 = 없음, 최대 0.3 (stack 5)
    var nebulaLightning = _bf('nebulaLightning') > 0;  // 번개 효과
    for (var n = 0; n < numNebulae; n++) {
      var spec = layoutStars.nebulae[n];
      // 크기는 sizeRatio × 450 × buff (buff 변경 시 같은 위치에서 커지기만)
      var nebulaSize = Math.round(spec.sizeRatio * 450 * nebulaSizeMul);
      if (nebulaSize > nebulaMaxSize) nebulaSize = nebulaMaxSize;
      var nx = Math.round(spec.xRatio * w - nebulaSize / 2);
      var ny = Math.round(spec.yRatio * h - nebulaSize / 2);
      // 마지막 슬롯이 보라 성운 (purpleNebulae > 0인 경우)
      var nebulaColor;
      if (purpleNebulae > 0 && n === numNebulae - 1) {
        nebulaColor = 'rgba(168, 85, 247, 0.36)';  // 진한 보라
      } else {
        nebulaColor = layoutStars.nebulaColorOrder[n % layoutStars.nebulaColorOrder.length];
      }
      // blur를 크기 비례로 — 고정 22px은 작은 성운을 뭉갬. 5.5% 비율 + 최소 10px 가드
      var nebulaBlurPx = Math.max(10, Math.round(nebulaSize * 0.055));
      // 작은 성운은 base opacity를 올려 가시성 보정 (blur로 희석되는 양 보상)
      var nebulaBaseOpacity = nebulaSize < 220 ? 0.9 : 0.75;
      // 맥동 — 각 성운별 캐시된 주기/딜레이 사용 (재렌더해도 같은 리듬)
      var nebulaAnim = 'village-nebula-drift ' + spec.driftDur + 's ease-in-out ' + spec.driftDelay + 's infinite';
      var varStyle = '--neb-base-opacity:' + nebulaBaseOpacity + ';';
      if (nebulaPulseAmp > 0) {
        nebulaAnim += ', village-nebula-pulse ' + spec.pulseDur + 's ease-in-out ' + spec.pulseDelay + 's infinite';
        varStyle += '--pulse-amp:' + nebulaPulseAmp.toFixed(2) + ';';
      }
      var nebula = document.createElement('div');
      nebula.className = 'village-nebula' + (nebulaLightning ? ' lightning' : '');
      nebula.style.cssText = 'position:absolute;' +
        'left:' + nx + 'px;top:' + ny + 'px;' +
        'width:' + nebulaSize + 'px;height:' + nebulaSize + 'px;' +
        'background:radial-gradient(circle, ' + nebulaColor + ' 0%, transparent 75%);' +
        'filter:blur(' + nebulaBlurPx + 'px);' +
        varStyle +
        'animation:' + nebulaAnim;
      layer.appendChild(nebula);
    }
  }

  // === 일반 별 (반짝임) — layout 캐시 기반 (layoutStars는 함수 상단에서 이미 선언) ===
  // 시작 상태: 0개 (완전 검정 우주 — 캐릭터만 존재). star_count 아이템 구매 시 +10씩 (최대 +100)
  var baseStars = 0;
  var numStars = baseStars + Math.round(_bf('starCountAdd'));
  var twinkleMul = 1 / (1 + _bf('starTwinkleMul'));  // 속도 +10% → duration × 1/1.1
  var starSizeAdd = Math.round(_bf('starSizeAdd'));  // 일반 별 전용 크기 보정 (+1px/stack)
  var starGlowPx = Math.round(_bf('starBrightnessMul'));  // 일반 별 글로우 (0~5px)
  // star_palette 활성 시 확장 팔레트(13색) 사용, 아니면 기본 10색만 (확장 인덱스는 fallback)
  var palette = (_bf('starPaletteAdd') > 0) ? STAR_COLOR_PALETTE.concat(STAR_COLOR_PALETTE_EXT) : STAR_COLOR_PALETTE;
  _ensureStarsCount(layoutStars.stars, numStars);
  for (var i = 0; i < numStars; i++) {
    var sSpec = layoutStars.stars[i];
    var star = document.createElement('div');
    star.className = 'village-star';
    var starSize = sSpec.baseSize + starSizeAdd;
    var starDur = sSpec.dur * twinkleMul;
    var starColor = palette[sSpec.colorIdx % palette.length];
    var starGlowStyle = starGlowPx > 0 ? ('box-shadow:0 0 ' + starGlowPx + 'px ' + starColor + ';') : '';
    star.style.cssText = 'position:absolute;' +
      'left:' + Math.round(sSpec.xRatio * w) + 'px;' +
      'top:' + Math.round(sSpec.yRatio * h) + 'px;' +
      'width:' + starSize + 'px;height:' + starSize + 'px;' +
      'background:' + starColor + ';border-radius:50%;' +
      starGlowStyle +
      'animation:village-twinkle ' + starDur.toFixed(2) + 's ease-in-out ' + sSpec.delay.toFixed(2) + 's infinite';
    layer.appendChild(star);
  }

  // === 푸른 별 — layout 캐시 ===
  // blue_ratio: +5 per stack (최대 50개), blue_glow로 글로우 반경 증가
  var numBlueStars = Math.round(_bf('blueStarAdd'));
  var blueGlowMul = 1 + _bf('blueGlowMul');
  var blueGlowPx = Math.round(3 * blueGlowMul);
  _ensureColoredStarsCount(layoutStars.blueStars, numBlueStars);
  for (var bs = 0; bs < numBlueStars; bs++) {
    var bSpec = layoutStars.blueStars[bs];
    var bStar = document.createElement('div');
    bStar.className = 'village-star';
    bStar.style.cssText = 'position:absolute;' +
      'left:' + Math.round(bSpec.xRatio * w) + 'px;' +
      'top:' + Math.round(bSpec.yRatio * h) + 'px;' +
      'width:' + bSpec.baseSize + 'px;height:' + bSpec.baseSize + 'px;' +
      'background:#a8c8ff;border-radius:50%;' +
      'box-shadow:0 0 ' + blueGlowPx + 'px #a8c8ff;' +
      'animation:village-twinkle ' + (bSpec.dur * twinkleMul).toFixed(2) + 's ease-in-out ' + bSpec.delay.toFixed(2) + 's infinite';
    layer.appendChild(bStar);
  }

  // === 주황 별 — layout 캐시 ===
  var numOrangeStars = Math.round(_bf('orangeStarAdd'));
  var orangeGlowMul = 1 + _bf('orangeGlowMul');
  var orangeGlowPx = Math.round(3 * orangeGlowMul);
  _ensureColoredStarsCount(layoutStars.orangeStars, numOrangeStars);
  for (var os = 0; os < numOrangeStars; os++) {
    var oSpec = layoutStars.orangeStars[os];
    var oStar = document.createElement('div');
    oStar.className = 'village-star';
    oStar.style.cssText = 'position:absolute;' +
      'left:' + Math.round(oSpec.xRatio * w) + 'px;' +
      'top:' + Math.round(oSpec.yRatio * h) + 'px;' +
      'width:' + oSpec.baseSize + 'px;height:' + oSpec.baseSize + 'px;' +
      'background:#ffd0a0;border-radius:50%;' +
      'box-shadow:0 0 ' + orangeGlowPx + 'px #ffd0a0;' +
      'animation:village-twinkle ' + (oSpec.dur * twinkleMul).toFixed(2) + 's ease-in-out ' + oSpec.delay.toFixed(2) + 's infinite';
    layer.appendChild(oStar);
  }

  // === 큰 맥동 별 (해금 후) — layout 캐시 ===
  // 시작: 0. unlockPulse 해금 시 기본 1개 + pulse_count 스택으로 +1씩 (최대 11)
  if (_bf('unlockPulse') > 0) {
    var numPulse = 1 + Math.round(_bf('pulseCountAdd'));
    var pulseSizeBonus = Math.round(_bf('pulseSizeAdd'));
    var pulseGlowMul = 1 + _bf('pulseGlowMul');
    var pulseSpeedMul = 1 / (1 + _bf('pulseSpeedMul'));  // 속도 +10%/stack → duration × 1/1.1
    var bluePulseCount = Math.round(_bf('bluePulseAdd'));
    var orangePulseCount = Math.round(_bf('orangePulseAdd'));
    var glowR1 = Math.round(6 * pulseGlowMul);
    var glowR2 = Math.round(12 * pulseGlowMul);
    _ensurePulsesCount(layoutStars.pulses, numPulse);

    for (var p = 0; p < numPulse; p++) {
      var pSpec = layoutStars.pulses[p];
      var pulseSize = pSpec.baseSize + pulseSizeBonus;
      // 색상 결정: 앞 N개는 푸른색, 다음 M개는 주황색, 나머지는 캐시된 randomColorIdx로 고정
      var pulseColor;
      if (p < bluePulseCount) pulseColor = '#a8c8ff';
      else if (p < bluePulseCount + orangePulseCount) pulseColor = '#ffd0a0';
      else pulseColor = ['#ffffff', '#a8c8ff', '#ffd0a0'][pSpec.randomColorIdx];

      var pulseStar = document.createElement('div');
      pulseStar.className = 'village-pulse-star';
      pulseStar.style.cssText = 'position:absolute;' +
        'left:' + Math.round(pSpec.xRatio * w) + 'px;' +
        'top:' + Math.round(pSpec.yRatio * h) + 'px;' +
        'width:' + pulseSize + 'px;height:' + pulseSize + 'px;' +
        'background:' + pulseColor + ';border-radius:50%;' +
        'box-shadow:0 0 ' + glowR1 + 'px ' + pulseColor + ',0 0 ' + glowR2 + 'px ' + pulseColor + ';' +
        'animation:village-pulse ' + (pSpec.dur * pulseSpeedMul).toFixed(2) + 's ease-in-out ' + pSpec.delay.toFixed(2) + 's infinite';
      layer.appendChild(pulseStar);
    }
  }

  // === 반짝이는 별 (해금 후) — layout 캐시 ===
  // 시작: 0. unlockRainbow 해금 시 기본 1개 + rainbow_count 스택으로 +1씩 (최대 8)
  if (_bf('unlockRainbow') > 0) {
    var numRainbow = 1 + Math.round(_bf('rainbowCountAdd'));
    var rainbowSpeedMul = 1 / (1 + _bf('rainbowSpeedMul'));
    var rainbowSizeAdd = Math.round(_bf('rainbowSizeAdd'));
    var rainbowGlowMul = 1 + _bf('rainbowGlowMul');
    var rainbowTrail = _bf('rainbowTrail') > 0;  // 추가 외곽 글로우 잔상
    var rbGlowR1 = Math.round(8 * rainbowGlowMul);
    var rbGlowR2 = Math.round(14 * rainbowGlowMul);
    var rbGlowR3 = Math.round(24 * rainbowGlowMul);  // trail용 추가 외곽 반경
    _ensureRainbowsCount(layoutStars.rainbows, numRainbow);
    for (var rb = 0; rb < numRainbow; rb++) {
      var rbSpec = layoutStars.rainbows[rb];
      var rbSize = rbSpec.baseSize + rainbowSizeAdd;
      // trail 활성 시 box-shadow에 추가 광역 외곽 그림자 한 겹 더
      var rbShadow = rainbowTrail
        ? ('0 0 ' + rbGlowR1 + 'px currentColor, 0 0 ' + rbGlowR2 + 'px currentColor, 0 0 ' + rbGlowR3 + 'px currentColor')
        : ('0 0 ' + rbGlowR1 + 'px currentColor, 0 0 ' + rbGlowR2 + 'px currentColor');
      var rbStar = document.createElement('div');
      rbStar.className = 'village-rainbow-star' + (rainbowTrail ? ' trail' : '');
      rbStar.style.cssText = 'position:absolute;' +
        'left:' + Math.round(rbSpec.xRatio * w) + 'px;' +
        'top:' + Math.round(rbSpec.yRatio * h) + 'px;' +
        'width:' + rbSize + 'px;height:' + rbSize + 'px;' +
        'background:#ffffff;border-radius:50%;' +
        'box-shadow:' + rbShadow + ';' +
        'animation:village-rainbow ' + (rbSpec.dur * rainbowSpeedMul).toFixed(2) + 's linear ' + rbSpec.delay.toFixed(2) + 's infinite';
      layer.appendChild(rbStar);
    }
  }

  // === 🌙 천체 (Celestial) — 달, 행성, 펄사, 쌍성, 우주정거장 ===
  // 달 — 화면 한 코너에 큰 원형 div + radial-gradient + crater
  if (_bf('celestialMoon') > 0) {
    // 달 크기는 화면 단축 축의 13% — 작은 화면에서 최소 50px, 큰 화면에서도 110px 이하로 제한
    // 우주 전체 대비 비율 유지 + 달이 너무 거대하거나 사라지는 것 방지
    var moonSize = Math.round(Math.min(w, h) * 0.13);
    if (moonSize < 50) moonSize = 50;
    if (moonSize > 110) moonSize = 110;
    var moon = document.createElement('div');
    moon.className = 'village-moon';
    var corners = [
      { left: '5%', top: '5%' },
      { right: '5%', top: '5%' },
      { left: '5%', bottom: '8%' },
      { right: '5%', bottom: '8%' },
    ];
    var corner = corners[layoutStars.moonCorner];
    var posCSS = '';
    Object.keys(corner).forEach(function(k) { posCSS += k + ':' + corner[k] + ';'; });
    moon.style.cssText = 'position:absolute;' + posCSS +
      'width:' + moonSize + 'px;height:' + moonSize + 'px;';
    layer.appendChild(moon);
  }

  // 떠도는 행성 — 화면 중앙 기준 큰 궤도로 매우 천천히 공전
  var numPlanets = Math.round(_bf('celestialPlanetAdd'));
  if (numPlanets > 0) {
    _ensurePlanetsCount(layoutStars.planets, numPlanets);
    for (var pi = 0; pi < numPlanets; pi++) {
      var pSp = layoutStars.planets[pi];
      var orbitR = Math.round(Math.min(w, h) * pSp.orbitRadiusRatio);
      var orbit = document.createElement('div');
      orbit.className = 'village-planet-orbit';
      orbit.style.cssText = 'position:absolute;left:50%;top:50%;' +
        'width:' + (orbitR * 2) + 'px;height:' + (orbitR * 2) + 'px;' +
        'margin-left:' + (-orbitR) + 'px;margin-top:' + (-orbitR) + 'px;' +
        'animation:villagePlanetOrbit ' + pSp.orbitDur + 's linear infinite;' +
        'transform:rotate(' + pSp.startAngle + 'deg);';
      var planet = document.createElement('div');
      planet.className = 'village-planet';
      planet.style.cssText = 'position:absolute;left:50%;top:0;' +
        'width:' + pSp.sizePx + 'px;height:' + pSp.sizePx + 'px;' +
        'margin-left:' + (-pSp.sizePx / 2) + 'px;' +
        'background:radial-gradient(circle at 35% 35%, ' + pSp.color + ' 0%, rgba(50,50,80,.4) 70%, transparent 100%);' +
        'border-radius:50%;box-shadow:0 0 6px ' + pSp.color + ';';
      orbit.appendChild(planet);
      layer.appendChild(orbit);
    }
  }

  // 펄사 — 매우 빠른 점멸 별
  var numPulsars = Math.round(_bf('celestialPulsarAdd'));
  if (numPulsars > 0) {
    _ensurePulsarsCount(layoutStars.pulsars, numPulsars);
    for (var psi = 0; psi < numPulsars; psi++) {
      var pulSp = layoutStars.pulsars[psi];
      var pulsar = document.createElement('div');
      pulsar.className = 'village-pulsar';
      pulsar.style.cssText = 'position:absolute;' +
        'left:' + Math.round(pulSp.xRatio * w) + 'px;' +
        'top:' + Math.round(pulSp.yRatio * h) + 'px;' +
        'width:' + pulSp.sizePx + 'px;height:' + pulSp.sizePx + 'px;' +
        'background:' + pulSp.color + ';border-radius:50%;' +
        'box-shadow:0 0 8px ' + pulSp.color + ',0 0 16px ' + pulSp.color + ';' +
        'animation:villagePulsar ' + pulSp.blinkDur + 's ease-in-out infinite;';
      layer.appendChild(pulsar);
    }
  }

  // 쌍성 — 두 큰 별이 wrapper 안에서 서로 회전
  // moonCorner와 반대쪽 영역에 배치해서 달/쌍성이 겹치지 않게
  if (_bf('celestialBinary') > 0) {
    var binW = document.createElement('div');
    binW.className = 'village-binary-wrapper';
    // moonCorner 0(좌상) / 1(우상) / 2(좌하) / 3(우하) — 반대 코너 영역에 쌍성
    var BIN_POS = [
      { xr: 0.70, yr: 0.70 },  // moon 좌상 → 쌍성 우하
      { xr: 0.30, yr: 0.70 },  // moon 우상 → 쌍성 좌하
      { xr: 0.70, yr: 0.25 },  // moon 좌하 → 쌍성 우상
      { xr: 0.30, yr: 0.25 },  // moon 우하 → 쌍성 좌상
    ];
    var bpos = BIN_POS[layoutStars.moonCorner];
    var binCx = Math.round(w * bpos.xr);
    var binCy = Math.round(h * bpos.yr);
    binW.style.cssText = 'position:absolute;left:' + binCx + 'px;top:' + binCy + 'px;' +
      'width:0;height:0;animation:villageBinaryRotate 18s linear infinite;';
    var bA = document.createElement('div');
    bA.className = 'village-binary-star';
    bA.style.cssText = 'position:absolute;left:-22px;top:-4px;width:8px;height:8px;' +
      'background:#a8c8ff;border-radius:50%;box-shadow:0 0 10px #a8c8ff,0 0 20px #a8c8ff;';
    var bB = document.createElement('div');
    bB.className = 'village-binary-star';
    bB.style.cssText = 'position:absolute;left:14px;top:-4px;width:8px;height:8px;' +
      'background:#ffd0a0;border-radius:50%;box-shadow:0 0 10px #ffd0a0,0 0 20px #ffd0a0;';
    binW.appendChild(bA);
    binW.appendChild(bB);
    layer.appendChild(binW);
  }

  // 우주 정거장은 정적 div 아님 — event-ticks.js에서 5분마다 다양한 각도로 spawn (spawnStation)

  // === 별자리 (constellation) — 가까운 별 3~5개를 선으로 연결 ===
  // constellationCount buff만큼 별자리 생성 (최대 5). 기존 별 위치 재사용.
  // SVG 아닌 div line — 별 개수 적을 때 별자리 없음 (최소 3개 필요)
  var numConst = Math.round(_bf('constellationCount'));
  if (numConst > 0) {
    _drawConstellations(layer, layoutStars, w, h, numConst);
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
// 4방향 모드용 방향 테이블 — [angleMin, angleMax, startRegion]
// startRegion: 'tl' | 'tr' | 'bl' | 'br' (좌상/우상/좌하/우하 시작 구역)
// 각도 기준: 0°=우측, 90°=하단, 180°=좌측, 270°=상단 (CSS 좌표계)
var METEOR_DIRECTIONS = [
  { angleMin: 20,   angleMax: 60,   start: 'tl' },  // 우하단 방향 → 좌상단에서 출발
  { angleMin: 120,  angleMax: 160,  start: 'tr' },  // 좌하단 방향 → 우상단에서 출발
  { angleMin: 200,  angleMax: 240,  start: 'br' },  // 좌상단 방향 → 우하단에서 출발
  { angleMin: -60,  angleMax: -20,  start: 'bl' },  // 우상단 방향 → 좌하단에서 출발
];

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

  // 방향 결정 — meteor_direction 구매 시 4방향 랜덤, 아니면 기본 우하단
  var angleRange;
  var startRegion = null;
  if (opts.angleRange) {
    angleRange = opts.angleRange;
  } else if (_bf('meteorDirection') > 0) {
    var dir = METEOR_DIRECTIONS[Math.floor(Math.random() * METEOR_DIRECTIONS.length)];
    angleRange = [dir.angleMin, dir.angleMax];
    startRegion = dir.start;
  } else {
    angleRange = [-20, 40];
  }

  // 시작 위치 — 4방향 모드면 방향 반대쪽 구역에서, 아니면 화면 전체 상단 85% 랜덤
  var sx, sy;
  if (opts.startX != null) sx = opts.startX;
  else if (startRegion === 'tl') sx = Math.random() * w * 0.35;
  else if (startRegion === 'tr') sx = w * 0.65 + Math.random() * w * 0.35;
  else if (startRegion === 'bl') sx = Math.random() * w * 0.35;
  else if (startRegion === 'br') sx = w * 0.65 + Math.random() * w * 0.35;
  else sx = Math.random() * w;

  if (opts.startY != null) sy = opts.startY;
  else if (startRegion === 'tl' || startRegion === 'tr') sy = Math.random() * h * 0.35;
  else if (startRegion === 'bl' || startRegion === 'br') sy = h * 0.55 + Math.random() * h * 0.35;
  else sy = Math.random() * h * 0.85;

  star.style.left = sx + 'px';
  star.style.top = sy + 'px';

  var angleDeg = angleRange[0] + Math.random() * (angleRange[1] - angleRange[0]);
  var angleRad = angleDeg * Math.PI / 180;
  var distance = 150 + Math.random() * 120;
  var dx = Math.cos(angleRad) * distance;
  var dy = Math.sin(angleRad) * distance;

  // 속도
  var dur = 0.8 + Math.random() * 1.2;

  // 색 — forceColor 우선, 아니면 무지개 버프면 rainbow 클래스, 기본은 흰색
  var color;
  var isRainbow = false;
  if (opts.forceColor) {
    color = opts.forceColor;
  } else if (_bf('meteorRainbow') > 0) {
    // 무지개 꼬리 — 클래스로 CSS hue-rotate 애니메이션 적용, 기본색은 흰색 유지
    color = '#ffffff';
    isRainbow = true;
  } else {
    color = '#ffffff';
  }
  if (isRainbow) star.classList.add('rainbow');

  // 크기/꼬리 — meteor_size 버프 반영. base 2~3px (이전 2~4)로 줄임 — 풀스택에서도 너무 크지 않게
  var meteorSizeMul = 1 + _bf('meteorSizeMul');
  var sizeMul = (opts.sizeMul || 1) * meteorSizeMul;
  var tailMul = (opts.tailMul || 1) * (1 + _bf('meteorTailMul'));
  var size = Math.round((2 + Math.floor(Math.random() * 2)) * sizeMul);
  var trailLen = Math.round((30 + Math.floor(Math.random() * 50)) * tailMul);

  star.style.setProperty('--shoot-dx', dx.toFixed(0) + 'px');
  star.style.setProperty('--shoot-dy', dy.toFixed(0) + 'px');
  star.style.setProperty('--shoot-trail-angle', angleDeg.toFixed(1) + 'deg');
  star.style.setProperty('--shoot-color', color);
  star.style.setProperty('--shoot-size', size + 'px');
  star.style.setProperty('--shoot-trail-len', trailLen + 'px');
  // 기본 이동 애니메이션 + 무지개 버프 시 hue-rotate 동시 적용 (inline animation이 CSS 규칙보다 우선해서 덮지 않게)
  var anim = 'village-shootingstar ' + dur.toFixed(2) + 's linear forwards';
  if (isRainbow) anim += ', meteorHueRotate 1.5s linear infinite';
  star.style.animation = anim;

  layer.appendChild(star);
  // meteor_explode: 별똥별이 사라지는 시점 직전에 작은 폭발 파티클
  var doExplode = _bf('meteorExplode') > 0 && !opts.noExplode;
  setTimeout(function() {
    if (doExplode && layer.parentNode) {
      // 별똥별의 종착점 좌표 계산 (시작 + dx/dy)
      var ex = sx + dx;
      var ey = sy + dy;
      var explode = document.createElement('div');
      explode.className = 'village-meteor-explode';
      explode.style.cssText = 'position:absolute;left:' + Math.round(ex) + 'px;top:' + Math.round(ey) + 'px;' +
        'background:' + color + ';';
      layer.appendChild(explode);
      setTimeout(function() { explode.remove(); }, 700);
    }
    star.remove();
  }, Math.round(dur * 1000) + 200);
}

// burst 보조 setTimeout 핸들 (stopShootingStars에서 일괄 정리)
var _shootingStarBursts = [];

function startShootingStars() {
  if (_shootingStarTimer) return;
  // 해금 안 되어 있으면 시작 안 함
  if (_bf('unlockMeteor') <= 0) return;

  function schedule() {
    // 발생 간격 — 기본 3~8초, meteor_freq 버프로 주기 단축
    var freqMul = 1 / (1 + _bf('meteorFreqMul'));
    var delay = (3000 + Math.random() * 5000) * freqMul;
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
    // 구매/환불/초기화로 buffs가 바뀐 경우 기존 레이어는 오래된 상태
    // → 강제 제거 후 재생성 (ensureStarsLayer는 w/h가 같으면 early return하므로 제거 필수)
    // 위치/색은 _layoutCache에 비율로 캐시되어 있어 재생성해도 같은 자리에 다시 그려짐
    var existing = document.getElementById('village-stars-layer');
    if (existing) existing.remove();
    ensureStarsLayer();
    // 상시 표시형 legendary는 layer 안에 붙는 정적 오버레이 → layer 재생성 시 함께 사라짐 → 재부착
    if (typeof setupTwinMoon === 'function') setupTwinMoon();
  } catch (e) {
    console.error('[village] renderVillage error:', e);
  }
}
