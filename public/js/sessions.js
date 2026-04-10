// 세션 관리 — 상태 헬퍼 + 탭 렌더링 + 세션 CRUD
// 로드 순서: log.js 이후, workspace.js 이전
// 의존: state.js(sessions, liveInstances, currentSession, agents, _tabOrder, saveTabOrder)
//       constants.js(SESSION_COLORS)
//       utils.js(esc)
//       api.js(API, fetchMaster, fetchProjectAgents) — hoisting
//       workspace.js(renderList, renderWorkspace, renderAll) — hoisting
//       log.js(renderLogs) — hoisting

// === 상태-의존 헬퍼 ===
function getAgentInfo(aid) { return agents.find(function(a) { return a.id === aid || a.name === aid }) || null }

function getLiveInstances() {
  var arr = Object.values(liveInstances);
  if (currentSession) arr = arr.filter(function(i) { return i.sessionPid === currentSession });
  return arr;
}

function clearInstance(key) {
  var inst = liveInstances[key];
  var pid = inst ? inst.sessionPid : '';
  delete liveInstances[key];
  if (pid && sessions[pid]) {
    var anyWorking = Object.values(liveInstances).some(function(i) { return i.sessionPid === pid && i.st === 'working' });
    if (!anyWorking) { sessions[pid]._masterSt = 'idle'; sessions[pid]._masterTask = '' }
  }
  renderAll();
}

function sessionColor(pid) {
  var pids = Object.keys(sessions).sort();
  var idx = pids.indexOf(pid);
  return SESSION_COLORS[(idx < 0 ? 0 : idx) % SESSION_COLORS.length];
}

// === Session Tabs ===
var sessClickTimer = null;

function mergeSessionData(s, overrides) {
  var prev = sessions[s.pid] || {};
  return {
    pid: s.pid,
    name: s.name || prev.name || 'Session ' + s.pid,
    cwd: s.cwd || prev.cwd || '',
    sid: s.sid || prev.sid || '',
    startTime: s.startTime || prev.startTime || '',
    lastActivity: overrides.lastActivity || prev.lastActivity || '',
    eventCount: overrides.eventCount != null ? overrides.eventCount : (prev.eventCount || 0),
    agentCount: prev.agentCount || 0,
    alive: true,
    _masterSt: prev._masterSt || 'idle',
    _masterTask: prev._masterTask || '',
    _turnCount: prev._turnCount || 0,
    _thinkStart: prev._thinkStart || null,
    _lastDoneTime: prev._lastDoneTime || null,
    _completed: false,
  };
}

function registerSession(s) {
  if (!s || !s.pid) return;
  var isNew = !sessions[s.pid];
  sessions[s.pid] = mergeSessionData(s, {
    lastActivity: new Date().toISOString(),
    eventCount: ((sessions[s.pid] || {}).eventCount || 0) + 1,
  });
  if (!sessions[s.pid].startTime) sessions[s.pid].startTime = new Date().toISOString();
  if (isNew) {
    var wasEmpty = !currentSession;
    if (wasEmpty) currentSession = s.pid;
    renderSessionTabs();
    updateHeaderStat();
    if (wasEmpty && s.cwd) fetchProjectAgents(s.cwd);
  }
  return isNew;
}

function removeSession(pid) {
  if (sessions[pid]) {
    sessions[pid].alive = false;
    Object.keys(liveInstances).forEach(function(k) { if (liveInstances[k].sessionPid === pid) delete liveInstances[k] });
    renderAll();
  }
}

function switchSession(pid) {
  currentSession = pid;
  if (sessions[pid]) delete sessions[pid]._completed;
  renderSessionTabs(); renderLogs(); renderActivity(); renderWorkspace();
  document.getElementById('logFilterLabel').textContent = !pid ? '' : (sessions[pid] ? ' [' + sessions[pid].name + ']' : '');
  // 세션의 프로젝트 CLAUDE.md 로드
  var cwd = (pid && sessions[pid]) ? sessions[pid].cwd : '';
  fetchMaster(cwd);
  fetchProjectAgents(cwd);
}

var _tabsBuilt = false;

// 드래그앤드롭으로 탭 순서 변경 — srcPid를 targetPid의 왼쪽/오른쪽으로 이동
function reorderTab(srcPid, targetPid, before) {
  if (!srcPid || !targetPid || srcPid === targetPid) return;
  // 현재 렌더된 순서 기준으로 재정렬 (표시 순서 = 진실)
  var currentOrder = Array.prototype.map.call(document.querySelectorAll('#sessionTabs .sess-tab'), function(t) { return t.dataset.session; }).filter(Boolean);
  var from = currentOrder.indexOf(srcPid);
  if (from === -1) return;
  currentOrder.splice(from, 1);
  var to = currentOrder.indexOf(targetPid);
  if (to === -1) return;
  currentOrder.splice(to + (before ? 0 : 1), 0, srcPid);
  _tabOrder = currentOrder;
  saveTabOrder();
  _tabsBuilt = ''; renderSessionTabs();
}

