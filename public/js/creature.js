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
    walking: false,
    nextAction: Date.now() + 1000 + Math.random() * 3000
  };
}

function pickTarget(c) {
  var tx = c.x + (Math.random() * 40 - 20);
  var ty = c.y + (Math.random() * 30 - 15);
  c.tx = Math.max(5, Math.min(95, tx));
  c.ty = Math.max(60, Math.min(85, ty));
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
          c.beh = 'roam'; c.walking = true;
          pickTarget(c);
          if (isNearOther(id, c.tx, c.ty)) pickTarget(c);
        } else {
          // idle: 도착 → 서기 또는 잠자기
          c.beh = 'stand'; c.walking = false;
          c.nextAction = now + 2000 + Math.random() * 4000;
        }
      } else {
        // working: 빠르게, idle: 느긋하게
        var speed = isWorking ? 0.035 : 0.02;
        // 충돌 회피
        var nx = c.x + dx * speed;
        var ny = c.y + dy * speed;
        if (isNearOther(id, nx, ny)) {
          // 90도 방향 전환
          c.tx = Math.max(5, Math.min(95, c.x + dy * 0.5));
          c.ty = Math.max(60, Math.min(85, c.y - dx * 0.5));
        } else {
          c.x = nx; c.y = ny;
          el.style.left = c.x.toFixed(2) + '%';
          el.style.top = c.y.toFixed(2) + '%';
        }
      }
    } else if (isWorking) {
      // working/thinking: 항상 roam 유지
      c.beh = 'roam'; c.walking = true;
      pickTarget(c);
      if (isNearOther(id, c.tx, c.ty)) pickTarget(c);
      eyes.forEach(function(e) { e.style.background = normalEye; e.style.transform = ''; e.style.borderRadius = '0'; });
      var zzz = el.querySelector('.ws-zzz'); if (zzz) zzz.remove();
    } else if (now > c.nextAction) {
      // idle: 행동 전환
      var r = Math.random();
      if (r < 0.45) {
        // roam
        c.beh = 'roam'; c.walking = true;
        pickTarget(c);
        if (isNearOther(id, c.tx, c.ty)) pickTarget(c);
        eyes.forEach(function(e) { e.style.background = normalEye; e.style.transform = ''; e.style.borderRadius = '0'; });
        var zzz2 = el.querySelector('.ws-zzz'); if (zzz2) zzz2.remove();
      } else if (r < 0.72) {
        // stand
        c.beh = 'stand'; c.walking = false;
        eyes.forEach(function(e) { e.style.background = normalEye; e.style.transform = ''; e.style.borderRadius = '0'; });
        var zzz3 = el.querySelector('.ws-zzz'); if (zzz3) zzz3.remove();
        c.nextAction = now + 2000 + Math.random() * 4000;
      } else {
        // sleep
        c.beh = 'sleep'; c.walking = false;
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

// === 초기화 ===
// 인라인 Init 섹션에서 호출
function initCreatureSystem() {
  _blinkInterval = setInterval(blinkEyes, 1500);
  requestAnimationFrame(tickCreatures);
  _walkInterval = setInterval(function() {
    // working 캐릭터: 항상 걷기
    document.querySelectorAll('.ws-agent.working .pix-lg').forEach(function(pix) {
      if (Math.random() > 0.6) return;
      walkLegs(pix);
    });
    // idle + roam 캐릭터: 배회 중일 때만 걷기
    document.querySelectorAll('.ws-agent.idle .pix-lg').forEach(function(pix) {
      var agent = pix.parentElement;
      var id = agent.id.replace('ws-', '');
      var c = creatureLife[id];
      if (c && c.beh === 'roam') {
        if (Math.random() > 0.5) return;
        walkLegs(pix);
      }
    });
  }, 350);
}
