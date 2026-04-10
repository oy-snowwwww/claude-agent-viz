// 픽셀아트 캐릭터 자율 행동 시스템
// - Creature Life: requestAnimationFrame 기반 roam/stand/sleep 행동
// - Eye Blink: 눈 깜빡임 애니메이션
// - Walk Animation: 다리 움직임 (working/roam 캐릭터)
// 로드 순서: environment 이후, 인라인 메인 이전
// 주의: initCreatureSystem()은 인라인 Init 섹션에서 호출 (getLiveInstances 의존)

// === 전역 상태 ===
var creatureLife = {};            // id → creature 객체
var _blinkInterval = null;        // visibility 핸들러에서 참조
var _walkInterval = null;         // visibility 핸들러에서 참조
var _lastCreatureTick = 0;

// === Eye Blink ===
function blinkEyes() {
  // working 상태 캐릭터 눈 깜빡임
  document.querySelectorAll('.ws-agent.working .pix-lg').forEach(function(pix) {
    if (Math.random() > 0.35) return;
    pix.querySelectorAll('i[data-eye]').forEach(function(cell) {
      var orig = cell.style.background;
      cell.style.background = '#ffe0bd';
      setTimeout(function() { cell.style.background = orig; }, 120 + Math.random() * 80);
    });
  });
  // idle 상태 (roam/stand만, sleep 제외)
  document.querySelectorAll('.ws-agent.idle .pix-lg').forEach(function(pix) {
    var agent = pix.parentElement;
    var id = agent.id.replace('ws-', '');
    var c = creatureLife[id];
    if (!c || c.beh === 'sleep') return;
    if (Math.random() > 0.3) return;
    pix.querySelectorAll('i[data-eye]').forEach(function(cell) {
      var orig = cell.style.background;
      cell.style.background = '#ffe0bd';
      setTimeout(function() { cell.style.background = orig; }, 120 + Math.random() * 80);
    });
  });
}

// === Creature Life System ===
function initCreature(id, el) {
  return {
    x: parseFloat(el.style.left) || 50,
    y: parseFloat(el.style.top) || 50,
    tx: 0, ty: 0,
    beh: 'stand',
    nextAction: Date.now() + 1000 + Math.random() * 3000
  };
}

// === 활동 범위 (워크스페이스 + 캐릭터 박스 기준 동적 안전 마진) ===
// 위: 캐릭터 머리 + 말풍선이 잘리지 않을 만큼
// 아래: 캐릭터 + 라벨 글씨가 잘리지 않을 만큼
// 좌우: 캐릭터 절반 + 라벨 텍스트가 워크스페이스 안에 머무름
var CREATURE_X_MIN_PCT = 4, CREATURE_X_MAX_PCT = 96;
var CREATURE_Y_MIN_PCT = 6, CREATURE_Y_MAX_PCT = 94;
// .ws-label: 0.55rem ~13px (line-height 포함), margin-top 4px → ~17px
// .ws-bubble: padding+text ~14px, 캐릭터로부터 8px 위 + thought circles ~12px → ~34px
var LABEL_BLOCK_PX = 17;
var BUBBLE_BLOCK_PX = 34;
var SAFETY_PX = 6;

var _wsBoxCache = null;
var _safeBoundsCache = null;
function invalidateWsBoxCache() {
  _wsBoxCache = null;
  _safeBoundsCache = null;
  // 모든 캐릭터의 현재 위치를 새 bounds로 즉시 clamp — 다음 tick 전에 bounds 밖에 떠 있는 문제 방지
  if (typeof getSafeBounds === 'function') {
    var b = getSafeBounds();
    Object.keys(creatureLife).forEach(function(id) {
      var c = creatureLife[id];
      if (!c) return;
      c.x = Math.max(b.minX, Math.min(b.maxX, c.x));
      c.y = Math.max(b.minY, Math.min(b.maxY, c.y));
      c.tx = Math.max(b.minX, Math.min(b.maxX, c.tx));
      c.ty = Math.max(b.minY, Math.min(b.maxY, c.ty));
      var el = document.getElementById('ws-' + id);
      if (el) {
        el.style.left = c.x.toFixed(2) + '%';
        el.style.top = c.y.toFixed(2) + '%';
      }
    });
  }
}
window.addEventListener('resize', invalidateWsBoxCache);

