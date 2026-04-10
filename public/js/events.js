// SSE 연결 + 이벤트 핸들러 (이벤트 타입별 분리, dispatch는 handleLiveEvent)
// 로드 순서: server-control 이후, main 이전
// 의존: state.js(sessions, liveInstances, currentSession, API)
//       utils.js(instKey, agColor)
//       sessions.js(registerSession, removeSession, renderSessionTabs, getAgentInfo) — hoisting
//       log.js(addLog) — hoisting
//       workspace.js/panels.js(renderAll, renderActivity, _tlOpen, toggleTimeline DOM id) — hoisting
//       stats.js(updateDailyStatFromEvent) — hoisting
//       animations.js(sparks, flyDot, celebrate) — hoisting
//       notifications.js(sendNotif) — hoisting
//       history.js(fetchHistory) — hoisting
//       api.js(setConn) — hoisting

// === SSE ===
var evtSource = null;

function connectSSE() {
  if (evtSource) { try { evtSource.close() } catch (e) {} }
  evtSource = new EventSource(API + '/api/stream');
  evtSource.onmessage = function(e) { try { handleLiveEvent(JSON.parse(e.data)) } catch (ex) { console.error('[agent-viz] SSE event error:', ex, 'data:', e.data) } };
  var _lastSyncTime = 0;
  evtSource.onopen = function() {
    setConn(true);
    // 재연결 시 서버에 없는 세션 정리 (5초 디바운스)
    var now = Date.now();
    if (now - _lastSyncTime < 5000) return;
    _lastSyncTime = now;
    fetch(API + '/api/sessions').then(function(r) { return r.json() }).then(function(serverSessions) {
      var serverPids = {}; serverSessions.forEach(function(s) { serverPids[s.pid] = true });
      var removed = false;
      Object.keys(sessions).forEach(function(pid) { if (!serverPids[pid]) { delete sessions[pid]; Object.keys(liveInstances).forEach(function(k) { if (liveInstances[k].sessionPid === pid) delete liveInstances[k] }); removed = true } });
      if (removed) { if (currentSession && !sessions[currentSession]) { var remaining = Object.keys(sessions); currentSession = remaining.length > 0 ? remaining[0] : null } _tabsBuilt = ''; renderAll() }
    }).catch(function() {});
  };
  evtSource.onerror = function() { setConn(false) };
}

// === SSE 이벤트 핸들러 (이벤트 타입별 분리, dispatch는 handleLiveEvent) ===
function _handleSessionRegistered(data) {
  if (data.session) registerSession(data.session);
  addLog(null, '\uC138\uC158: ' + (data.session ? data.session.name : ''), 'ok', data.session ? data.session.pid : '', data.session ? data.session.name : '');
}

function _handleSessionRenamed(data, sp, sn) {
  if (!sessions[sp]) return;
  sessions[sp].name = data.session_name || sn;
  _tabsBuilt = ''; // 캐시 무효화 → 탭 DOM 재구성
  renderSessionTabs();
  // 로그 필터 라벨도 갱신
  if (currentSession === sp) {
    var lblEl = document.getElementById('logFilterLabel');
    if (lblEl) lblEl.textContent = ' [' + sessions[sp].name + ']';
  }
}

function _handleSessionStopped(data) {
  var stoppedPid = data.session_pid;
  if (sessions[stoppedPid]) { sessions[stoppedPid].alive = false; renderAll() }
  addLog(null, '\uC138\uC158 \uC885\uB8CC: ' + (data.session_name || stoppedPid), 'err', stoppedPid, data.session_name);
  // 탭에 closing 애니메이션 (10초 카운트다운 바)
  var closingTab = document.querySelector('.sess-tab[data-session="' + stoppedPid + '"]');
  if (closingTab) { closingTab.classList.add('closing'); var spinEl = closingTab.querySelector('.sess-spinner'); if (spinEl) spinEl.remove() }
  // 히스토리 패널 열려있으면 갱신 (서버 저장 완료 대기 후)
  setTimeout(function() { if (document.getElementById('histOverlay').classList.contains('show')) fetchHistory() }, 1000);
  // 10초 후 자동 제거
  if (stoppedPid) (function(pid) {
    setTimeout(function() {
      if (sessions[pid] && sessions[pid].alive === false && currentSession !== pid) {
        delete sessions[pid];
        Object.keys(liveInstances).forEach(function(k) { if (liveInstances[k].sessionPid === pid) delete liveInstances[k] });
        renderAll();
        addLog(null, '\uC138\uC158 \uD0ED \uC81C\uAC70: ' + (data.session_name || pid), '', pid, data.session_name || '');
      }
    }, 10000);
  })(stoppedPid);
}

