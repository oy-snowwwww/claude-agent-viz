// 일일 통계 -- agent-stats.json 로드/저장/기록

var fs = require('fs');
var path = require('path');
var state = require('./state');
var utils = require('./utils');

var STATS_FILE = path.join(__dirname, '..', 'agent-stats.json');

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      var data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      // 구 형식 마이그레이션 (date 필드가 최상위에 있으면 구 형식)
      if (data.date && !data.today) {
        return { today: data, history: [], total: { since: data.date, prompts: data.prompts || 0, agents: data.agents || {}, tools: data.tools || {} } };
      }
      return data;
    }
  } catch(e) {}
  return {};
}

function ensureToday() {
  var statsData = state.statsData;
  var today = utils.todayKey();
  if (!statsData.today || statsData.today.date !== today) {
    // 이전 today를 history로 이동
    if (statsData.today && statsData.today.date) {
      if (!statsData.history) statsData.history = [];
      statsData.history.push(statsData.today);
      // 전체 보관 (일별 ~200바이트, 1년 ~70KB — 무제한 보관해도 부담 없음)
    }
    statsData.today = { date: today, prompts: 0, agents: {}, tools: {} };
  }
  if (!statsData.total) statsData.total = { since: today, prompts: 0, agents: {}, tools: {}, days: 0 };
  if (!statsData.history) statsData.history = [];
}

var _saveStatsTimer = null;
function saveStats() {
  if (_saveStatsTimer) return;
  _saveStatsTimer = setTimeout(function() {
    _saveStatsTimer = null;
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(state.statsData), 'utf8'); } catch(e) {}
  }, 1500);
}
function flushStats() {
  if (_saveStatsTimer) { clearTimeout(_saveStatsTimer); _saveStatsTimer = null; }
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(state.statsData), 'utf8'); } catch(e) {}
}

function recordStat(event, toolName, agentType) {
  var statsData = state.statsData;
  ensureToday();
  if (event === 'thinking_start') {
    statsData.today.prompts = (statsData.today.prompts || 0) + 1;
    statsData.total.prompts = (statsData.total.prompts || 0) + 1;
  }
  if (event === 'agent_done' && agentType) {
    statsData.today.agents[agentType] = (statsData.today.agents[agentType] || 0) + 1;
    statsData.total.agents[agentType] = (statsData.total.agents[agentType] || 0) + 1;
  }
  if (event === 'tool_use' && toolName) {
    statsData.today.tools[toolName] = (statsData.today.tools[toolName] || 0) + 1;
    statsData.total.tools[toolName] = (statsData.total.tools[toolName] || 0) + 1;
  }
  saveStats();
}

// 모듈 초기화 — 로드 + ensureToday + 디바운스 저장
state.statsData = loadStats();
ensureToday();
saveStats();

module.exports = {
  loadStats: loadStats,
  ensureToday: ensureToday,
  saveStats: saveStats,
  flushStats: flushStats,
  recordStat: recordStat,
  STATS_FILE: STATS_FILE,
};
