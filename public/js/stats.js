// Daily Stats — 헤더 우측 통계 드롭다운
// 로드 순서: panels 이후, mcp-hooks 이전
// 의존: state.js(API)
//       utils.js(hideGlobalTip via window)
//       server-control.js(toast) — hoisting

var dailyStatsData = { prompts: 0, totalAgents: 0, totalTools: 0, agents: {}, tools: {} };

function renderDailyStat() {
  var el = document.getElementById('dailyStat'); if (!el) return;
  // DOM 재생성 전 글로벌 툴팁 정리 (detached node에 박제된 툴팁 방지)
  if (typeof window.hideGlobalTip === 'function') window.hideGlobalTip();
  var d = dailyStatsData;
  var summary = '💬<strong>' + d.prompts + '</strong> 🤖<strong>' + d.totalAgents + '</strong> 🔧<strong>' + d.totalTools + '</strong>';

  var dd = '<div class="daily-dropdown"><div class="daily-title daily-title-head">📊 ' + t('stat_today') + '<button class="daily-reset" onclick="event.stopPropagation();resetStats()" data-tip="🔄">🔄</button></div>';

  dd += '<div class="daily-section">' + t('stat_question') + ' ' + d.prompts + '</div>';

  // 오늘 에이전트
  var agentKeys = Object.keys(d.agents || {}).sort(function(a, b) { return d.agents[b] - d.agents[a] });
  dd += '<div class="daily-section">' + t('stat_agent') + ' ' + d.totalAgents + '</div>';
  if (agentKeys.length === 0) { dd += '<div class="daily-row"><span>-</span><span>-</span></div>' }
  agentKeys.forEach(function(k, i) { dd += '<div class="daily-row sub' + (i === agentKeys.length - 1 ? ' last' : '') + '"><span>' + esc(k) + '</span><span>' + d.agents[k] + '</span></div>' });

  // 오늘 도구 (기본 접힘)
  var toolKeys = Object.keys(d.tools || {}).sort(function(a, b) { return d.tools[b] - d.tools[a] });
  dd += '<details class="daily-collapse"><summary class="daily-section">' + t('stat_tool') + ' ' + d.totalTools + '</summary>';
  var showTools = toolKeys.slice(0, 8);
  showTools.forEach(function(k, i) { dd += '<div class="daily-row sub' + (i === showTools.length - 1 ? ' last' : '') + '"><span>' + esc(k) + '</span><span>' + d.tools[k] + '</span></div>' });
  if (toolKeys.length > 8) { dd += '<div class="daily-row sub last"><span>+' + (toolKeys.length - 8) + '</span><span></span></div>' }
  dd += '</details>';

  // 주간 통계
  var w = d.weekly || {};
  var wAgents = 0; Object.keys(w.agents || {}).forEach(function(k) { wAgents += w.agents[k] });
  var wTools = 0; Object.keys(w.tools || {}).forEach(function(k) { wTools += w.tools[k] });
  dd += '<div class="daily-title" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">📅 ' + t('stat_weekly') + '</div>';
  dd += '<div class="daily-row"><span>' + t('stat_question') + '</span><span>' + (w.prompts || 0) + '</span></div>';
  dd += '<div class="daily-row"><span>' + t('stat_agent') + '</span><span>' + wAgents + '</span></div>';
  dd += '<div class="daily-row"><span>' + t('stat_tool') + '</span><span>' + wTools + '</span></div>';

  // 전체 통계
  var tt = d.total || {};
  var tAgents = 0; Object.keys(tt.agents || {}).forEach(function(k) { tAgents += tt.agents[k] });
  var tTools = 0; Object.keys(tt.tools || {}).forEach(function(k) { tTools += tt.tools[k] });
  dd += '<div class="daily-title" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">🏆 ' + t('stat_total') + (tt.since ? ' (' + esc(tt.since) + '~)' : '') + '</div>';
  dd += '<div class="daily-row"><span>' + t('stat_question') + '</span><span>' + (tt.prompts || 0) + '</span></div>';
  dd += '<div class="daily-row"><span>' + t('stat_agent') + '</span><span>' + tAgents + '</span></div>';
  dd += '<div class="daily-row"><span>' + t('stat_tool') + '</span><span>' + tTools + '</span></div>';

  dd += '</div>';
  el.innerHTML = summary + dd;
}

