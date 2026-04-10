// 서버 API 호출 모듈 — 모든 fetch/save/delete 엔드포인트 래퍼
// 로드 순서: animations 이후, log.js 이전
// 의존: state.js(API, agents, projectAgents, sessions, currentSession, masterData)
//       utils.js(agColor, esc)
//       sessions.js(renderSessionTabs, updateHeaderStat) — hoisting으로 해결 (콜백 안)
//       workspace.js(renderAll, renderMasterCard, _wsBuilt) — hoisting
//       stats.js, mcp-hooks.js, server-control.js 일부 의존

function setConn(ok) {}

function fetchAgents() {
  fetch(API + '/api/agents').then(function(r) { return r.json() }).then(function(data) {
    agents = data.map(function(a, i) { a.color = agColor(a.id, i); a.active = true; return a });
    setConn(true);
    renderAll();
  }).catch(function() {
    setConn(false);
    document.getElementById('agentList').innerHTML = '<div style="color:var(--negative);font-size:.6rem;font-family:monospace;padding:14px;text-align:center">\uC11C\uBC84 \uC5F0\uACB0 \uC2E4\uD328</div>';
  });
}

function fetchProjectAgents(cwd) {
  if (!cwd) { projectAgents = { hasRestriction: false, enabled: [] }; renderAll(); return }
  fetch(API + '/api/project-agents?cwd=' + encodeURIComponent(cwd)).then(function(r) { return r.json() }).then(function(d) {
    projectAgents = d; _wsBuilt = false; renderAll();
  }).catch(function() { projectAgents = { hasRestriction: false, enabled: [] }; renderAll() });
}

function saveProjectAgents(enabled) {
  var pid = currentSession;
  var cwd = (pid && sessions[pid]) ? sessions[pid].cwd : '';
  if (!cwd) { toast(_lang === 'en' ? 'No project path' : '프로젝트 경로 없음', 'err'); return }
  fetch(API + '/api/project-agents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd: cwd, enabled: enabled, hasRestriction: true }) }).then(function(r) { return r.json() }).then(function(r) {
    if (r.ok) { projectAgents = { hasRestriction: true, enabled: enabled }; _wsBuilt = false; renderAll(); fetchMaster(cwd); toast(_lang === 'en' ? 'Agent settings saved' : '에이전트 설정 저장') }
    else toast(_lang === 'en' ? 'Failed' : '실패', 'err');
  }).catch(function() { toast(t('shop_connect_fail'), 'err') });
}

function fetchMaster(cwd) {
  var url = API + '/api/master';
  if (cwd) url += '?cwd=' + encodeURIComponent(cwd);
  fetch(url).then(function(r) { return r.json() }).then(function(d) { masterData = d; renderMasterCard() }).catch(function() {});
}

function fetchSessions() {
  fetch(API + '/api/sessions').then(function(r) { return r.json() }).then(function(d) {
    d.forEach(function(s) {
      sessions[s.pid] = mergeSessionData(s, {
        lastActivity: s.lastActivity,
        eventCount: s.eventCount || ((sessions[s.pid] || {}).eventCount || 0),
      });
    });
    renderSessionTabs(); updateHeaderStat();
    var cwd = (currentSession && sessions[currentSession]) ? sessions[currentSession].cwd : '';
    if (cwd && agents.length > 0) fetchProjectAgents(cwd);
  }).catch(function() {});
}

function saveAgentAPI(id, d, n) {
  return fetch(n ? API + '/api/agents' : API + '/api/agents/' + id, { method: n ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(function(r) { return r.json() });
}

function deleteAgentAPI(id) {
  return fetch(API + '/api/agents/' + id, { method: 'DELETE' }).then(function(r) { return r.json() });
}

function fetchMcpServers() {
  fetch(API + '/api/mcp').then(function(r) { return r.json() }).then(function(data) {
    mcpServers = data; renderMcpList();
  }).catch(function() {});
}

function fetchHooks() {
  fetch(API + '/api/hooks').then(function(r) { return r.json() }).then(function(data) {
    hooksData = data; renderHooksList();
  }).catch(function() {});
}

function fetchDailyStats() {
  fetch(API + '/api/stats').then(function(r) { return r.json() }).then(function(data) {
    dailyStatsData = data; renderDailyStat();
  }).catch(function() {});
}
