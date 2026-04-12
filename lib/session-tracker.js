// 세션별 요약 트래커 -- 세션 이벤트를 추적하여 메모리에 누적
// 세션 종료 시 history.js의 saveSessionHistory()가 디스크에 저장

var fs = require('fs');
var path = require('path');
var state = require('./state');
var utils = require('./utils');
var sse = require('./sse');

var isValidTranscriptPath = utils.isValidTranscriptPath;
var maskSecrets = utils.maskSecrets;
var truncate = utils.truncate;
var isPrivacyOn = utils.isPrivacyOn;
var HISTORY_MAX_PROMPT_LEN = utils.HISTORY_MAX_PROMPT_LEN;
var HISTORY_MAX_QUESTIONS_PER_SESSION = utils.HISTORY_MAX_QUESTIONS_PER_SESSION;
var TRANSCRIPT_MAX_BYTES = utils.TRANSCRIPT_MAX_BYTES;

var _renameCache = {}; // transcriptPath → { size, rename }

function getTracker(pid) {
  if (!state.sessionTrackers[pid]) {
    state.sessionTrackers[pid] = {
      questions: 0,
      thinkStart: null,
      responseTimes: [],
      agents: {},       // type -> { count, totalSec, startTime }
      tools: {},        // name -> count
      files: {},        // path -> { read: n, edit: n }
      turns: [],        // [{ q, prompt, startTime, endTime, tools: {} }]
      transcriptPath: null,
    };
  }
  return state.sessionTrackers[pid];
}

// thinking_start 없이 도착한 이벤트(recover 시나리오)를 위한 더미 turn 생성.
// 활성 turn이 있으면 그대로 반환, 없으면 빈 prompt의 turn 생성. 100개 cap 초과 시 null.
function ensureCurrentTurn(t) {
  if (t.truncated) return null;
  var cur = t.turns[t.turns.length - 1];
  if (cur && !cur.endTime) return cur;
  if (t.turns.length >= HISTORY_MAX_QUESTIONS_PER_SESSION) { t.truncated = true; return null; }
  t.questions++;
  var dummy = {
    q: t.questions,
    prompt: '', // recover 더미 — prompt 원본 없음
    startTime: Date.now(),
    endTime: null,
    sec: 0,
    tools: {},
    agents: {},
  };
  t.turns.push(dummy);
  return dummy;
}

function recordSessionEvent(pid, parsed) {
  if (!pid) return;
  var t = getTracker(pid);

  if (parsed.event === 'thinking_start') {
    t.questions++;
    t.thinkStart = Date.now();
    // transcript_path는 매 질문마다 갱신 (/clear 후 새 transcript 시작 대응)
    // 저장 시점에 whitelist 검증 -> invalid path가 메모리에 머물지 않게 (path traversal 방어)
    if (parsed.transcript_path && isValidTranscriptPath(parsed.transcript_path)) {
      t.transcriptPath = parsed.transcript_path;
    }
    // /rename 명령 자동 감지 -> 세션 이름 동기화 (transcript의 rename이 hook session.name보다 우선)
    if (parsed.transcript_path && state.sessions[pid]) {
      var renamed = extractLatestRenameFromTranscript(parsed.transcript_path);
      if (renamed && renamed !== state.sessions[pid].name) {
        var oldName = state.sessions[pid].name;
        state.sessions[pid].name = renamed;
        state.sessions[pid]._renamedFromTranscript = true;
        console.log('  [SESSION~] /rename detected:', oldName, '→', renamed);
        sse.broadcastEvent({ event: 'session_renamed', session_pid: pid, session_name: renamed });
      }
    }
    // turn 기록 (프롬프트 포함, privacy 모드면 생략)
    if (t.turns.length < HISTORY_MAX_QUESTIONS_PER_SESSION) {
      var promptText = isPrivacyOn() ? '' : truncate(maskSecrets(parsed.prompt || ''), HISTORY_MAX_PROMPT_LEN);
      t.turns.push({
        q: t.questions,
        prompt: promptText,
        startTime: Date.now(),
        endTime: null,
        sec: 0,
        tools: {},
        agents: {},
      });
    } else {
      // 100개 cap 도달 — turns에 추가 안 함, truncated 플래그
      t.truncated = true;
    }
  }
  // truncated 상태에서는 마지막(99번째) turn에 후속 이벤트가 잘못 합산되지 않도록 차단
  // 세션 전체 통계(t.tools, t.agents, t.responseTimes)는 계속 누적
  var canUpdateTurn = !t.truncated;

  if (parsed.event === 'thinking_end' && t.thinkStart) {
    var sec = Math.round((Date.now() - t.thinkStart) / 1000);
    t.responseTimes.push(sec);
    t.thinkStart = null;
    if (canUpdateTurn) {
      var curTurn = t.turns[t.turns.length - 1];
      if (curTurn && !curTurn.endTime) {
        curTurn.endTime = Date.now();
        curTurn.sec = sec;
      }
    }
  }
  if (parsed.event === 'agent_start' && parsed.agent_type) {
    var aKey = parsed.agent_type;
    if (!t.agents[aKey]) t.agents[aKey] = { count: 0, totalSec: 0, starts: [] };
    t.agents[aKey].count++;
    t.agents[aKey].starts.push(Date.now());
    if (canUpdateTurn) {
      // recover 시나리오에서 활성 turn 없으면 더미 생성
      var curT = ensureCurrentTurn(t);
      if (curT) curT.agents[aKey] = (curT.agents[aKey] || 0) + 1;
    }
  }
  if (parsed.event === 'agent_done' && parsed.agent_type) {
    var aKey = parsed.agent_type;
    if (t.agents[aKey] && t.agents[aKey].starts && t.agents[aKey].starts.length > 0) {
      var st = t.agents[aKey].starts.shift();
      t.agents[aKey].totalSec += Math.round((Date.now() - st) / 1000);
    }
  }
  if (parsed.event === 'tool_use' && parsed.tool_name) {
    t.tools[parsed.tool_name] = (t.tools[parsed.tool_name] || 0) + 1;
    // 현재 turn에도 기록 (100개 cap 미달일 때만, recover 시나리오에선 더미 turn 생성)
    if (canUpdateTurn) {
      var curT2 = ensureCurrentTurn(t);
      if (curT2) curT2.tools[parsed.tool_name] = (curT2.tools[parsed.tool_name] || 0) + 1;
    }
    // 파일 경로 추출
    var input = parsed.tool_input || {};
    var fp = input.file_path || input.path || '';
    if (fp && (parsed.tool_name === 'Read' || parsed.tool_name === 'Edit' || parsed.tool_name === 'Write')) {
      if (!t.files[fp] && Object.keys(t.files).length < 500) t.files[fp] = { read: 0, edit: 0 };
      if (t.files[fp]) {
        if (parsed.tool_name === 'Read') t.files[fp].read++;
        else t.files[fp].edit++;
      }
    }
  }
}

