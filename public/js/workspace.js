// 워크스페이스 + 에이전트 목록 + Master 카드 렌더
// 로드 순서: sessions 이후, panels 이전
// 의존: state.js(agents, projectAgents, currentSession, sessions, liveInstances, currentTheme, masterData)
//       constants.js(AGENT_ACCESSORIES)
//       utils.js(esc, buildPix, agColor)
//       sessions.js(getLiveInstances) — hoisting
//       creature.js(creatureLife) — hoisting
//       api.js, modal.js 등은 event callback 안에서만 참조 → hoisting OK

function renderMasterCard() {
  var box = document.getElementById('masterCard');
  var card = document.createElement('div'); card.className = 'master-card'; card.onclick = function() { openMaster() };
  var row = document.createElement('div'); row.className = 'ag-row'; row.appendChild(buildPix('master', '#fbbf24', 'sm'));
  var info = document.createElement('div'); info.innerHTML = '<div class="ag-name" style="color:#fbbf24">\u2605 Master</div><div class="ag-desc">CLAUDE.md \uC124\uC815</div>';
  row.appendChild(info); card.appendChild(row);
  var files = document.createElement('div'); files.className = 'master-files';
  var projLabel = masterData.projectPath ? masterData.projectPath.replace(/^\/Users\/[^/]+/, '~') : '';
  files.innerHTML = '<div class="mf"><span class="dot" style="background:var(--positive)"></span>~/CLAUDE.md</div>' + (masterData.project ? '<div class="mf"><span class="dot" style="background:var(--accent)"></span>' + esc(projLabel) + '</div>' : '<div class="mf"><span class="dot" style="background:var(--text-secondary)"></span>\uD504\uB85C\uC81D\uD2B8 CLAUDE.md \uC5C6\uC74C</div>');
  card.appendChild(files); box.innerHTML = ''; box.appendChild(card);
}

function renderList() {
  var left = document.querySelector('.left'); var scrollPos = left ? left.scrollTop : 0;
  var box = document.getElementById('agentList'); box.innerHTML = '';
  var hasCwd = currentSession && sessions[currentSession] && sessions[currentSession].cwd;
  agents.forEach(function(ag) {
    var isEnabled = !projectAgents.hasRestriction || projectAgents.enabled.indexOf(ag.id) >= 0;
    var card = document.createElement('div'); card.className = 'ag on' + (isEnabled ? '' : ' disabled');
    card.onclick = function() { openEdit(ag.id) };
    // 어딘가에서 working 중이면 라이브 dot
    var isLive = Object.values(liveInstances).some(function(inst) { return inst.agentId === ag.id && inst.st === 'working' });
    if (isLive) { var dot = document.createElement('span'); dot.className = 'ag-live'; card.appendChild(dot) }
    // 프로젝트별 토글 (Master idle일 때만)
    if (hasCwd) {
      var csMst = currentSession && sessions[currentSession] ? sessions[currentSession]._masterSt || 'idle' : 'idle';
      var masterBusy = csMst === 'thinking' || csMst === 'working';
      var isLocked = isLive || masterBusy;
      var toggle = document.createElement('span'); toggle.className = 'ag-toggle' + (isEnabled ? ' on' : '') + (isLocked ? ' locked' : '');
      toggle.dataset.tip = isLocked ? '작업 중 — 변경 불가' : (isEnabled ? '이 프로젝트에서 활성' : '이 프로젝트에서 비활성');
      (function(agId, en) {
        toggle.onclick = function(e) {
          e.stopPropagation();
          // 클릭 시점에 실시간 체크
          var csMst2 = currentSession && sessions[currentSession] ? sessions[currentSession]._masterSt || 'idle' : 'idle';
          var busy = csMst2 === 'thinking' || csMst2 === 'working';
          var working = Object.values(liveInstances).some(function(i) { return i.agentId === agId && i.st === 'working' });
          if (busy || working) { toast('작업 중에는 변경할 수 없습니다'); return }
          var newEnabled;
          if (!projectAgents.hasRestriction) {
            newEnabled = agents.map(function(a) { return a.id }).filter(function(id) { return id !== agId });
          } else if (en) {
            newEnabled = projectAgents.enabled.filter(function(id) { return id !== agId });
          } else {
            newEnabled = projectAgents.enabled.concat([agId]);
          }
          if (newEnabled.length >= agents.length) {
            fetch(API + '/api/project-agents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd: (currentSession && sessions[currentSession]) ? sessions[currentSession].cwd : '', enabled: [], hasRestriction: false }) }).then(function(r) { return r.json() }).then(function(r) {
              if (r.ok) { projectAgents = { hasRestriction: false, enabled: [] }; _wsBuilt = false; renderAll(); var cwdR = (currentSession && sessions[currentSession]) ? sessions[currentSession].cwd : ''; fetchMaster(cwdR); toast('에이전트 제한 해제') }
            }).catch(function() { toast('연결 실패', 'err') });
          } else { saveProjectAgents(newEnabled) }
        };
      })(ag.id, isEnabled);
      card.appendChild(toggle);
    }
    var row = document.createElement('div'); row.className = 'ag-row'; row.appendChild(buildPix(ag.id, ag.color, 'sm', ag.model));
    var info = document.createElement('div'); info.innerHTML = '<div class="ag-name" style="color:' + esc(ag.color) + '">' + esc(ag.name) + '</div><div class="ag-desc">' + esc(ag.description) + '</div>';
    row.appendChild(info); card.appendChild(row);
    var meta = document.createElement('div'); meta.className = 'ag-meta'; meta.innerHTML = '<span class="ag-tag model-' + esc(ag.model) + '">' + esc(ag.model) + '</span>';
    (ag.tools || []).forEach(function(t) { meta.innerHTML += '<span class="ag-tag">' + esc(t) + '</span>' });
    card.appendChild(meta);
    box.appendChild(card);
  });
  if (left) left.scrollTop = scrollPos;
}