function _handleSessionRemoved(data) {
  removeSession(data.session_pid);
  addLog(null, '\uC138\uC158 \uC81C\uAC70: ' + (data.session_name || data.session_pid), 'err', data.session_pid, data.session_name);
  setTimeout(function() { if (document.getElementById('histOverlay').classList.contains('show')) fetchHistory() }, 1000);
}

function _handleServerShutdown() {
  // 모든 세션을 종료 상태로
  Object.keys(sessions).forEach(function(pid) { sessions[pid].alive = false });
  renderAll();
}

function _handleThinkingStart(data, sp, sn) {
  // 세션이 없으면 자동 생성 (서버 재시작 복구/경합 대비)
  if (sp && !sessions[sp]) {
    registerSession({ pid: sp, name: sn || 'Session ' + sp, cwd: data.session_cwd || '' });
  }
  if (sp && sessions[sp]) {
    sessions[sp]._turnCount = (sessions[sp]._turnCount || 0) + 1;
    sessions[sp]._masterSt = 'thinking'; sessions[sp]._masterTask = '생각 중...';
    sessions[sp]._thinkStart = Date.now();
    delete sessions[sp]._completed;
  }
  var tc = sp && sessions[sp] ? sessions[sp]._turnCount : 0;
  Object.keys(liveInstances).forEach(function(k) { if (liveInstances[k].sessionPid === sp && liveInstances[k].st !== 'working') delete liveInstances[k] });
  addLog({ name: 'Master', color: '#fbbf24' }, '── Q' + tc + (sn ? ' [' + sn + ']' : '') + ' ──', '', sp, sn);
  if (!_tlOpen) { _tlOpen = true; document.getElementById('timelineBody').style.display = ''; document.getElementById('tlToggle').textContent = '\u25BC' }
  renderAll();
}

function _handleThinkingEnd(data, sp, sn) {
  var s = sp && sessions[sp] ? sessions[sp] : null;
  if (!s) { addLog(null, 'thinking_end (세션 없음)', '', sp, sn); renderAll(); return }
  if (!s._thinkStart) { renderAll(); return }
  var anyWorking = Object.values(liveInstances).some(function(i) { return i.sessionPid === sp && i.st === 'working' });
  var sec = Math.round((Date.now() - s._thinkStart) / 1000);
  var tc = s._turnCount || 0;
  s._thinkStart = null;
  if (!anyWorking) {
    var doneMsg = 'Q' + tc + ' 완료' + (sec > 0 ? ' (' + sec + 's)' : '');
    addLog({ name: 'Master', color: '#fbbf24' }, '── ' + doneMsg + ' ──', 'ok', sp, sn);
    sendNotif('Q' + tc + ' 응답 완료', (sn ? '[' + sn + '] ' : '') + (sec > 0 ? sec + '초 소요' : ''));
    if (s) {
      s._masterSt = 'done'; s._masterTask = doneMsg;
      if (currentSession !== sp) {
        s._completed = true;
        // 10초 후 fade-out
        (function(pid) {
          setTimeout(function() {
            if (sessions[pid] && sessions[pid]._completed) {
              var t = document.querySelector('.sess-tab[data-session="' + pid + '"]');
              if (t) { t.classList.add('faded'); setTimeout(function() { delete sessions[pid]._completed; t.classList.remove('completed', 'faded'); _tabsBuilt = '' }, 800) }
              else delete sessions[pid]._completed;
            }
          }, 5000);
        })(sp);
      }
    }
    renderAll();
    return;
  }
  // ESC 중단: 에이전트 working 중이지만 thinking_end → working 에이전트 강제 정리
  Object.keys(liveInstances).forEach(function(k) {
    if (liveInstances[k].sessionPid === sp && liveInstances[k].st === 'working') {
      liveInstances[k].st = 'done'; liveInstances[k].task = '중단됨'; liveInstances[k].prog = 100;
    }
  });
  var doneMsgEsc = 'Q' + tc + ' 완료' + (sec > 0 ? ' (' + sec + 's)' : '');
  addLog({ name: 'Master', color: '#fbbf24' }, '── ' + doneMsgEsc + ' (중단) ──', 'ok', sp, sn);
  if (s) { s._masterSt = 'done'; s._masterTask = doneMsgEsc }
  renderAll();
}

