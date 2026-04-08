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
  var summary = '📊 질문 <strong>' + d.prompts + '</strong> · 에이전트 <strong>' + d.totalAgents + '</strong> · 도구 <strong>' + d.totalTools + '</strong>';

  var dd = '<div class="daily-dropdown"><div class="daily-title daily-title-head">📊 오늘<button class="daily-reset" onclick="event.stopPropagation();resetStats()" data-tip="모든 통계(오늘/주간/전체) 초기화">🔄</button></div>';

  dd += '<div class="daily-section">질문 ' + d.prompts + '회</div>';

  // 오늘 에이전트
  var agentKeys = Object.keys(d.agents || {}).sort(function(a, b) { return d.agents[b] - d.agents[a] });
  dd += '<div class="daily-section">에이전트 ' + d.totalAgents + '회</div>';
  if (agentKeys.length === 0) { dd += '<div class="daily-row"><span>없음</span><span>-</span></div>' }
  agentKeys.forEach(function(k, i) { dd += '<div class="daily-row sub' + (i === agentKeys.length - 1 ? ' last' : '') + '"><span>' + k + '</span><span>' + d.agents[k] + '</span></div>' });

  // 오늘 도구 (기본 접힘 - 항목이 많아 화면 차지를 줄임)
  var toolKeys = Object.keys(d.tools || {}).sort(function(a, b) { return d.tools[b] - d.tools[a] });
  dd += '<details class="daily-collapse"><summary class="daily-section">도구 ' + d.totalTools + '회</summary>';
  var showTools = toolKeys.slice(0, 8);
  showTools.forEach(function(k, i) { dd += '<div class="daily-row sub' + (i === showTools.length - 1 ? ' last' : '') + '"><span>' + k + '</span><span>' + d.tools[k] + '</span></div>' });
  if (toolKeys.length > 8) { dd += '<div class="daily-row sub last"><span>외 ' + (toolKeys.length - 8) + '개</span><span></span></div>' }
  dd += '</details>';

  // 주간 통계
  var w = d.weekly || {};
  var wAgents = 0; Object.keys(w.agents || {}).forEach(function(k) { wAgents += w.agents[k] });
  var wTools = 0; Object.keys(w.tools || {}).forEach(function(k) { wTools += w.tools[k] });
  dd += '<div class="daily-title" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">📅 주간 (7일)</div>';
  dd += '<div class="daily-row"><span>질문</span><span>' + (w.prompts || 0) + '</span></div>';
  dd += '<div class="daily-row"><span>에이전트</span><span>' + wAgents + '</span></div>';
  dd += '<div class="daily-row"><span>도구</span><span>' + wTools + '</span></div>';

  // 전체 통계
  var t = d.total || {};
  var tAgents = 0; Object.keys(t.agents || {}).forEach(function(k) { tAgents += t.agents[k] });
  var tTools = 0; Object.keys(t.tools || {}).forEach(function(k) { tTools += t.tools[k] });
  dd += '<div class="daily-title" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">🏆 전체' + (t.since ? ' (' + t.since + '~)' : '') + '</div>';
  dd += '<div class="daily-row"><span>질문</span><span>' + (t.prompts || 0) + '</span></div>';
  dd += '<div class="daily-row"><span>에이전트</span><span>' + tAgents + '</span></div>';
  dd += '<div class="daily-row"><span>도구</span><span>' + tTools + '</span></div>';

  dd += '</div>';
  el.innerHTML = summary + dd;
}

function resetStats() {
  if (!confirm('모든 통계(오늘/주간/전체)를 초기화합니다.\n이 작업은 되돌릴 수 없습니다.\n\n계속하시겠습니까?')) return;
  fetch(API + '/api/stats/reset', { method: 'POST' }).then(function(r) { return r.json() }).then(function(d) {
    if (d && d.ok) {
      // 메모리 캐시도 비우고 즉시 갱신
      dailyStatsData = { prompts: 0, totalAgents: 0, totalTools: 0, agents: {}, tools: {}, weekly: { prompts: 0, agents: {}, tools: {} }, total: { since: d.since, prompts: 0, agents: {}, tools: {} } };
      renderDailyStat();
      toast('통계 초기화됨');
    } else { toast('초기화 실패', 'err') }
  }).catch(function() { toast('초기화 실패', 'err') });
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
