// 세션 히스토리 UI (검색/필터/Privacy 토글/렌더링)
// 로드 순서: creature 이후, 인라인 메인 이전
// 주의: onclick/onchange/oninput 핸들러에서 호출되므로 전역 함수여야 함

// === 전역 상태 ===
var _histSearchTimer = null;
var _histCurrentQ = '';
var _histFetchSeq = 0;       // 응답 순서 가드 (stale 결과 무시)
var _histAgentCache = {};    // 에이전트 옵션 누적 캐시 (필터 전환 시 사라지지 않도록)

// === 모달 토글 ===
function toggleHistory() {
  var el = document.getElementById('histOverlay');
  var isOpen = el.classList.toggle('show');
  if (isOpen) { fetchHistory(); fetchPrivacy(); }
}

// === 검색 디바운스 ===
function scheduleHistSearch() {
  if (_histSearchTimer) clearTimeout(_histSearchTimer);
  _histSearchTimer = setTimeout(fetchHistory, 300);
}

// === 히스토리 조회 ===
function fetchHistory() {
  var q = document.getElementById('histSearchQ').value.trim();
  var days = document.getElementById('histSearchDays').value;
  var agent = document.getElementById('histSearchAgent').value;
  _histCurrentQ = q;
  var mySeq = ++_histFetchSeq;
  var params = new URLSearchParams();
  if (q) params.set('q', q);
  if (days && days !== '0') params.set('days', days);
  if (agent) params.set('agent', agent);
  var url = API + '/api/history' + (params.toString() ? '?' + params.toString() : '');
  fetch(url).then(function(r) { return r.json(); }).then(function(resp) {
    if (mySeq !== _histFetchSeq) return; // stale 응답 무시
    var items = Array.isArray(resp) ? resp : (resp.items || []);
    var partial = !Array.isArray(resp) && resp.partial === true;
    renderHistory(items, partial);
    updateAgentFilterOptions(items);
  }).catch(function() {
    if (mySeq !== _histFetchSeq) return;
    document.getElementById('histList').innerHTML = '<div class="hist-empty">서버 연결 실패</div>';
  });
}

// === 에이전트 필터 옵션 갱신 (캐시 누적) ===
function updateAgentFilterOptions(list) {
  (list || []).forEach(function(s) {
    Object.keys(s.agents || {}).forEach(function(a) { _histAgentCache[a] = true; });
  });
  var sel = document.getElementById('histSearchAgent');
  var current = sel.value;
  var names = Object.keys(_histAgentCache).sort();
  var html = '<option value="">모든 에이전트</option>';
  names.forEach(function(n) {
    html += '<option value="' + esc(n) + '"' + (n === current ? ' selected' : '') + '>' + esc(n) + '</option>';
  });
  sel.innerHTML = html;
}

// === Privacy 토글 ===
function fetchPrivacy() {
  fetch(API + '/api/privacy').then(function(r) { return r.json(); }).then(function(d) {
    document.getElementById('histPrivacy').checked = !!d.enabled;
  }).catch(function() {});
}

function togglePrivacy(on) {
  if (on) {
    // ON 시 디스크 정리 여부 묻기
    var ok = confirm('프롬프트 기록을 끕니다.\n\n이미 저장된 히스토리의 프롬프트와 응답 요약도 함께 삭제할까요?\n\n[확인] 디스크 정리 + 이후 기록 안 함\n[취소] 이후 기록만 안 함 (기존 데이터 유지)');
    fetch(API + '/api/privacy', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({enabled: true, scrubDisk: ok})
    })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        toast('프롬프트 기록 OFF' + (d.scrubbed > 0 ? ' (' + d.scrubbed + '개 정리)' : ''));
        if (document.getElementById('histOverlay').classList.contains('show')) fetchHistory();
      })
      .catch(function() { toast('변경 실패', 'err'); });
  } else {
    fetch(API + '/api/privacy', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({enabled: false})
    })
      .then(function(r) { return r.json(); })
      .then(function(d) { toast('프롬프트 기록 ON'); })
      .catch(function() { toast('변경 실패', 'err'); });
  }
}

