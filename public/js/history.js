// 세션 히스토리 UI (검색/필터/Privacy 토글/렌더링)
// 로드 순서: creature 이후, 인라인 메인 이전
// 주의: onclick/onchange/oninput 핸들러에서 호출되므로 전역 함수여야 함

// === 전역 상태 ===
var _histSearchTimer = null;
var _histCurrentQ = '';
var _histFetchSeq = 0;       // 응답 순서 가드 (stale 결과 무시)
var _histAgentCache = {};    // 에이전트 옵션 누적 캐시 (필터 전환 시 사라지지 않도록)

// === cwd 경로 마스킹 정규식 (module-level 상수, 매 렌더마다 재컴파일 방지) ===
var _RE_HOME_MAC = /^\/Users\/[^/]+/;
var _RE_HOME_LINUX = /^\/home\/[^/]+/;
var _RE_TMP_MAC = /^\/private\/var\/folders\/[^/]+\/[^/]+/;
var _RE_TMP_LINUX = /^\/var\/folders\/[^/]+\/[^/]+/;

// === 작업 폴더 칩 클릭 → 클립보드 복사 ===
// data-full 속성값(마스킹된 경로)을 그대로 복사. 브라우저가 HTML 엔티티를 자동 디코드하므로
// getAttribute 결과는 원본 문자열이다. stopPropagation으로 hist-item 확장/접힘 토글 방지.
function copyCwd(el, event) {
  if (event) event.stopPropagation();
  var text = el.getAttribute('data-full') || '';
  if (!text) return;
  function showOk() { if (typeof toast === 'function') toast('폴더 경로 복사됨'); }
  function showFail() { if (typeof toast === 'function') toast('복사 실패', 'err'); }
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      if (ok) showOk(); else showFail();
    } catch(e) { showFail(); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showOk, fallback);
  } else {
    fallback();
  }
}

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
    var items = resp.items || [];
    renderHistory(items, resp.partial === true);
    updateAgentFilterOptions(items);
    updateHistMetaInfo(resp);
  }).catch(function() {
    if (mySeq !== _histFetchSeq) return;
    document.getElementById('histList').innerHTML = '<div class="hist-empty">서버 연결 실패</div>';
    updateHistMetaInfo(null);
  });
}

// 헤더 메타 정보: "N개 · 7일·10MB 보관" 또는 검색 중일 때 "N개 검색됨 / 전체 M개"
function updateHistMetaInfo(resp) {
  var el = document.getElementById('histMetaInfo');
  if (!el) return;
  if (!resp) {
    // 실패 → 보관 정책만 표시
    el.textContent = '7일·10MB 보관';
    return;
  }
  var total = resp.totalCount != null ? resp.totalCount : 0;
  var filtered = resp.filteredCount != null ? resp.filteredCount : 0;
  var partialSuffix = resp.partial ? ' ⚠ 부분 결과' : '';
  if (resp.hasFilter) {
    el.textContent = filtered + '개 검색됨 / 전체 ' + total + '개 · 7일·10MB 보관' + partialSuffix;
  } else {
    el.textContent = total + '개 · 7일·10MB 보관' + partialSuffix;
  }
}

// === 에이전트 필터 옵션 갱신 ===
// 첫 무필터 응답에서만 전체 에이전트 수집 → 이후는 fix (필터 적용 시 빠진 에이전트가 사라지는 문제 방지)
var _histAgentOptionsFrozen = false;
function updateAgentFilterOptions(list) {
  // 한 번이라도 옵션을 고정한 후엔 더 이상 수집하지 않음
  if (_histAgentOptionsFrozen) return;
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
  // 검색/필터 없이 한 번 로드하면 그 결과로 옵션 확정
  if (!_histCurrentQ && !current) _histAgentOptionsFrozen = true;
}

// === Privacy 토글 ===
function fetchPrivacy() {
  fetch(API + '/api/privacy').then(function(r) { return r.json(); }).then(function(d) {
    document.getElementById('histPrivacy').checked = !!d.enabled;
  }).catch(function() {});
}

// 토글: 다음 세션부터 prompt/summary 저장 여부만 변경 (디스크 조작 없음)
// 디스크 정리는 별도 "전체 삭제" 버튼 또는 행 단위 ✕ 버튼으로 명확히 분리
function togglePrivacy(on) {
  fetch(API + '/api/privacy', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({enabled: !!on})
  })
    .then(function(r) { return r.json(); })
    .then(function() { toast(on ? '프롬프트 기록 OFF' : '프롬프트 기록 ON'); })
    .catch(function() { toast('변경 실패', 'err'); });
}

// 전체 히스토리 삭제 (헤더 버튼)
function clearAllHistory() {
  if (!confirm(t('hist_confirm_clear'))) return;
  fetch(API + '/api/history', { method: 'DELETE' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      toast(t('hist_clear_done'));
      fetchHistory();
    })
    .catch(function() { toast('삭제 실패', 'err'); });
}

