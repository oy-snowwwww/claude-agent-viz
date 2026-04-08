// 로그 패널 — addLog(신규 추가) + renderLogs(렌더)
// 로드 순서: api 이후, sessions 이전
// 의존: state.js(logEntries, currentSession, MAX_LOGS)
//       utils.js(esc)

function addLog(ag, msg, cls, sp, sn) {
  logEntries.unshift({
    sessionPid: sp || '',
    sessionName: sn || '',
    agName: ag ? ag.name : 'System',
    agColor: ag ? ag.color : 'var(--accent)',
    msg: msg,
    cls: cls || '',
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  if (logEntries.length > MAX_LOGS) logEntries.length = MAX_LOGS;
  renderLogs();
}

function renderLogs() {
  var box = document.getElementById('logBox');
  box.innerHTML = '';
  var filtered = !currentSession ? logEntries : logEntries.filter(function(l) { return !l.sessionPid || l.sessionPid === currentSession });
  filtered.slice(0, 50).forEach(function(l) {
    var d = document.createElement('div');
    d.className = 'log' + (l.cls ? ' ' + l.cls : '');
    var sl = '';
    if (!currentSession && l.sessionPid && l.sessionName) sl = '<span class="ls">[' + esc(l.sessionName) + ']</span>';
    d.innerHTML = '<span class="lt">' + l.time + '</span>' + sl + '<span class="la" style="color:' + esc(l.agColor) + '">[' + esc(l.agName) + ']</span><span class="lm">' + esc(l.msg) + '</span>';
    box.appendChild(d);
  });
}

function fmtTime(s) {
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}
