// 에이전트/마스터 설정 모달
// 로드 순서: mcp-hooks 이후, server-control 이전
// 의존: state.js(agents, editingId, masterTab, masterData, API)
//       constants.js(ALL_TOOLS)
//       api.js(saveAgentAPI, deleteAgentAPI, fetchAgents) — hoisting
//       server-control.js(toast) — hoisting

// 모달 열 때 항상 스크롤을 맨 위로 (이전 편집 위치가 유지되는 문제 방지)
// setTimeout 0: overlay show로 display 변경된 직후에 적용해야 scrollTop이 반영됨
function resetModalScroll() {
  setTimeout(function() {
    var b = document.querySelector('.modal .modal-body'); if (b) b.scrollTop = 0;
    var fb = document.getElementById('fBody'); if (fb) fb.scrollTop = 0;
    var fm = document.getElementById('fMaster'); if (fm) fm.scrollTop = 0;
  }, 0);
}

function openEdit(id) {
  var ag = agents.find(function(a) { return a.id === id }); if (!ag) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = ag.name;
  document.getElementById('fName').value = ag.name;
  document.getElementById('fName').disabled = true;
  document.getElementById('fDesc').value = ag.description;
  document.getElementById('fModel').value = ag.model;
  document.getElementById('fBody').value = ag.body || '';
  document.getElementById('btnDel').style.display = '';
  renderToolsGrid(ag.tools || []);
  document.getElementById('agentFields').style.display = '';
  document.getElementById('masterFields').style.display = 'none';
  document.getElementById('btnSave').onclick = saveAgent;
  document.getElementById('btnDel').onclick = deleteAgent;
  document.getElementById('overlay').classList.add('show');
  resetModalScroll();
}

function openNew() {
  editingId = null;
  document.getElementById('modalTitle').textContent = '\uC0C8 \uC5D0\uC774\uC804\uD2B8';
  document.getElementById('fName').value = '';
  document.getElementById('fName').disabled = false;
  document.getElementById('fDesc').value = '';
  document.getElementById('fModel').value = 'sonnet';
  document.getElementById('fBody').value = '';
  document.getElementById('btnDel').style.display = 'none';
  renderToolsGrid(['Read', 'Glob', 'Grep']);
  document.getElementById('agentFields').style.display = '';
  document.getElementById('masterFields').style.display = 'none';
  document.getElementById('btnSave').onclick = saveAgent;
  document.getElementById('btnDel').onclick = deleteAgent;
  document.getElementById('overlay').classList.add('show');
  resetModalScroll();
}

function openMaster() {
  editingId = 'master'; masterTab = 'global';
  document.getElementById('modalTitle').textContent = '\u2605 Master';
  document.getElementById('agentFields').style.display = 'none';
  document.getElementById('masterFields').style.display = '';
  document.getElementById('btnSave').onclick = saveAgent;
  document.getElementById('btnDel').style.display = 'none';
  document.getElementById('fMaster').value = masterData.global || '';
  document.getElementById('masterFileLabel').textContent = masterData.globalPath || '~/CLAUDE.md';
  updateMasterTabs();
  document.getElementById('overlay').classList.add('show');
  resetModalScroll();
}

function switchMasterTab(t) {
  masterTab = t;
  document.getElementById('fMaster').value = t === 'global' ? (masterData.global || '') : (masterData.project || '');
  document.getElementById('masterFileLabel').textContent = t === 'global' ? (masterData.globalPath || '~/CLAUDE.md') : (masterData.projectPath || 'project/CLAUDE.md');
  updateMasterTabs();
}

function updateMasterTabs() {
  var bs = document.querySelectorAll('#masterTabs button');
  bs.forEach(function(b, i) { b.className = (i === 0 && masterTab === 'global') || (i === 1 && masterTab === 'project') ? 'active' : '' });
}

function closeModal() {
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('agentFields').style.display = '';
  document.getElementById('masterFields').style.display = 'none';
}