function _handleToolUse(data, sp) {
  var tn = data.tool_name || ''; if (!tn || tn === 'Agent') return;
  var agType = data.agent_type || '';
  if (agType) {
    // agent_type 있음 → 에이전트의 도구 사용
    var key = instKey(sp, agType);
    var inst = liveInstances[key];
    if (!inst) {
      // 넘버링된 인스턴스 찾기
      var candidates = Object.keys(liveInstances).filter(function(k) { return k.indexOf(key) === 0 && liveInstances[k].st === 'working' });
      if (candidates.length > 0) inst = liveInstances[candidates[candidates.length - 1]];
    }
    if (inst && inst.st === 'working') { inst.task = inst.desc + ' — ' + tn; renderAll() }
  } else if (sp && sessions[sp] && sessions[sp]._masterSt === 'thinking') {
    sessions[sp]._masterTask = tn; renderAll();
  }
}

function _handleAgentStart(data, sp, sn) {
  // 에이전트 카운터 증가
  if (sp && sessions[sp]) { sessions[sp].agentCount = (sessions[sp].agentCount || 0) + 1; renderSessionTabs() }
  // 새 라운드 감지: master가 idle이고 마지막 done 후 5초 이상 경과 → 이전 done 정리
  var ss = sp && sessions[sp] ? sessions[sp] : null;
  if (ss && ss._masterSt !== 'working') { var sinceDone = ss._lastDoneTime ? Date.now() - ss._lastDoneTime : Infinity; if (sinceDone > 5000) { Object.keys(liveInstances).forEach(function(k) { if (liveInstances[k].sessionPid === sp && liveInstances[k].st !== 'working') delete liveInstances[k] }) } }
  var at = data.agent_type || ''; var desc = data.agent_description || data.agent_prompt || '';
  var ai = getAgentInfo(at); var color = ai ? ai.color : agColor(at, Object.keys(liveInstances).length); var name = ai ? ai.name : at;
  var baseKey = instKey(sp, at);
  var key = baseKey;
  // 같은 타입이 이미 working이면 넘버링
  var dup = 1;
  while (liveInstances[key] && liveInstances[key].st === 'working') { key = baseKey + '_' + dup; dup++ }
  var taskDesc = desc || name;
  liveInstances[key] = { key: key, agentId: at, sessionPid: sp, sessionName: sn, st: 'working', task: taskDesc, desc: taskDesc, prog: 10, startTime: Date.now(), color: color };
  addLog({ name: name, color: color }, (sn ? '[' + sn + '] ' : '') + name + ' \uC2DC\uC791 \u2014 ' + taskDesc, '', sp, sn);
  if (sp && sessions[sp]) { sessions[sp]._masterSt = 'working'; sessions[sp]._masterTask = (sn ? '[' + sn + '] ' : '') + '\uC870\uC728 \uC911...' }
  // 타임라인 자동 펼침
  if (!_tlOpen) { _tlOpen = true; document.getElementById('timelineBody').style.display = ''; document.getElementById('tlToggle').textContent = '\u25BC' }
  renderAll(); setTimeout(function() { sparks('inst-' + key, color); flyDot('master', 'inst-' + key) }, 50);
  // progress animation — 클로저로 key 캡처
  (function(k) { var t0 = Date.now(); var iv = setInterval(function() { var inst = liveInstances[k]; if (!inst || inst.st !== 'working') { clearInterval(iv); return } var el = (Date.now() - t0) / 1000; inst.prog = Math.min(90, 10 + el * 3); renderActivity() }, 500) })(key);
}

