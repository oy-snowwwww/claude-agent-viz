// 공유 상태 -- 모든 모듈이 참조하는 중앙 저장소
// 객체 참조(sessions, sessionTrackers, pendingEnds)는 직접 접근
// 값 교체되는 변수(sseClients, statsData, pointsData)는 getter/setter

var sessions = {};           // pid -> { pid, name, cwd, startTime, lastActivity, eventCount }
var sessionTrackers = {};    // pid -> tracker
var pendingEnds = {};        // pid -> setTimeout handle

var sseClients = [];
var statsData = {};
var pointsData = {};

module.exports = {
  sessions: sessions,
  sessionTrackers: sessionTrackers,
  pendingEnds: pendingEnds,
  get sseClients() { return sseClients; },
  set sseClients(v) { sseClients = v; },
  get statsData() { return statsData; },
  set statsData(v) { statsData = v; },
  get pointsData() { return pointsData; },
  set pointsData(v) { pointsData = v; },
};