// JSONL transcript에서 가장 최근 /rename 명령의 인자(새 이름)를 추출
// Claude Code의 /rename은 system + local_command 메시지에 <command-name>/rename</command-name> + <command-args>NAME</command-args> 형식
// 전략: 초회 전체 스캔 → 이후 새로 추가된 바이트만 delta 읽기 (append-only 특성 활용)
function _scanRenameInBuffer(buf) {
  var text = buf.toString('utf8');
  var lines = text.split('\n').filter(function(l) { return l.trim(); });
  for (var i = lines.length - 1; i >= 0; i--) {
    var d;
    try { d = JSON.parse(lines[i]); } catch(e) { continue; }
    if (d.type !== 'system' || d.subtype !== 'local_command') continue;
    var content = d.content || '';
    if (content.indexOf('<command-name>/rename</command-name>') === -1) continue;
    var m = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractLatestRenameFromTranscript(transcriptPath) {
  if (!isValidTranscriptPath(transcriptPath)) return null;
  if (!fs.existsSync(transcriptPath)) return null;
  try {
    var stat = fs.statSync(transcriptPath);
    if (stat.size > TRANSCRIPT_MAX_BYTES) return null;

    var cached = _renameCache[transcriptPath];

    // 파일 크기 변화 없음 → 캐시 반환
    if (cached && cached.size === stat.size) return cached.rename;

    // delta 읽기: 이전에 확인한 위치 이후의 새 바이트만 읽기
    if (cached && cached.size < stat.size) {
      var deltaSize = stat.size - cached.size;
      var deltaBuf = Buffer.alloc(deltaSize);
      var fd = fs.openSync(transcriptPath, 'r');
      fs.readSync(fd, deltaBuf, 0, deltaSize, cached.size);
      fs.closeSync(fd);
      var found = _scanRenameInBuffer(deltaBuf);
      _renameCache[transcriptPath] = { size: stat.size, rename: found || cached.rename };
      return found || cached.rename;
    }

    // 초회 또는 파일이 줄어든 경우 (새 세션): 전체 스캔
    var fullBuf = fs.readFileSync(transcriptPath);
    var found = _scanRenameInBuffer(fullBuf);
    _renameCache[transcriptPath] = { size: stat.size, rename: found };
    return found;
  } catch(e) { return null; }
}

// 테스트용 캐시 초기화 (실 환경에서는 사용 안 함)
function _clearRenameCache() { _renameCache = {}; }

module.exports = {
  getTracker: getTracker,
  ensureCurrentTurn: ensureCurrentTurn,
  recordSessionEvent: recordSessionEvent,
  extractLatestRenameFromTranscript: extractLatestRenameFromTranscript,
  _clearRenameCache: _clearRenameCache,
};