// 잔디 모달 — GitHub contribution graph 스타일
var _grassModalBuilt = false;

function openGrassModal() {
  if (!_grassModalBuilt) {
    _grassModalBuilt = true;
    var overlay = document.createElement('div');
    overlay.className = 'grass-overlay';
    overlay.id = 'grassOverlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeGrassModal(); };
    overlay.innerHTML =
      '<div class="grass-modal">' +
        '<div class="grass-header">' +
          '<h2>🌱 ' + t('grass_title') + '</h2>' +
          '<div class="grass-year-nav" id="grassYearNav"></div>' +
          '<button class="grass-close" onclick="closeGrassModal()">&times;</button>' +
        '</div>' +
        '<div class="grass-summary" id="grassSummary"></div>' +
        '<div class="grass-grid" id="grassGrid"></div>' +
        '<div class="grass-legend" id="grassLegend"></div>' +
      '</div>';
    document.body.appendChild(overlay);
  }
  document.getElementById('grassOverlay').classList.add('show');
  _grassYear = new Date().getFullYear();
  _loadGrassData();
}

var _grassYear = new Date().getFullYear();

function switchGrassYear(year) {
  _grassYear = year;
  _loadGrassData();
}

function closeGrassModal() {
  var overlay = document.getElementById('grassOverlay');
  if (overlay) overlay.classList.remove('show');
}

function _loadGrassData() {
  var grid = document.getElementById('grassGrid');
  var summary = document.getElementById('grassSummary');
  var legend = document.getElementById('grassLegend');
  if (!grid) return;
  grid.innerHTML = '';

  fetch(API + '/api/stats/activity').then(function(r) { return r.json(); }).then(function(data) {
    var activity = data.activity || {};
    var year = _grassYear;
    var thisYear = new Date().getFullYear();
    var isCurrentYear = (year === thisYear);

    // 년도 탭 렌더 — 데이터가 있는 년도만 표시
    var yearNav = document.getElementById('grassYearNav');
    if (yearNav) {
      var years = {};
      Object.keys(activity).forEach(function(k) { var y = parseInt(k.split('-')[0]); if (y) years[y] = true; });
      years[thisYear] = true;
      var sortedYears = Object.keys(years).map(Number).sort();
      yearNav.innerHTML = sortedYears.map(function(y) {
        return '<button class="grass-year-btn' + (y === year ? ' active' : '') + '" onclick="switchGrassYear(' + y + ')">' + y + '</button>';
      }).join('');
    }

    // 해당 년도 1/1 ~ 12/31 (항상 전체 표시, 미래 날짜는 빈칸)
    var startDate = new Date(year, 0, 1);
    var endDate = new Date(year, 11, 31);
    var todayKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
    var days = [];
    for (var d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ date: key, count: activity[key] || 0, dow: d.getDay(), future: key > todayKey });
    }

    var firstDow = days[0].dow;
    var padded = [];
    for (var p = 0; p < firstDow; p++) padded.push(null);
    padded = padded.concat(days);

    var maxCount = 1;
    var activeDays = 0;
    var totalCount = 0;
    days.forEach(function(dd) {
      if (dd.count > maxCount) maxCount = dd.count;
      if (dd.count > 0) { activeDays++; totalCount += dd.count; }
    });

    if (summary) {
      summary.innerHTML = year + ': <strong>' + activeDays + '</strong> ' + t('grass_days_active') + ' · ' + t('grass_total_prefix') + ' <strong>' + totalCount + '</strong> ' + t('grass_total_suffix');
      summary.style.cssText = 'font-size:.6rem;color:var(--text-secondary);margin-bottom:8px';
    }

    // GitHub 스타일 레이아웃: 요일 라벨(왼쪽) + 월 라벨(상단) + 격자
    grid.innerHTML = '';
    grid.style.display = 'none'; // 기존 grid 숨기고 새 구조 사용

    var body = grid.parentElement;
    var existing = body.querySelector('.grass-body');
    if (existing) existing.remove();

    var wrapper = document.createElement('div');
    wrapper.className = 'grass-body';

    // 요일 라벨 (왼쪽)
    var dayLabels = document.createElement('div');
    dayLabels.className = 'grass-day-labels';
    t('grass_dow').forEach(function(d, i) {
      var lbl = document.createElement('div');
      lbl.className = 'grass-day-label';
      lbl.textContent = (i % 2 === 1) ? d : ''; // 월,수,금만 표시 (GitHub처럼)
      dayLabels.appendChild(lbl);
    });
    wrapper.appendChild(dayLabels);

    // 메인 영역 (월 라벨 + 격자)
    var main = document.createElement('div');
    main.className = 'grass-main';

    // 월 라벨 계산 — 각 열(주)의 첫 번째 날 기준
    var numCols = Math.ceil(padded.length / 7);
    var monthRow = document.createElement('div');
    monthRow.className = 'grass-month-labels';
    var lastMonth = -1;
    for (var col = 0; col < numCols; col++) {
      var firstInCol = padded[col * 7];
      var mlbl = document.createElement('span');
      mlbl.className = 'grass-month-label';
      mlbl.style.width = '13px'; // 11px cell + 2px gap
      if (firstInCol) {
        var m = parseInt(firstInCol.date.slice(5, 7));
        if (m !== lastMonth) { mlbl.textContent = _lang === 'ko' ? m + '월' : ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m] || m; lastMonth = m; }
      }
      monthRow.appendChild(mlbl);
    }
    main.appendChild(monthRow);

    // 격자
    var gridEl = document.createElement('div');
    gridEl.className = 'grass-grid';
    padded.forEach(function(d) {
      var cell = document.createElement('div');
      if (!d) {
        cell.className = 'grass-cell';
      } else if (d.future) {
        cell.className = 'grass-cell grass-future';
      } else {
        var level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / maxCount) * 4));
        cell.className = 'grass-cell grass-' + level;
        cell.dataset.tip = d.date + ' (' + t('grass_dow')[d.dow] + ') ' + d.count;
      }
      gridEl.appendChild(cell);
    });
    main.appendChild(gridEl);
    wrapper.appendChild(main);
    body.insertBefore(wrapper, legend);

    // 범례
    if (legend) {
      legend.innerHTML = '<span style="font-size:.55rem;color:var(--text-secondary)">' + t('grass_less') + '</span>' +
        '<div class="grass-cell grass-0" style="width:14px;height:14px"></div>' +
        '<div class="grass-cell grass-1" style="width:14px;height:14px"></div>' +
        '<div class="grass-cell grass-2" style="width:14px;height:14px"></div>' +
        '<div class="grass-cell grass-3" style="width:14px;height:14px"></div>' +
        '<div class="grass-cell grass-4" style="width:14px;height:14px"></div>' +
        '<span style="font-size:.55rem;color:var(--text-secondary)">' + t('grass_more') + '</span>';
      legend.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:10px;justify-content:flex-end';
    }
  }).catch(function() {
    grid.innerHTML = '<div style="font-size:.7rem;color:var(--text-secondary)">' + t('grass_load_fail') + '</div>';
  });
}