function getWsBox() {
  if (_wsBoxCache) return _wsBoxCache;
  var ws = document.querySelector('.workspace');
  if (!ws) return null;
  var w = ws.offsetWidth;
  var h = ws.offsetHeight;
  if (w < 50 || h < 50) return null;
  var charSize = parseInt(getComputedStyle(ws).getPropertyValue('--char-size'), 10) || 48;
  // 캐릭터 박스: 위쪽은 본체 절반 + 말풍선, 아래쪽은 본체 절반 + 라벨
  var topReachPx = charSize / 2 + BUBBLE_BLOCK_PX + SAFETY_PX;
  var bottomReachPx = charSize / 2 + LABEL_BLOCK_PX + SAFETY_PX;
  var sideReachPx = charSize / 2 + SAFETY_PX;
  _wsBoxCache = {
    w: w, h: h,
    topPct: (topReachPx / h) * 100,
    bottomPct: (bottomReachPx / h) * 100,
    sidePct: (sideReachPx / w) * 100,
  };
  return _wsBoxCache;
}

// 캐릭터가 머무를 수 있는 안전 경계 계산 (pickTarget + 충돌 회피 공통)
// 캐시됨 — invalidateWsBoxCache()로 무효화 (resize, tier 변경 시)
function getSafeBounds() {
  if (_safeBoundsCache) return _safeBoundsCache;
  var b = {
    minX: CREATURE_X_MIN_PCT, maxX: CREATURE_X_MAX_PCT,
    minY: CREATURE_Y_MIN_PCT, maxY: CREATURE_Y_MAX_PCT,
  };
  var box = getWsBox();
  if (box) {
    b.minY = Math.max(b.minY, box.topPct);
    b.maxY = Math.min(b.maxY, 100 - box.bottomPct);
    b.minX = Math.max(b.minX, box.sidePct);
    b.maxX = Math.min(b.maxX, 100 - box.sidePct);
  } else {
    return b; // ws 없으면 캐시하지 않음 (다음 호출에서 재시도)
  }
  _safeBoundsCache = b;
  return b;
}

function pickTarget(c) {
  var b = getSafeBounds();
  var tx = c.x + (Math.random() * 70 - 35);
  var ty = c.y + (Math.random() * 60 - 30);
  c.tx = Math.max(b.minX, Math.min(b.maxX, tx));
  c.ty = Math.max(b.minY, Math.min(b.maxY, ty));
}

function isNearOther(id, nx, ny) {
  var tooClose = false;
  Object.keys(creatureLife).forEach(function(oid) {
    if (oid === id) return;
    var o = creatureLife[oid];
    if (Math.abs(nx - o.x) < 10 && Math.abs(ny - o.y) < 12) tooClose = true;
  });
  return tooClose;
}

