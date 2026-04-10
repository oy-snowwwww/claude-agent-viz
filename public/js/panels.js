// Activity + Timeline 패널 렌더
// 로드 순서: workspace 이후, stats 이전
// 의존: state.js(currentSession, sessions, liveInstances)
//       utils.js(esc, buildPix)
//       sessions.js(getLiveInstances, getAgentInfo, clearInstance, updateHeaderStat) — hoisting

// === Activity ===
function renderActivity() {
  var box = document.getElementById('activityList'); box.innerHTML = '';
  var instances = getLiveInstances();
  var countEl = document.getElementById('actCount');
  var working = instances.filter(function(i) { return i.st === 'working' }).length;
  countEl.textContent = working > 0 ? working + ' working' : '';

  if (!currentSession && Object.keys(sessions).length === 0) {
    box.innerHTML = '<div class="act-empty">\uC138\uC158 \uB300\uAE30 \uC911...</div>'; return;
  }
  // Master 항상 표시
  var curS = currentSession && sessions[currentSession] ? sessions[currentSession] : null;
  var mst = curS ? curS._masterSt || 'idle' : 'idle';
  var mThinkStart = curS ? curS._thinkStart : null;
  var mLabels = _lang === 'en' ? { thinking: 'Thinking', done: 'Done', working: 'Orchestrating', idle: 'Idle' } : { thinking: '생각 중', done: '완료', working: '조율 중', idle: '대기' };
  var mRow = document.createElement('div'); mRow.className = 'act-row';
  mRow.appendChild(buildPix('master', '#fbbf24', 'sm'));
  mRow.innerHTML += '<span class="act-name" style="color:#fbbf24">Master</span>';
  var mProg = mst === 'done' ? 100 : mst === 'thinking' ? Math.min(90, 10 + ((Date.now() - (mThinkStart || Date.now())) / 1000) * 5) : mst === 'working' ? 50 : 0;
  mRow.innerHTML += '<div class="act-bar"><div class="act-bar-fill ' + mst + '" style="width:' + mProg + '%"></div></div>';
  var mTaskText = curS ? curS._masterTask || '' : '';
  mRow.innerHTML += '<span class="act-task">' + esc(mTaskText) + '</span>';
  mRow.innerHTML += '<span class="act-status ' + mst + '">' + (mLabels[mst] || mst) + '</span>';
  box.appendChild(mRow);

  if (instances.length === 0 && mst === 'idle') { return; }
  instances.forEach(function(inst) {
    var ai = getAgentInfo(inst.agentId); var name = ai ? ai.name : inst.agentId;
    var row = document.createElement('div'); row.className = 'act-row';
    row.appendChild(buildPix(inst.agentId, inst.color, 'sm'));
    row.innerHTML += '<span class="act-name" style="color:' + esc(inst.color) + '">' + esc(name) + '</span>';
    row.innerHTML += '<div class="act-bar"><div class="act-bar-fill ' + inst.st + '" style="width:' + (inst.prog || 0) + '%"></div></div>';
    row.innerHTML += '<span class="act-task">' + esc(inst.task || '-') + '</span>';
    var labels = { idle: '\uB300\uAE30', working: '\uC791\uC5C5 \uC911', done: '\uC644\uB8CC' };
    row.innerHTML += '<span class="act-status ' + inst.st + '">' + (labels[inst.st] || inst.st) + '</span>';
    if (!currentSession && inst.sessionName) row.innerHTML += '<span class="act-session">' + esc(inst.sessionName) + '</span>';
    // 리셋 버튼 (done)
    if (inst.st === 'done') {
      var rb = document.createElement('span'); rb.className = 'act-reset'; rb.textContent = '\u00d7'; rb.dataset.tip = '\uC81C\uAC70';
      (function(k) { rb.onclick = function(e) { e.stopPropagation(); clearInstance(k) } })(inst.key);
      row.appendChild(rb);
    }
    box.appendChild(row);
  });
  updateHeaderStat();
}

// === Timeline ===
var _tlOpen = false;

function toggleTimeline() {
  _tlOpen = !_tlOpen;
  document.getElementById('timelineBody').style.display = _tlOpen ? '' : 'none';
  document.getElementById('tlToggle').textContent = _tlOpen ? '\u25BC' : '\u25B6';
}

function renderTimeline() {
  var box = document.getElementById('timelineBody'); if (!box) return; box.innerHTML = '';
  var instances = getLiveInstances();
  // 타임라인은 에이전트 활동만 표시 (Master는 액티비티 패널에서 확인)
  if (instances.length === 0) { box.innerHTML = '<div class="tl-empty">\uC5D0\uC774\uC804\uD2B8 \uD65C\uB3D9 \uC5C6\uC74C</div>'; return }
  // 시간 범위 계산
  var minStart = Infinity, maxEnd = 0, now = Date.now();
  instances.forEach(function(inst) {
    if (inst.startTime < minStart) minStart = inst.startTime;
    var end = inst.doneTime || now;
    if (end > maxEnd) maxEnd = end;
  });
  var totalMs = Math.max(maxEnd - minStart, 1000);
  // 각 에이전트 바 렌더링
  instances.forEach(function(inst) {
    var ai = getAgentInfo(inst.agentId); var name = ai ? ai.name : inst.agentId;
    var row = document.createElement('div'); row.className = 'tl-row';
    var lbl = document.createElement('span'); lbl.className = 'tl-label'; lbl.style.color = inst.color; lbl.textContent = name;
    var track = document.createElement('div'); track.className = 'tl-track';
    var bar = document.createElement('div'); bar.className = 'tl-bar' + (inst.st === 'working' ? ' working' : '');
    var startPct = ((inst.startTime - minStart) / totalMs) * 100;
    var endTime = inst.doneTime || now;
    var widthPct = ((endTime - inst.startTime) / totalMs) * 100;
    bar.style.left = startPct + '%'; bar.style.width = Math.max(widthPct, 1) + '%'; bar.style.background = inst.color;
    var sec = Math.round((endTime - inst.startTime) / 1000);
    bar.dataset.tip = name + ' ' + sec + 's';
    track.appendChild(bar);
    var timeLabel = document.createElement('span'); timeLabel.className = 'tl-bar-label'; timeLabel.textContent = sec + 's';
    row.appendChild(lbl); row.appendChild(track); row.appendChild(timeLabel); box.appendChild(row);
  });
  // 시간 눈금
  var scaleRow = document.createElement('div'); scaleRow.className = 'tl-row'; scaleRow.style.height = 'auto';
  var scaleLabel = document.createElement('span'); scaleLabel.className = 'tl-label'; scaleLabel.textContent = '';
  var scale = document.createElement('div'); scale.className = 'tl-scale';
  var scalePad = document.createElement('span'); scalePad.className = 'tl-bar-label'; scalePad.textContent = '';
  var totalSec = Math.round(totalMs / 1000);
  for (var i = 0; i <= 4; i++) { var s = document.createElement('span'); s.textContent = Math.round(totalSec * i / 4) + 's'; scale.appendChild(s) }
  scaleRow.appendChild(scaleLabel); scaleRow.appendChild(scale); scaleRow.appendChild(scalePad);
  box.appendChild(scaleRow);
}