// 개별 히스토리 삭제 (inline 2단계 confirm: 첫 클릭은 "❓ 정말?", 3초 내 재클릭 시 실제 삭제)
function deleteHistoryItem(btn, filename) {
  if (!filename) return;
  if (btn.dataset.armed === '1') {
    // 두 번째 클릭 → 실제 삭제
    if (btn._armTimer) { clearTimeout(btn._armTimer); btn._armTimer = null; }
    btn.dataset.armed = '0';
    fetch(API + '/api/history/' + encodeURIComponent(filename), { method: 'DELETE' })
      .then(function(r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function() {
        // 해당 hist-item DOM만 즉시 제거 (전체 fetchHistory 재요청 안 함)
        var item = btn.closest('.hist-item');
        if (item) item.remove();
        // 삭제된 btn이 글로벌 툴팁의 _lastTarget일 수 있으므로 즉시 정리
        if (typeof window.hideGlobalTip === 'function') window.hideGlobalTip();
        toast('삭제됨');
      })
      .catch(function() {
        // 네트워크 실패 시 버튼 상태 복구 (❓ → ✕) — 복구 안 하면 다음 클릭부터 prevText='❓'로 영구 고정
        btn.textContent = '✕';
        btn.dataset.tip = '이 기록 삭제';
        toast('삭제 실패', 'err');
      });
  } else {
    // 첫 클릭 → 무장 상태 (3초 후 자동 해제)
    btn.dataset.armed = '1';
    var prevText = btn.textContent;
    btn.textContent = '❓';
    btn.dataset.tip = '한번 더 클릭하면 삭제됩니다 (3초 내)';
    btn._armTimer = setTimeout(function() {
      btn.dataset.armed = '0';
      btn.textContent = prevText;
      btn.dataset.tip = '이 기록 삭제';
      btn._armTimer = null;
    }, 3000);
  }
}

// === 검색어 하이라이트 ===
// 양쪽 esc 후 매칭 → entity가 양쪽 동일하게 변환되므로 `&`/`<`/`>` 검색도 정상 동작
// `<mark>` 태그는 replace 후 한 번만 삽입되므로 재귀 오염 없음
function highlight(text, q) {
  if (!q || !text) return esc(text || '');
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
  // DOM 재생성 전 글로벌 툴팁 정리 (detached node에 박제된 툴팁 방지)
  if (typeof window.hideGlobalTip === 'function') window.hideGlobalTip();
  // 재렌더링 시 기존 hist-del 노드의 무장 timer를 모두 정리 (detached node 메모리 점유 방지)
  el.querySelectorAll('.hist-del').forEach(function(b) {
    if (b._armTimer) { clearTimeout(b._armTimer); b._armTimer = null; }
  });
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="hist-empty">' + (_histCurrentQ ? t('hist_no_result') : t('hist_empty') + '<br>세션이 종료되면 여기에 기록됩니다') + '</div>';
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

    // 작업 폴더 칩 (parent/basename 형식, hover 시 전체 경로 툴팁, 클릭 시 클립보드 복사)
    // 툴팁: utils.js의 글로벌 data-tip 시스템 사용
    var cwdChip = '';
    if (s.cwd) {
      // 윈도우 경로(\)를 /로 정규화 + 트레일링 슬래시 제거 + 빈 토큰 제거
      var normalized = s.cwd.replace(/\\/g, '/').replace(/\/+$/, '');
      var parts = normalized.split('/').filter(Boolean);
      var label = parts.length >= 2 ? parts.slice(-2).join('/') : (parts[0] || normalized);
      // 경로 단축: ~ (HOME) + macOS 임시 경로
      var fullPath = normalized
        .replace(_RE_HOME_MAC, '~')
        .replace(_RE_HOME_LINUX, '~')
        .replace(_RE_TMP_MAC, '[tmp]')
        .replace(_RE_TMP_LINUX, '[tmp]');
      var safeFull = esc(fullPath);
      cwdChip = '<span class="hist-cwd" data-tip="클릭해서 복사: ' + safeFull + '" data-full="' + safeFull + '" onclick="copyCwd(this,event)">📁 <span class="hist-cwd-label">' + highlight(label, q) + '</span></span>';
    }

    // 개별 삭제 ✕ 버튼 (filename이 있을 때만)
    var delBtn = '';
    if (s.filename) {
      delBtn = '<button class="hist-del" data-tip="이 기록 삭제" data-armed="0"'
        + ' onclick="event.stopPropagation();deleteHistoryItem(this,\'' + esc(s.filename) + '\')">✕</button>';
    }

    html += '<div class="hist-item" onclick="this.classList.toggle(\'expanded\')">'
      + '<div class="hist-row">'
      + '<span class="hist-name">' + highlight(s.name || 'Session', q) + '</span>'
      + '<span class="hist-meta">' + cwdChip + '<span>질문 <strong>' + (s.questions || 0) + '</strong>' + (s.truncated ? '<span class="hist-truncated" data-tip="100개 초과분은 통계에만 누적">+</span>' : '') + '</span>'
      + (s.avgResponseSec > 0 ? '<span>평균 <strong>' + (s.avgResponseSec || 0) + '</strong>초</span>' : '')
      + (duration ? '<span>세션 <strong>' + esc(duration) + '</strong></span>' : '')
      + '</span>'
      + delBtn
      + '</div>'
      + '<div class="hist-time">' + dateStr + ' ' + timeStr + (end ? ' ~ ' + String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0') : '') + '</div>'
      + (tags ? '<div class="hist-summary">' + tags + '</div>' : '')
      + '<div class="hist-events">' + detHtml + '</div>'
      + '</div>';
  });
  el.innerHTML = partialHtml + html;
}