function tickCreatures() {
  requestAnimationFrame(tickCreatures);
  var now = Date.now();
  if (now - _lastCreatureTick < 66) return; // ~15fps
  _lastCreatureTick = now;
  document.querySelectorAll('.ws-agent').forEach(function(el) {
    var id = el.id.replace('ws-', '');
    if (_dragId === id) return;
    var agSt = el.dataset.st || 'idle';
    // done 후 5초 지나면 idle로 강제 전환 (creature 재활성화)
    if (agSt === 'done') {
      var inst = getLiveInstances().find(function(i) { return i.agentId === id; });
      if (inst && inst.doneTime && (now - inst.doneTime) > 5000) {
        el.className = 'ws-agent idle';
        el.dataset.st = 'idle';
        agSt = 'idle';
        var bub = el.querySelector('.ws-bubble'); if (bub) bub.textContent = '';
        var zzz = el.querySelector('.ws-zzz'); if (zzz) zzz.remove();
        var aura = el.querySelector('.ws-aura'); if (aura) aura.remove();
      }
    }
    // working/thinking: roam만 허용, done: creature 비활성
    var isWorking = agSt === 'working' || agSt === 'thinking';
    if (agSt !== 'idle' && !isWorking) {
      if (creatureLife[id]) {
        var zzz = el.querySelector('.ws-zzz'); if (zzz) zzz.remove();
        delete creatureLife[id];
      }
      return;
    }
    if (!creatureLife[id]) creatureLife[id] = initCreature(id, el);
    var c = creatureLife[id];
    var pix = el.querySelector('.pix-lg');
    var eyes = pix ? pix.querySelectorAll('i[data-eye]') : [];
    var normalEye = currentTheme === 'dark' ? '#080810' : '#1a1a1a';

    if (c.beh === 'roam') {
      // lerp로 목적지를 향해 부드럽게 이동
      var dx = c.tx - c.x;
      var dy = c.ty - c.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3) {
        if (isWorking) {
          // working: 도착하면 바로 다음 목적지
          c.beh = 'roam';
          pickTarget(c);
          if (isNearOther(id, c.tx, c.ty)) pickTarget(c);
        } else {
          // idle: 도착 → 서기 또는 잠자기 (다음 행동까지 더 짧게)
          c.beh = 'stand';
          c.nextAction = now + 1000 + Math.random() * 2200;
        }
      } else {
        // working: 빠르게, idle: 느긋하게
        var speed = isWorking ? 0.035 : 0.02;
        // 충돌 회피
        var nx = c.x + dx * speed;
        var ny = c.y + dy * speed;
        if (isNearOther(id, nx, ny)) {
          // 90도 방향 전환 (동일한 동적 마진 사용)
          var b2 = getSafeBounds();
          c.tx = Math.max(b2.minX, Math.min(b2.maxX, c.x + dy * 0.5));
          c.ty = Math.max(b2.minY, Math.min(b2.maxY, c.y - dx * 0.5));
        } else {
          c.x = nx; c.y = ny;
          el.style.left = c.x.toFixed(2) + '%';
          el.style.top = c.y.toFixed(2) + '%';
        }
      }
    } else if (isWorking) {
      // working/thinking: 항상 roam 유지
      c.beh = 'roam';
      pickTarget(c);
      if (isNearOther(id, c.tx, c.ty)) pickTarget(c);
      eyes.forEach(function(e) { e.style.background = normalEye; e.style.transform = ''; e.style.borderRadius = '0'; });
      var zzz = el.querySelector('.ws-zzz'); if (zzz) zzz.remove();
    } else if (now > c.nextAction) {
      // idle: 행동 전환 (roam 비중↑, stand/sleep 시간↓ → 더 활동적)
      var r = Math.random();
      if (r < 0.65) {
        // roam
        c.beh = 'roam';
        pickTarget(c);
        if (isNearOther(id, c.tx, c.ty)) pickTarget(c);
        eyes.forEach(function(e) { e.style.background = normalEye; e.style.transform = ''; e.style.borderRadius = '0'; });
        var zzz2 = el.querySelector('.ws-zzz'); if (zzz2) zzz2.remove();
      } else if (r < 0.85) {
        // stand
        c.beh = 'stand';
        eyes.forEach(function(e) { e.style.background = normalEye; e.style.transform = ''; e.style.borderRadius = '0'; });
        var zzz3 = el.querySelector('.ws-zzz'); if (zzz3) zzz3.remove();
        c.nextAction = now + 1200 + Math.random() * 2500;
      } else {
        // sleep
        c.beh = 'sleep';
        eyes.forEach(function(e) { e.style.background = '#ffe0bd'; e.style.transform = 'scaleY(.3)'; e.style.borderRadius = '0'; });
        var zzz4 = el.querySelector('.ws-zzz');
        if (!zzz4) {
          zzz4 = document.createElement('div');
          zzz4.className = 'ws-zzz';
          zzz4.style.color = 'var(--text-secondary)';
          var ro = Math.random() * 2;
          zzz4.innerHTML = '<span style="animation-delay:' + ro.toFixed(1) + 's">z</span>'
                         + '<span style="animation-delay:' + (ro + 0.9).toFixed(1) + 's">z</span>'
                         + '<span style="animation-delay:' + (ro + 1.8).toFixed(1) + 's">z</span>';
          el.appendChild(zzz4);
        }
        c.nextAction = now + 2000 + Math.random() * 3000;
      }
    }
  });
  if (typeof updateLineage === 'function') updateLineage();
}

// === Walk Animation (다리 움직임) ===
function walkLegs(pix) {
  if (!pix._wf) pix._wf = 0;
  pix._wf = 1 - pix._wf;
  var cells = pix.children;
  if (cells.length < 56) return;
  var co = pix.dataset.color || '#00ffc8';
  var dk = pix.dataset.dark || '#009977';
  var t = 'transparent';
  if (pix._wf) {
    cells[42].style.background = t;  cells[43].style.background = co; cells[44].style.background = t;
    cells[45].style.background = t;  cells[46].style.background = t;  cells[47].style.background = co; cells[48].style.background = t;
    cells[49].style.background = t;  cells[50].style.background = dk; cells[51].style.background = t;
    cells[52].style.background = t;  cells[53].style.background = t;  cells[54].style.background = dk; cells[55].style.background = t;
  } else {
    cells[42].style.background = t;  cells[43].style.background = t;  cells[44].style.background = co;
    cells[45].style.background = t;  cells[46].style.background = co; cells[47].style.background = t;  cells[48].style.background = t;
    cells[49].style.background = t;  cells[50].style.background = t;  cells[51].style.background = dk;
    cells[52].style.background = t;  cells[53].style.background = dk; cells[54].style.background = t;  cells[55].style.background = t;
  }
}