var TOOL_TIPS = { Read: '\uD30C\uC77C \uC77D\uAE30', Write: '\uC0C8 \uD30C\uC77C \uC0DD\uC131', Edit: '\uAE30\uC874 \uD30C\uC77C \uC218\uC815', Glob: '\uD30C\uC77C \uAC80\uC0C9 (\uD328\uD134)', Grep: '\uB0B4\uC6A9 \uAC80\uC0C9', Bash: '\uD130\uBBF8\uB110 \uBA85\uB839 \uC2E4\uD589', Agent: '\uB2E4\uB978 \uC5D0\uC774\uC804\uD2B8 \uD638\uCD9C', WebFetch: 'URL \uB0B4\uC6A9 \uAC00\uC838\uC624\uAE30', WebSearch: '\uC6F9 \uAC80\uC0C9', NotebookEdit: '\uB178\uD2B8\uBD81 \uD3B8\uC9D1' };

function renderToolsGrid(sel) {
  var g = document.getElementById('toolsGrid'); g.innerHTML = '';
  ALL_TOOLS.forEach(function(t) {
    var c = document.createElement('span');
    c.className = 'tool-chip' + (sel.indexOf(t) >= 0 ? ' sel' : '');
    c.textContent = t;
    c.dataset.tip = TOOL_TIPS[t] || t;
    c.onclick = function() { c.classList.toggle('sel') };
    g.appendChild(c);
  });
}

function getSelectedTools() {
  var cs = document.querySelectorAll('#toolsGrid .tool-chip.sel');
  var t = [];
  cs.forEach(function(c) { t.push(c.textContent) });
  return t;
}

function saveAgent() {
  if (editingId === 'master') {
    var ct = document.getElementById('fMaster').value;
    var saveCwd = masterData.cwd || '';
    fetch(API + '/api/master/' + masterTab, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: ct, cwd: saveCwd }) }).then(function(r) { return r.json() }).then(function(r) {
      if (r.ok) {
        toast(masterTab === 'global' ? '~/CLAUDE.md \uC800\uC7A5' : (r.path || '\uD504\uB85C\uC81D\uD2B8') + ' \uC800\uC7A5');
        if (masterTab === 'global') masterData.global = ct; else masterData.project = ct;
      } else toast('\uC2E4\uD328', 'err');
    }).catch(function() { toast('\uC5F0\uACB0 \uC2E4\uD328', 'err') });
    return;
  }
  var name = document.getElementById('fName').value.trim();
  if (!name) { toast('\uC774\uB984 \uD544\uC694', 'err'); return }
  var d = { id: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'), name: name, description: document.getElementById('fDesc').value.trim(), model: document.getElementById('fModel').value, tools: getSelectedTools(), body: document.getElementById('fBody').value };
  var isNew = editingId === null;
  var id = isNew ? d.id : editingId;
  saveAgentAPI(id, d, isNew).then(function(r) { if (r.ok) { toast(id + '.md \uC800\uC7A5'); closeModal(); fetchAgents() } else toast('\uC2E4\uD328', 'err') }).catch(function() { toast('\uC5F0\uACB0 \uC2E4\uD328', 'err') });
}

var delConfirmTimer = null;

function deleteAgent() {
  if (!editingId) return;
  var btn = document.getElementById('btnDel');
  if (btn.dataset.confirm === '1') {
    clearTimeout(delConfirmTimer);
    btn.dataset.confirm = ''; btn.textContent = '\uC0AD\uC81C'; btn.style.background = ''; btn.style.color = '';
    deleteAgentAPI(editingId).then(function(r) { if (r.ok) { toast(editingId + ' \uC0AD\uC81C'); closeModal(); fetchAgents() } }).catch(function() { toast('\uC2E4\uD328', 'err') });
  } else {
    btn.dataset.confirm = '1'; btn.textContent = '\uC815\uB9D0 \uC0AD\uC81C?'; btn.style.background = 'var(--negative)'; btn.style.color = '#fff';
    delConfirmTimer = setTimeout(function() { btn.dataset.confirm = ''; btn.textContent = '\uC0AD\uC81C'; btn.style.background = ''; btn.style.color = '' }, 3000);
  }
}