function resetStats() {
  if (!confirm(t('stat_reset'))) return;
  fetch(API + '/api/stats/reset', { method: 'POST' }).then(function(r) { return r.json() }).then(function(d) {
    if (d && d.ok) {
      // 메모리 캐시도 비우고 즉시 갱신
      dailyStatsData = { prompts: 0, totalAgents: 0, totalTools: 0, agents: {}, tools: {}, weekly: { prompts: 0, agents: {}, tools: {} }, total: { since: d.since, prompts: 0, agents: {}, tools: {} } };
      renderDailyStat();
      toast(t('stat_reset_done'));
    } else { toast(t('stat_reset_fail'), 'err') }
  }).catch(function() { toast(t('stat_reset_fail'), 'err') });
}

// SSE 이벤트 수신 시 실시간 업데이트
function updateDailyStatFromEvent(ev) {
  if (ev.event === 'thinking_start') dailyStatsData.prompts = (dailyStatsData.prompts || 0) + 1;
  if (ev.event === 'agent_done' && ev.agent_type) {
    dailyStatsData.agents[ev.agent_type] = (dailyStatsData.agents[ev.agent_type] || 0) + 1;
    dailyStatsData.totalAgents = (dailyStatsData.totalAgents || 0) + 1;
  }
  if (ev.event === 'tool_use' && ev.tool_name) {
    dailyStatsData.tools[ev.tool_name] = (dailyStatsData.tools[ev.tool_name] || 0) + 1;
    dailyStatsData.totalTools = (dailyStatsData.totalTools || 0) + 1;
  }
  renderDailyStat();
}