// === 걷기 인터벌 (visibilitychange 재개/정지에서 재사용) ===
function startWalkInterval() {
  if (_walkInterval) return;
  _walkInterval = setInterval(function() {
    var b = (typeof window !== 'undefined' && window.gameBuffs) || {};
    var hasJump = (b.charJump || 0) > 0;
    var hasTrail = (b.charTrail || 0) > 0;
    // 캐릭터 간 대화
    tryAgentChat();
    // working 캐릭터: 항상 걷기 + 감정 이모지
    document.querySelectorAll('.ws-agent.working .pix-lg').forEach(function(pix) {
      if (Math.random() > 0.6) return;
      walkLegs(pix);
      if (hasJump && Math.random() < 0.05) doJump(pix.parentElement);
      if (hasTrail && Math.random() < 0.4) addTrail(pix.parentElement);
      var wsAgent = pix.closest('.ws-agent');
      if (wsAgent && Math.random() < 0.03) showEmoji(wsAgent, randomEmoji(WORK_EMOJIS));
    });
    // idle + roam 캐릭터: 배회 중일 때만 걷기
    document.querySelectorAll('.ws-agent.idle .pix-lg').forEach(function(pix) {
      var agent = pix.parentElement;
      var id = agent.id.replace('ws-', '');
      var c = creatureLife[id];
      if (c && c.beh === 'roam') {
        if (Math.random() > 0.5) return;
        walkLegs(pix);
        if (hasJump && Math.random() < 0.04) doJump(agent);
        if (hasTrail && Math.random() < 0.25) addTrail(agent);
      }
    });
  }, 350);
}

// char_jump 아이템 효과 — 캐릭터에 `.char-jumping` 클래스를 잠깐 부착
// CSS의 @keyframes charJump가 margin-top을 0 ↔ -12px로 변형 (transform 대신 margin 사용 — master의 중심정렬 translate와 충돌 방지)
// 중복 호출 방지: 이미 jumping 상태면 skip
// 참고: char_halo는 workspace data attribute 기반 CSS selector만으로 동작. char_jump/trail은 여기서 JS 주기적 트리거.
function doJump(agent) {
  if (!agent || agent.classList.contains('char-jumping')) return;
  agent.classList.add('char-jumping');
  setTimeout(function() { agent.classList.remove('char-jumping'); }, 500);
}

// char_trail 아이템 효과 — 캐릭터 현재 위치에 ghost div 생성 후 0.7초 fade-out
// agent bounding rect → workspace 좌표계 변환 → 복사 div 생성
// DOM 상한 가드: ghost가 10개 초과면 skip (700ms remove라 정상 시 ~4개 동시 존재)
function addTrail(agent) {
  if (!agent) return;
  var ws = document.getElementById('workspace');
  if (!ws) return;
  if (ws.querySelectorAll('.char-trail-ghost').length >= 10) return;
  var r = agent.getBoundingClientRect();
  var wr = ws.getBoundingClientRect();
  var t = document.createElement('div');
  t.className = 'char-trail-ghost';
  t.style.cssText = 'position:absolute;left:' + (r.left - wr.left) + 'px;top:' + (r.top - wr.top) + 'px;' +
    'width:' + r.width + 'px;height:' + r.height + 'px;';
  ws.appendChild(t);
  setTimeout(function() { t.remove(); }, 700);
}

function stopWalkInterval() {
  if (_walkInterval) {
    clearInterval(_walkInterval);
    _walkInterval = null;
  }
}

function startBlinkInterval() {
  if (_blinkInterval) return;
  _blinkInterval = setInterval(blinkEyes, 1500);
}

function stopBlinkInterval() {
  if (_blinkInterval) {
    clearInterval(_blinkInterval);
    _blinkInterval = null;
  }
}

// === 감정 이모지 팝업 ===
var WORK_EMOJIS = ['💦', '🔥', '⚡', '💪', '🛠️'];
var DONE_EMOJIS = ['✨', '🎉', '❤️', '💫', '🌟'];
var ESC_EMOJIS  = ['❗', '😵', '💨'];

function showEmoji(el, emoji) {
  if (!el) return;
  // 동시 이모지 2개 제한
  if (el.querySelectorAll('.ws-emoji').length >= 2) return;
  var em = document.createElement('span');
  em.className = 'ws-emoji';
  em.textContent = emoji;
  // 좌우 약간 랜덤 오프셋
  em.style.left = (40 + Math.random() * 20) + '%';
  el.appendChild(em);
  setTimeout(function() { em.remove(); }, 1200);
}