var _wsBuilt = false;

function renderWorkspace() {
  var ws = document.getElementById('workspace');

  // 항상 Master + 활성 에이전트만 표시
  var nodes = [{ wsId: 'master', id: 'master', name: 'Master', color: '#fbbf24', model: '' }];
  agents.filter(function(a) {
    if (!a.active) return false;
    if (projectAgents.hasRestriction && projectAgents.enabled.indexOf(a.id) < 0) return false;
    return true;
  }).forEach(function(ag) {
    nodes.push({ wsId: ag.id, id: ag.id, name: ag.name, color: ag.color, model: ag.model });
  });

  // 정의되지 않은 에이전트(Explore 등)도 활동 중이면 동적 추가
  var instances = !currentSession ? Object.values(liveInstances) : getLiveInstances();
  var definedIds = nodes.map(function(n) { return n.id });
  var knownAgentIds = agents.map(function(a) { return a.id });
  instances.forEach(function(inst) {
    // 정의된 에이전트는 토글로 관리하므로 동적 추가 안 함
    if (inst.agentId && knownAgentIds.indexOf(inst.agentId) >= 0) return;
    if (inst.agentId && definedIds.indexOf(inst.agentId) === -1) {
      if (!nodes.find(function(n) { return n.id === inst.agentId })) {
        nodes.push({ wsId: inst.agentId, id: inst.agentId, name: inst.agentId, color: inst.color || agColor(inst.agentId, nodes.length), model: '', _dynamic: true });
        definedIds.push(inst.agentId);
      }
    }
  });

  // 라이브 인스턴스와 매칭 → 상태 결정
  nodes.forEach(function(nd) {
    if (nd.id === 'master') {
      var cs = currentSession && sessions[currentSession] ? sessions[currentSession] : null;
      var anyWorking = instances.some(function(i) { return i.st === 'working' });
      var sessMst = cs ? cs._masterSt || 'idle' : 'idle';
      nd._st = anyWorking ? 'working' : sessMst;
      nd._task = cs ? cs._masterTask || '' : '';
      return;
    }
    // 이 에이전트의 working 인스턴스 찾기
    var match = instances.find(function(inst) { return inst.agentId === nd.id && inst.st === 'working' });
    if (!match) match = instances.find(function(inst) { return inst.agentId === nd.id });
    if (match) {
      // done 후 10초 지나면 Workspace에서 idle 복귀 (Activity는 done 유지)
      if (match.st === 'done' && match.doneTime && (Date.now() - match.doneTime) > 5000) {
        nd._st = 'idle'; nd._task = ''; nd.sessionName = '';
      } else {
        nd._st = match.st; nd._task = match.task; nd.sessionName = match.sessionName;
      }
    } else {
      nd._st = 'idle'; nd._task = ''; nd.sessionName = '';
    }
  });

  // DOM 구조는 에이전트 추가/삭제 시에만 재구축
  var structKey = nodes.map(function(n) { return n.wsId }).join(',');
  if (_wsBuilt !== structKey) {
    _wsBuilt = structKey;
    // 기존 요소 유지, 새 요소만 추가, 불필요한 요소만 제거 (깜빡임 방지)
    var positions = getPositions(nodes.length);
    var existingIds = {};
    ws.querySelectorAll('.ws-agent').forEach(function(el) { existingIds[el.id] = true });
    // 삭제된 노드 제거
    ws.querySelectorAll('.ws-agent').forEach(function(el) {
      var wid = el.id.replace('ws-', '');
      if (!nodes.find(function(n) { return n.wsId === wid })) el.remove();
    });
    // 새 노드 추가 (기존 노드는 건드리지 않음)
    nodes.forEach(function(nd, i) {
      if (existingIds['ws-' + nd.wsId]) return;
      var el = document.createElement('div'); el.className = 'ws-agent ' + (nd._st || 'idle'); el.id = 'ws-' + nd.wsId; el.dataset.st = nd._st || 'idle';
      var savedPos = creatureLife[nd.wsId];
      el.style.left = (savedPos ? savedPos.x : positions[i].x) + '%'; el.style.top = (savedPos ? savedPos.y : positions[i].y) + '%'; el.style.transform = 'translate(-50%,-50%)';
      el.style.setProperty('--rnd-delay', (Math.random() * 3).toFixed(2) + 's');
      el.style.setProperty('--rnd-dur', (0.8 + Math.random() * 0.6).toFixed(2));
      var pixWrap = document.createElement('div'); pixWrap.style.position = 'relative';
      pixWrap.appendChild(buildPix(nd.id, nd.color, 'lg', nd.model));
      // 악세서리
      var acc = AGENT_ACCESSORIES[nd.id];
      if (acc) { var accEl = document.createElement('span'); accEl.className = 'ws-accessory'; accEl.textContent = acc; pixWrap.appendChild(accEl) }
      el.appendChild(pixWrap);
      var lbl = document.createElement('div'); lbl.className = 'ws-label';
      if (nd.id === 'master') lbl.innerHTML = '<span style="color:#c084fc">Master</span><span class="ws-badge" style="background:rgba(251,191,36,.15);color:#fbbf24">SESSION</span>';
      else lbl.innerHTML = esc(nd.name) + '<span class="ws-badge model-' + esc(nd.model || 'sonnet') + '">' + esc((nd.model || '').toUpperCase()) + '</span>';
      el.appendChild(lbl);
      var bub = document.createElement('div'); bub.className = 'ws-bubble'; bub.textContent = nd._task || ''; if (!nd._task) bub.style.display = 'none'; el.appendChild(bub);
      ws.appendChild(el);
    });
    startAmbient(ws);
  } else {
    // 상태만 업데이트 (위치 변경 없음)
    nodes.forEach(function(nd) {
      var el = document.getElementById('ws-' + nd.wsId); if (!el) return;
      var prevSt = el.dataset.st || 'idle';
      el.className = 'ws-agent ' + (nd._st || 'idle');
      el.dataset.st = nd._st || 'idle';
      // idle → working 전환 시 현재 위치 그대로 (그 자리에서 일 시작)
      var bub = el.querySelector('.ws-bubble');
      if (bub) { bub.textContent = nd._task || ''; bub.style.display = nd._task ? '' : 'none' }
    });
  }
  // 상태별 이펙트: 아우라 (working), 이모션 (done)
  nodes.forEach(function(nd) {
    var el = document.getElementById('ws-' + nd.wsId); if (!el) return;
    var st = nd._st || 'idle';
    // 아우라 (working)
    var aura = el.querySelector('.ws-aura');
    if (st === 'working') {
      if (!aura) {
        aura = document.createElement('div'); aura.className = 'ws-aura';
        var MODEL_AURA = { opus: '#fbbf24', sonnet: '#00ffc8', haiku: '#f472b6' };
        var ac = MODEL_AURA[nd.model] || nd.color;
        for (var p = 0; p < 6; p++) { var dot = document.createElement('i'); dot.style.background = ac; dot.style.setProperty('--ax', (Math.random() * 30 - 15) + 'px'); dot.style.setProperty('--ay', (Math.random() * -25 - 5) + 'px'); dot.style.left = (20 + Math.random() * 60) + '%'; dot.style.top = (20 + Math.random() * 60) + '%'; dot.style.animationDelay = (p * 0.33) + 's'; dot.style.animationDuration = (1.5 + Math.random()) + 's'; aura.appendChild(dot) }
        el.appendChild(aura);
      }
    } else { if (aura) aura.remove() }
    // 이모션: working/done (idle은 creature 시스템에서 제어)
    if (st !== 'idle') {
      var zzz = el.querySelector('.ws-zzz'); if (zzz) zzz.remove();
      var pix = el.querySelector('.pix-lg'); if (!pix) return;
      var eyes = pix.querySelectorAll('i[data-eye]');
      var normalEye = currentTheme === 'dark' ? '#080810' : '#1a1a1a';
      eyes.forEach(function(eye) {
        if (st === 'done') { eye.style.background = '#10b981'; eye.style.borderRadius = '50%'; eye.style.transform = 'scaleY(.4)' }
        else { eye.style.background = normalEye; eye.style.borderRadius = '0'; eye.style.transform = '' }
      });
    }
  });

  // 상태 텍스트
  var stEl = ws.querySelector('.ws-status');
  var working = instances.filter(function(i) { return i.st === 'working' }).length;
  var statusText = '';
  if (!currentSession) { var sc = Object.keys(sessions).length; statusText = sc + ' session' + (sc !== 1 ? 's' : '') + ' \u00b7 ' + agents.length + ' agents' }
  else if (working > 0) { statusText = working + ' working' }
  if (statusText) {
    if (!stEl) { stEl = document.createElement('div'); stEl.className = 'ws-status'; ws.appendChild(stEl) }
    stEl.textContent = statusText;
  } else if (stEl) { stEl.remove() }

  // 연결선 제거됨 — 방방 뛰기 + 말풍선 + 액티비티 + 타임라인으로 충분
}