// === 검색어 하이라이트 ===
function highlight(text, q) {
  if (!q || !text) return esc(text || '');
  // 검색어도 esc해서 HTML escape된 본문(&lt;div&gt;)과 매칭
  var safeText = esc(text);
  var safeQ = esc(q);
  try {
    var re = new RegExp('(' + safeQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return safeText.replace(re, '<mark class="hist-hl">$1</mark>');
  } catch(e) { return safeText; }
}

// === 히스토리 렌더링 ===
function renderHistory(list, partial) {
  var el = document.getElementById('histList');
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="hist-empty">' + (_histCurrentQ ? '검색 결과가 없습니다' : '히스토리가 없습니다<br>세션이 종료되면 여기에 기록됩니다') + '</div>';
    return;
  }
  var q = _histCurrentQ;
  var partialHtml = partial ? '<div class="hist-empty" style="opacity:.7;padding:8px">⚠ 일부만 표시됨 (5초 timeout)</div>' : '';

  var html = '';
  list.forEach(function(s) {
    var start = s.startTime ? new Date(s.startTime) : null;
    var end = s.endTime ? new Date(s.endTime) : null;
    var duration = '';
    if (start && end) {
      var sec = Math.round((end - start) / 1000);
      if (sec >= 3600) duration = Math.floor(sec / 3600) + '시간 ' + Math.floor((sec % 3600) / 60) + '분';
      else if (sec >= 60) duration = Math.floor(sec / 60) + '분 ' + (sec % 60) + '초';
      else duration = sec + '초';
    }
    var timeStr = start ? String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0') : '';
    var dateStr = start ? (start.getMonth() + 1) + '/' + start.getDate() : '';

    // 태그
    var tags = '';
    var agentKeys = Object.keys(s.agents || {});
    agentKeys.forEach(function(a) {
      var info = s.agents[a];
      tags += '<span class="hist-tag agent">' + esc(a) + ' ' + info.count + '회' + (info.avgSec > 0 ? ' · ' + info.avgSec + 's' : '') + '</span>';
    });
    var toolKeys = Object.keys(s.tools || {}).sort(function(a, b) { return s.tools[b] - s.tools[a]; }).slice(0, 5);
    toolKeys.forEach(function(t) { tags += '<span class="hist-tag tool">' + esc(t) + ' ' + s.tools[t] + '</span>'; });

    // 상세 (펼침)
    var detHtml = '';

    // 질문 목록 (turns)
    if (s.turns && s.turns.length > 0) {
      s.turns.forEach(function(t) {
        var turnMeta = '';
        var agentNames = Object.keys(t.agents || {});
        if (agentNames.length > 0) turnMeta += agentNames.map(function(a) { return esc(a) + '×' + t.agents[a]; }).join(' · ');
        var toolNames = Object.keys(t.tools || {});
        if (toolNames.length > 0) {
          if (turnMeta) turnMeta += ' · ';
          turnMeta += toolNames.map(function(tn) { return esc(tn) + ' ' + t.tools[tn]; }).join(' · ');
        }
        if (t.sec > 0) {
          if (turnMeta) turnMeta += ' · ';
          turnMeta += t.sec + '초';
        }
        detHtml += '<div class="hist-turn">'
          + '<div class="hist-turn-q"><span class="hqnum">Q' + t.q + '</span><span class="hist-turn-prompt">'
          + (t.prompt ? highlight(t.prompt, q) : '<span style="color:var(--text-secondary);opacity:.6">(기록 안 됨)</span>')
          + '</span></div>'
          + (t.summary ? '<div class="hist-turn-sum">' + highlight(t.summary, q) + '</div>' : '')
          + (turnMeta ? '<div class="hist-turn-meta">' + turnMeta + '</div>' : '')
          + '</div>';
      });
    }

    // 응답 시간
    if (s.avgResponseSec > 0) {
      detHtml += '<div class="hist-ev"><span class="hist-ev-time"></span><span class="hist-ev-type thinking">응답</span><span class="hist-ev-detail">평균 ' + (s.avgResponseSec || 0) + '초';
      if (s.longestQuestion) detHtml += ' · 최대 Q' + (s.longestQuestion.q || 0) + ' (' + (s.longestQuestion.sec || 0) + '초)';
      detHtml += '</span></div>';
    }

    // 파일
    var fileKeys = Object.keys(s.files || {}).sort(function(a, b) {
      var fa = s.files[a], fb = s.files[b];
      return (fb.read + fb.edit) - (fa.read + fa.edit);
    }).slice(0, 10);
    if (fileKeys.length > 0) {
      fileKeys.forEach(function(f, i) {
        var info = s.files[f];
        var short = f.split('/').slice(-2).join('/');
        var ops = [];
        if (info.edit > 0) ops.push('Edit ' + info.edit);
        if (info.read > 0) ops.push('Read ' + info.read);
        detHtml += '<div class="hist-ev"><span class="hist-ev-time"></span><span class="hist-ev-type" style="background:rgba(251,191,36,.1);color:#fbbf24">' + (i === 0 ? '파일' : '') + '</span><span class="hist-ev-detail">' + highlight(short, q) + ' <span style="color:var(--text-secondary)">' + ops.join(' · ') + '</span></span></div>';
      });
    }

    html += '<div class="hist-item" onclick="this.classList.toggle(\'expanded\')">'
      + '<div class="hist-row">'
      + '<span class="hist-name">' + highlight(s.name || 'Session', q) + '</span>'
      + '<span class="hist-meta"><span>질문 <strong>' + (s.questions || 0) + '</strong></span>'
      + (s.avgResponseSec > 0 ? '<span>평균 <strong>' + (s.avgResponseSec || 0) + '</strong>초</span>' : '')
      + (duration ? '<span>세션 <strong>' + esc(duration) + '</strong></span>' : '')
      + '</span>'
      + '</div>'
      + '<div class="hist-time">' + dateStr + ' ' + timeStr + (end ? ' ~ ' + String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0') : '') + '</div>'
      + (tags ? '<div class="hist-summary">' + tags + '</div>' : '')
      + '<div class="hist-events">' + detHtml + '</div>'
      + '</div>';
  });
  el.innerHTML = partialHtml + html;
}
