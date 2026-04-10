// 워크스페이스 시각 효과 애니메이션
// - sparks: 에이전트 완료 시 불꽃
// - flyDot: 에이전트 간 이동 점
// - celebrate: 전체 완료 축하 파티클
// 로드 순서: notifications 이후, 인라인 메인 이전

// === 불꽃 파티클 (에이전트 시작/완료 시점) ===
function sparks(wid, color) {
  var el = document.getElementById('ws-' + wid);
  var ws = document.getElementById('workspace');
  if (!el || !ws) return;
  var r = el.getBoundingClientRect();
  var wr = ws.getBoundingClientRect();
  var cx = r.left - wr.left + r.width / 2;
  var cy = r.top - wr.top + r.height / 2;
  for (var i = 0; i < 8; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement('div');
        p.className = 'spark';
        p.style.background = color;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        p.style.transition = 'all 0.6s ease-out';
        ws.appendChild(p);
        requestAnimationFrame(function() {
          p.style.transform = 'translate(' + (Math.random() * 50 - 25) + 'px,' + (Math.random() * -40 - 10) + 'px)';
          p.style.opacity = '0';
        });
        setTimeout(function() { p.remove(); }, 700);
      }, idx * 50);
    })(i);
  }
}

// === 이동 점 (Master ↔ 에이전트 사이 메시지 시각화) ===
function flyDot(fid, tid) {
  var f = document.getElementById('ws-' + fid);
  var t = document.getElementById('ws-' + tid);
  var ws = document.getElementById('workspace');
  if (!f || !t || !ws) return;
  var fr = f.getBoundingClientRect();
  var tr = t.getBoundingClientRect();
  var wr = ws.getBoundingClientRect();
  var fx = fr.left - wr.left + fr.width / 2;
  var fy = fr.top - wr.top + fr.height / 2;
  var tx = tr.left - wr.left + tr.width / 2;
  var ty = tr.top - wr.top + tr.height / 2;
  var dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.left = fx + 'px';
  dot.style.top = fy + 'px';
  ws.appendChild(dot);
  var start = performance.now();
  var dur = 500;
  function anim(now) {
    var p = Math.min((now - start) / dur, 1);
    var e = 1 - Math.pow(1 - p, 3);
    dot.style.left = (fx + (tx - fx) * e) + 'px';
    dot.style.top = (fy + (ty - fy) * e) + 'px';
    dot.style.opacity = p < 0.7 ? '1' : String(1 - (p - 0.7) / 0.3);
    if (p < 1) requestAnimationFrame(anim);
    else dot.remove();
  }
  requestAnimationFrame(anim);
}

// === char_fanfare 아이템 — agent_done 시 캐릭터에서 별 12개가 위로 튀어오름 ===
// sparks와 다른 점: 더 큼, 더 많이, 더 위로, 컬러풀
function charFanfare(wid, color) {
  var el = document.getElementById('ws-' + wid);
  var ws = document.getElementById('workspace');
  if (!el || !ws) return;
  var r = el.getBoundingClientRect();
  var wr = ws.getBoundingClientRect();
  var cx = r.left - wr.left + r.width / 2;
  var cy = r.top - wr.top + r.height / 2;
  var fanColors = [color, '#fbbf24', '#a78bfa', '#00ffc8', '#f472b6'];
  for (var i = 0; i < 12; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement('div');
        p.className = 'char-fanfare-particle';
        p.style.background = fanColors[idx % fanColors.length];
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        var dx = (Math.random() * 80 - 40);
        var dy = -60 - Math.random() * 60;
        p.style.setProperty('--fan-dx', dx + 'px');
        p.style.setProperty('--fan-dy', dy + 'px');
        ws.appendChild(p);
        setTimeout(function() { p.remove(); }, 1500);
      }, idx * 30);
    })(i);
  }
}

// === 축하 파티클 (전체 작업 완료 시) ===
function celebrate() {
  var ws = document.getElementById('workspace');
  if (!ws) return;
  var colors = ['#00ffc8','#a78bfa','#fbbf24','#00d4ff','#f472b6','#10b981','#fb923c','#ef4444'];
  for (var i = 0; i < 30; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement('div');
        var size = 4 + Math.random() * 8;
        p.style.cssText = 'position:absolute;pointer-events:none;z-index:20;border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') + ';width:' + size + 'px;height:' + size + 'px;background:' + colors[idx % colors.length] + ';left:' + (Math.random() * 90 + 5) + '%;top:' + (Math.random() * 90 + 5) + '%;animation:popFade 1.4s ease-out forwards';
        ws.appendChild(p);
        setTimeout(function() { p.remove(); }, 1500);
      }, idx * 40);
    })(i);
  }
}