function renderSessionTabs() {
  var box = document.getElementById('sessionTabs');
  var pids = Object.keys(sessions);
  // 저장된 _tabOrder 우선 + 저장 안 된 새 세션은 startTime 순서로 뒤에
  pids.sort(function(a, b) {
    var ia = _tabOrder.indexOf(a);
    var ib = _tabOrder.indexOf(b);
    if (ia === -1 && ib === -1) return (sessions[a].startTime || '').localeCompare(sessions[b].startTime || '');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  // _tabOrder에 없는 새 pid를 뒤에 자동 등록 + 닫힌 세션 pruning
  var presentSet = {}; pids.forEach(function(p) { presentSet[p] = true });
  var prunedOrder = _tabOrder.filter(function(p) { return presentSet[p] });
  var newPids = pids.filter(function(p) { return _tabOrder.indexOf(p) === -1 });
  if (newPids.length || prunedOrder.length !== _tabOrder.length) {
    _tabOrder = prunedOrder.concat(newPids);
    saveTabOrder();
  }

  // 탭 구조 변경 감지 (세션 추가/삭제/선택 변경 시에만 전체 재구축)
  var structKey = currentSession + '|' + pids.map(function(p) { return p + ':' + (sessions[p].alive ? '1' : '0') + (sessions[p]._completed ? 'c' : '') }).join(',');
  if (_tabsBuilt === structKey) {
    // 구조 동일 → 기존 탭의 속성만 업데이트 (DOM 재구축 안 함)
    pids.forEach(function(pid) {
      var tab = box.querySelector('[data-session="' + pid + '"]'); if (!tab) return;
      var s = sessions[pid];
      var isStale = !s.alive;
      var isInactive = s.alive && (Date.now() - new Date(s.lastActivity || s.startTime).getTime()) > 600000;
      var cls = 'sess-tab' + (currentSession === pid ? ' active' : '') + (isStale ? ' stale' : isInactive ? ' inactive' : '') + (s._completed ? ' completed' : '');
      if (tab.className !== cls) tab.className = cls;
      // 스피너
      var hasWorking = Object.values(liveInstances).some(function(i) { return i.sessionPid === pid && i.st === 'working' }) || (s._masterSt === 'thinking' || s._masterSt === 'working');
      var spinEl = tab.querySelector('.sess-spinner');
      if (hasWorking && !spinEl) { var sp2 = document.createElement('span'); sp2.className = 'sess-spinner'; tab.insertBefore(sp2, tab.querySelector('.sess-close')) }
      if (!hasWorking && spinEl) spinEl.remove();
    });
    return;
  }

  // 구조 변경 → 전체 재구축
  _tabsBuilt = structKey;
  box.innerHTML = '';
  if (pids.length === 0) { var h = document.createElement('span'); h.className = 'empty-sessions'; h.textContent = t('sessions_waiting'); box.appendChild(h); return }
  // 세션이 있는데 현재 선택이 없거나 삭제된 세션이면 첫 번째 세션 자동 선택
  if (!currentSession || !sessions[currentSession]) { currentSession = pids[0] }
  var nameGroups = {}; pids.forEach(function(p) { var n = sessions[p].name; if (!nameGroups[n]) nameGroups[n] = []; nameGroups[n].push(p) });
  pids.forEach(function(pid) {
    var s = sessions[pid]; var sColor = sessionColor(pid);
    var displayName = s.name; var group = nameGroups[s.name];
    if (group.length > 1) { var nums = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2465', '\u2466', '\u2467', '\u2468', '\u2469']; var idx = group.indexOf(pid); displayName = s.name + ' ' + (nums[idx] || '(' + (idx + 1) + ')') }
    var lastAct = new Date(s.lastActivity || s.startTime).getTime();
    var isStale = !s.alive;
    var isInactive = s.alive && (Date.now() - lastAct) > 600000;
    var tab = document.createElement('button'); tab.className = 'sess-tab' + (currentSession === pid ? ' active' : '') + (isStale ? ' stale' : isInactive ? ' inactive' : '') + (s._completed ? ' completed' : ''); tab.dataset.session = pid; tab.draggable = true;
    (function(p) {
      tab.onclick = function(e) { if (e.target.classList.contains('sess-close') || e.target.classList.contains('sess-rename')) return; if (sessClickTimer) return; sessClickTimer = setTimeout(function() { sessClickTimer = null; switchSession(p) }, 280) };
      tab.ondblclick = function(e) { e.preventDefault(); if (sessClickTimer) { clearTimeout(sessClickTimer); sessClickTimer = null } startRenameSession(p) };
      // === 드래그앤드롭 ===
      tab.ondragstart = function(e) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p); tab.classList.add('dragging') };
      tab.ondragend = function() { tab.classList.remove('dragging'); document.querySelectorAll('#sessionTabs .sess-tab').forEach(function(t) { t.classList.remove('drop-left', 'drop-right') }) };
      tab.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; var rect = tab.getBoundingClientRect(); var isLeft = e.clientX < rect.left + rect.width / 2; tab.classList.toggle('drop-left', isLeft); tab.classList.toggle('drop-right', !isLeft) };
      tab.ondragleave = function() { tab.classList.remove('drop-left', 'drop-right') };
      tab.ondrop = function(e) { e.preventDefault(); var srcPid = e.dataTransfer.getData('text/plain'); if (!srcPid || srcPid === p) return; var rect = tab.getBoundingClientRect(); var isLeft = e.clientX < rect.left + rect.width / 2; reorderTab(srcPid, p, isLeft) };
    })(pid);
    var dot = document.createElement('span'); dot.className = 'sess-dot'; dot.style.background = s.alive ? sColor : 'var(--text-secondary)'; dot.style.boxShadow = s.alive ? '0 0 4px ' + sColor : 'none'; dot.style.opacity = s.alive ? '1' : '.4'; tab.appendChild(dot);
    var ns = document.createElement('span'); ns.className = 'sess-name-text'; ns.textContent = displayName; tab.appendChild(ns);
    var hasWorking = Object.values(liveInstances).some(function(i) { return i.sessionPid === pid && i.st === 'working' }) || (s._masterSt === 'thinking' || s._masterSt === 'working');
    if (hasWorking) { var sp2 = document.createElement('span'); sp2.className = 'sess-spinner'; tab.appendChild(sp2) }
    var cl = document.createElement('span'); cl.className = 'sess-close'; cl.textContent = '\u00d7'; cl.draggable = false; cl.onmousedown = function(e) { e.stopPropagation() }; cl.onclick = function(e) { e.stopPropagation(); delete sessions[pid]; Object.keys(liveInstances).forEach(function(k) { if (liveInstances[k].sessionPid === pid) delete liveInstances[k] }); if (currentSession === pid) { var remaining = Object.keys(sessions); currentSession = remaining.length > 0 ? remaining[0] : null } _tabsBuilt = ''; renderAll() }; tab.appendChild(cl);
    box.appendChild(tab);
  });
}