function _handleAgentDone(data, sp, sn) {
  var at = data.agent_type || ''; var baseKey = instKey(sp, at);
  // working 인스턴스 중 가장 오래된 것 먼저 완료 (FIFO)
  var key = baseKey;
  if (!liveInstances[key] || liveInstances[key].st !== 'working') {
    var candidates = Object.keys(liveInstances).filter(function(k) { return k.indexOf(baseKey) === 0 && liveInstances[k].st === 'working' });
    if (candidates.length > 0) key = candidates.sort(function(a, b) { return liveInstances[a].startTime - liveInstances[b].startTime })[0];
  }
  var inst = liveInstances[key];
  if (inst) {
    var sec = Math.round((Date.now() - inst.startTime) / 1000);
    inst.st = 'done'; inst.doneTime = Date.now(); inst.task = inst.desc + ' \u2014 \uC644\uB8CC (' + sec + 's)'; inst.prog = 100;
    var ai = getAgentInfo(at); var doneAgentName = ai ? ai.name : at;
    addLog({ name: doneAgentName, color: inst.color }, (sn ? '[' + sn + '] ' : '') + inst.desc + ' \uC644\uB8CC (' + sec + 's)', 'ok', sp, sn);
    renderAll(); setTimeout(function() {
      sparks('inst-' + key, inst.color);
      flyDot('inst-' + key, 'master');
      // char_fanfare: 게임 버프 활성 시 별이 위로 튀어오르는 화려한 팡파르 추가
      // workspace.js의 실제 DOM id는 'ws-' + agentId 형식 (sparks/flyDot의 inst- prefix는 기존 버그)
      if ((window.gameBuffs || {}).charFanfare > 0 && typeof charFanfare === 'function') {
        charFanfare(inst.agentId, inst.color);
      }
    }, 50);
    if (!Object.values(liveInstances).some(function(i) { return i.sessionPid === sp && i.st === 'working' })) {
      // 아직 응답 작성 중이면 thinking으로 복귀, 아니면 idle
      var sd = sp && sessions[sp] ? sessions[sp] : null;
      if (sd && sd._thinkStart) { sd._masterSt = 'thinking'; sd._masterTask = '생각 중...' }
      else if (sd) { sd._masterSt = 'idle'; sd._masterTask = '' }
      if (sd) sd._lastDoneTime = Date.now();
      renderAll(); celebrate();
      sendNotif('모든 에이전트 완료', doneAgentName + ' 완료 (' + sec + 's) — 모든 작업이 끝났습니다');
    } else {
      sendNotif(doneAgentName + ' 완료 (' + sec + 's)', inst.desc);
    }
  } else { addLog({ name: at, color: 'var(--accent)' }, at + ' \uC644\uB8CC', 'ok', sp, sn); renderAll() }
}

// 이벤트 이름 → 핸들러 매핑. lastActivity 갱신이 필요한 이벤트는 handleLiveEvent에서 공통 처리
var _eventHandlers = {
  session_registered: _handleSessionRegistered,
  session_renamed: _handleSessionRenamed,
  session_stopped: _handleSessionStopped,
  session_removed: _handleSessionRemoved,
  server_shutdown: _handleServerShutdown,
  thinking_start: _handleThinkingStart,
  thinking_end: _handleThinkingEnd,
  tool_use: _handleToolUse,
  agent_start: _handleAgentStart,
  agent_done: _handleAgentDone,
};

// 세션 lastActivity를 갱신할 이벤트 (pre-session events 제외)
var _activityEvents = { thinking_start: 1, thinking_end: 1, tool_use: 1, agent_start: 1, agent_done: 1 };

function handleLiveEvent(data) {
  var evt = data.event; var sp = data.session_pid || ''; var sn = data.session_name || '';
  if (evt === 'connected') return;
  updateDailyStatFromEvent(data);
  // 게임화 포인트 이벤트 — points.js가 로드되어 있을 때만 호출. 로그 기록은 안 함 (중요 로그 가독성 보호)
  if (typeof updatePointsFromEvent === 'function') updatePointsFromEvent(data);
  if (evt === 'points_updated') return;
  // session_start 계열 이벤트는 lastActivity 갱신 대상이 아님
  if (_activityEvents[evt] && sp && sessions[sp]) { sessions[sp].lastActivity = new Date().toISOString() }
  var handler = _eventHandlers[evt];
  if (handler) { handler(data, sp, sn); return }
  // fallback: 알 수 없는 이벤트는 로그에만
  addLog(null, evt + ' ' + (data.tool_name || ''), '', sp, sn);
}