function randomEmoji(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// === 캐릭터 간 대화 ===
var CHAT_SOLO = ['흠...', '이거 복잡하네', '거의 다 됐다', '하나만 더...', '집중!', '좋아좋아', '오 이거 되네'];
var CHAT_PAIR = [
  ['도와줄까?', '괜찮아 거의 끝나'],
  ['여기 봐봐', '오 좋은데?'],
  ['이건 어때?', '그거 좋다!'],
  ['힘들어...', '파이팅!'],
  ['버그 찾았다', '어디어디?'],
  ['다 했다!', '나도 거의!'],
  ['리뷰 부탁해', '잠깐만~'],
];
var _lastChatTime = 0;

function tryAgentChat() {
  var now = Date.now();
  if (now - _lastChatTime < 5000) return; // 5초 쿨다운
  var workingEls = document.querySelectorAll('.ws-agent.working');
  if (workingEls.length === 0) return;
  if (Math.random() > 0.08) return; // 350ms 간격 x 8% = ~4초에 1번
  _lastChatTime = now;

  if (workingEls.length === 1) {
    // 혼자 작업 → 독백
    showChat(workingEls[0], CHAT_SOLO[Math.floor(Math.random() * CHAT_SOLO.length)]);
  } else {
    // 2명 이상 → 대화 쌍
    var pair = CHAT_PAIR[Math.floor(Math.random() * CHAT_PAIR.length)];
    var idx = Math.floor(Math.random() * workingEls.length);
    var other = (idx + 1) % workingEls.length;
    showChat(workingEls[idx], pair[0]);
    setTimeout(function() { showChat(workingEls[other], pair[1]); }, 800);
  }
}

function showChat(el, text) {
  if (!el || el.querySelectorAll('.ws-chat').length >= 1) return;
  var ch = document.createElement('div');
  ch.className = 'ws-chat';
  ch.textContent = text;
  el.appendChild(ch);
  setTimeout(function() { ch.remove(); }, 2500);
}

// === Drag & Drop (캐릭터 재배치) ===
var _dragId = null;

function initDrag() {
  var ws = document.getElementById('workspace');
  if (!ws) return;
  function startDrag(id) {
    _dragId = id;
    var el = document.getElementById('ws-' + id);
    if (el) el.classList.add('dragging');
    if (!creatureLife[id]) creatureLife[id] = initCreature(id, el || { style: {} });
    creatureLife[id].beh = 'dragging';
  }
  function moveDrag(cx, cy) {
    if (!_dragId) return;
    var wsEl = document.getElementById('workspace');
    var el = document.getElementById('ws-' + _dragId);
    if (!wsEl || !el) { _dragId = null; return; }
    var rect = wsEl.getBoundingClientRect();
    var x = ((cx - rect.left) / rect.width) * 100;
    var y = ((cy - rect.top) / rect.height) * 100;
    var b = getSafeBounds();
    x = Math.max(b.minX, Math.min(b.maxX, x));
    y = Math.max(b.minY, Math.min(b.maxY, y));
    el.style.left = x.toFixed(2) + '%';
    el.style.top = y.toFixed(2) + '%';
    if (creatureLife[_dragId]) { creatureLife[_dragId].x = x; creatureLife[_dragId].y = y; }
  }
  function endDrag() {
    if (!_dragId) return;
    var el = document.getElementById('ws-' + _dragId);
    if (el) el.classList.remove('dragging');
    if (creatureLife[_dragId]) { creatureLife[_dragId].beh = 'stand'; creatureLife[_dragId].nextAction = Date.now() + 2000; }
    _dragId = null;
  }
  ws.addEventListener('mousedown', function(e) {
    var a = e.target.closest('.ws-agent'); if (!a) return;
    e.preventDefault(); startDrag(a.id.replace('ws-', ''));
  });
  document.addEventListener('mousemove', function(e) { if (_dragId) { e.preventDefault(); moveDrag(e.clientX, e.clientY); } });
  document.addEventListener('mouseup', endDrag);
  ws.addEventListener('touchstart', function(e) {
    var a = e.target.closest('.ws-agent'); if (!a) return;
    startDrag(a.id.replace('ws-', ''));
  }, { passive: true });
  document.addEventListener('touchmove', function(e) { if (_dragId) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  document.addEventListener('touchend', endDrag);
}

// === 초기화 ===
// 인라인 Init 섹션에서 호출
function initCreatureSystem() {
  startBlinkInterval();
  requestAnimationFrame(tickCreatures);
  startWalkInterval();
  initDrag();
}