function startRenameSession(pid) {
  var s = sessions[pid]; if (!s) return;
  var tabEl = document.querySelector('.sess-tab[data-session="' + pid + '"]'); if (!tabEl) return;
  var nameEl = tabEl.querySelector('.sess-name-text'); if (!nameEl) return;
  var input = document.createElement('input'); input.className = 'sess-rename'; input.value = s.name;
  var committed = false;
  function commitRename() { if (committed) return; committed = true; doRename(pid, input.value.trim()) }
  input.onclick = function(e) { e.stopPropagation() };
  input.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); commitRename() } if (e.key === 'Escape') { committed = true; renderSessionTabs() } };
  input.onblur = function() { commitRename() };
  nameEl.replaceWith(input); input.focus(); input.select();
}

function doRename(pid, n) {
  if (!n || !sessions[pid] || n === sessions[pid].name) { _tabsBuilt = ''; renderSessionTabs(); return }
  fetch(API + '/api/sessions/' + pid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) }).then(function(r) { return r.json() }).then(function(res) { if (res.ok) { sessions[pid].name = n; toast(n) } _tabsBuilt = ''; renderSessionTabs() }).catch(function() { _tabsBuilt = ''; renderSessionTabs() });
}

function updateHeaderStat() {
  var alive = Object.values(sessions).filter(function(s) { return s.alive }).length;
  var inst = Object.values(liveInstances).filter(function(i) { return i.st === 'working' }).length;
  var el = document.getElementById('headerStat');
  el.innerHTML = '<strong>' + alive + '</strong> session' + (alive !== 1 ? 's' : '') + ' &middot; <strong>' + inst + '</strong> active';
}