var _ambientRunning = false;

function startAmbient(ws) {
  if (_ambientRunning) return;
  _ambientRunning = true;
  var colors = ['#00ffc8', '#a78bfa', '#fbbf24', '#00d4ff', '#f472b6', '#84cc16'];
  setInterval(function() {
    if (!document.getElementById('workspace')) return;
    var p = document.createElement('div'); p.className = 'ambient';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = Math.random() * 100 + '%';
    p.style.top = (Math.random() * 100) + '%';
    p.style.setProperty('--dx', (Math.random() * 40 - 20) + 'px');
    p.style.animationDuration = (4 + Math.random() * 5) + 's';
    var size = 2 + Math.random() * 3;
    p.style.width = size + 'px'; p.style.height = size + 'px';
    ws.appendChild(p);
    setTimeout(function() { p.remove() }, 9000);
  }, 500);
}

function getPositions(n) {
  if (n === 0) return [];
  if (n === 1) return [{ x: 50, y: 68 }];

  var pos = [{ x: 50, y: 62 }];
  var rest = n - 1;
  // 간격: 에이전트 수에 따라 조절 (최소 14%, 최대 22%)
  var gap = Math.max(14, Math.min(22, 80 / rest));

  if (rest <= 4) {
    var startX = 50 - ((rest - 1) * gap) / 2;
    for (var i = 0; i < rest; i++) pos.push({ x: startX + i * gap, y: 74 });
  } else if (rest <= 8) {
    var row1 = Math.ceil(rest / 2);
    var row2 = rest - row1;
    var startX1 = 50 - ((row1 - 1) * gap) / 2;
    for (var i = 0; i < row1; i++) pos.push({ x: startX1 + i * gap, y: 45 });
    var startX2 = 50 - ((row2 - 1) * gap) / 2;
    for (var i = 0; i < row2; i++) pos.push({ x: startX2 + i * gap, y: 78 });
  } else {
    // 3줄
    var perRow = Math.ceil(rest / 3);
    var rows = [[], [], []];
    for (var i = 0; i < rest; i++) rows[Math.floor(i / perRow)].push(i);
    var yPositions = [35, 58, 81];
    rows.forEach(function(row, ri) {
      var g = Math.max(12, 80 / row.length);
      var sx = 50 - ((row.length - 1) * g) / 2;
      row.forEach(function(_, ci) { pos.push({ x: sx + ci * g, y: yPositions[ri] }) });
    });
  }
  return pos;
}
