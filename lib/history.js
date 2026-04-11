// 세션 히스토리 저장/파싱 -- JSONL transcript를 파싱하고 세션 요약을 디스크에 기록

var fs = require('fs');
var path = require('path');
var state = require('./state');
var utils = require('./utils');

var isValidTranscriptPath = utils.isValidTranscriptPath;
var TRANSCRIPT_MAX_BYTES = utils.TRANSCRIPT_MAX_BYTES;
var isNoiseUserText = utils.isNoiseUserText;
var maskSecrets = utils.maskSecrets;
var truncate = utils.truncate;
var isPrivacyOn = utils.isPrivacyOn;
var HISTORY_MAX_SUMMARY_LEN = utils.HISTORY_MAX_SUMMARY_LEN;

var HISTORY_DIR = path.join(__dirname, '..', 'history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

var HISTORY_DIR_MAX_BYTES = 10 * 1024 * 1024; // history/ 디렉토리 최대 10MB

// JSONL transcript 파싱하여 (userText, summary) 쌍 배열 반환
// 매번 갱신될 수 있는 path를 받아 안전하게 읽고, 손상된 라인은 건너뛴다
function parseTranscriptTurns(transcriptPath) {
  if (!isValidTranscriptPath(transcriptPath)) return [];
  if (!fs.existsSync(transcriptPath)) return [];
  try {
    var stat = fs.statSync(transcriptPath);
    if (stat.size > TRANSCRIPT_MAX_BYTES) {
      console.log('  [HISTORY] transcript too large, skipped:', transcriptPath, '(' + stat.size + 'B)');
      return [];
    }
    var fileContent = fs.readFileSync(transcriptPath, 'utf8');
    var lines = fileContent.split('\n').filter(function(l) { return l.trim(); });
    var turns = []; // [{ userText, lastAssistantText }]
    var currentTurn = null;

    for (var i = 0; i < lines.length; i++) {
      var d;
      try { d = JSON.parse(lines[i]); } catch(e) { continue; }
      var type = d.type;
      if (type === 'user') {
        var msg = d.message || {};
        var msgContent = msg.content;
        // tool_result만 들어있는 user 메시지는 도구 응답이지 사용자 입력이 아님
        if (Array.isArray(msgContent)) {
          var allToolResult = msgContent.length > 0 && msgContent.every(function(c) { return c && c.type === 'tool_result'; });
          if (allToolResult) continue;
        }
        var text = '';
        if (typeof msgContent === 'string') text = msgContent;
        else if (Array.isArray(msgContent)) {
          var txt = msgContent.find(function(c) { return c && c.type === 'text'; });
          if (txt) text = txt.text || '';
        }
        if (text && !isNoiseUserText(text)) {
          if (currentTurn) turns.push(currentTurn);
          currentTurn = { userText: text, lastAssistantText: '' };
        }
      } else if (type === 'assistant' && currentTurn) {
        var amsg = d.message || {};
        var acontent = amsg.content;
        if (Array.isArray(acontent)) {
          var atxt = acontent.filter(function(c) { return c && c.type === 'text' && c.text; }).map(function(c) { return c.text; }).join('\n');
          if (atxt) currentTurn.lastAssistantText = atxt; // 마지막 assistant text로 덮어씀
        }
      }
    }
    if (currentTurn) turns.push(currentTurn);
    return turns;
  } catch(e) {
    console.log('  [HISTORY] transcript parse error:', e.message);
    return [];
  }
}

// 트래커의 turns 배열과 transcript의 (userText, summary) 쌍을 매칭
// 매칭 전략:
//   - tracker prompt는 truncate(500자, 끝에 ...)로 저장됨
//   - 매칭 키는 trailing ... 제거 + whitespace 정규화
//   - 1단계: 정확 일치 (truncate되지 않은 prompt)
//   - 2단계: transcript의 user text가 prompt(truncate된)로 시작하는지 (prompt가 truncate된 케이스)
//   - 짧은 prompt(5자 미만) -> 매칭 포기 (오답 방지)
function buildTurnSummaries(trackerTurns, transcriptTurns) {
  function normFull(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  function stripEllipsis(s) {
    return s.replace(/…$/, '').trim();
  }
  // transcript turn -> summary (firstPara + mask + truncate) 미리 계산
  var precomputed = transcriptTurns.map(function(tt) {
    var firstPara = (tt.lastAssistantText || '').split(/\n\n+/)[0] || '';
    return {
      full: normFull(tt.userText),
      summary: truncate(maskSecrets(firstPara), HISTORY_MAX_SUMMARY_LEN),
    };
  });
  // 사용 여부 추적 (한 transcript turn이 여러 tracker turn에 매칭되지 않도록)
  var used = new Array(precomputed.length).fill(false);

  function findMatch(turnPrompt) {
    if (!turnPrompt) return -1;
    var key = stripEllipsis(normFull(turnPrompt));
    if (key.length < 5) return -1; // 너무 짧으면 오매칭 위험 -> 포기
    // 1단계: 정확 일치
    for (var i = 0; i < precomputed.length; i++) {
      if (used[i]) continue;
      if (precomputed[i].full === key) return i;
    }
    // 2단계: transcript가 key로 시작 (tracker prompt가 truncate된 경우만 허용 -- 역방향 X)
    for (var j = 0; j < precomputed.length; j++) {
      if (used[j]) continue;
      // tracker prompt(key)가 transcript full보다 짧을 때만 prefix 매칭 허용
      if (key.length < precomputed[j].full.length && precomputed[j].full.startsWith(key)) return j;
    }
    return -1;
  }

  return trackerTurns.map(function(turn) {
    var pos = findMatch(turn.prompt);
    if (pos < 0) return '';
    used[pos] = true;
    return precomputed[pos].summary;
  });
}

function saveSessionHistory(pid) {
  var t = state.sessionTrackers[pid];
  if (!t) return;
  var sess = state.sessions[pid];
  if (!sess || t.questions === 0) { delete state.sessionTrackers[pid]; return; }

  // privacy ON: 디스크 저장 자체를 skip
  // (메모리 트래커는 정리해서 누수 방지. 실시간 UI는 메모리 기반이라 영향 없음)
  if (isPrivacyOn()) {
    console.log('  [HISTORY] privacy ON — skipped:', sess.name || pid);
    delete state.sessionTrackers[pid];
    return;
  }

  var avgSec = t.responseTimes.length > 0 ? Math.round(t.responseTimes.reduce(function(a, b) { return a + b; }, 0) / t.responseTimes.length) : 0;
  var maxSec = t.responseTimes.length > 0 ? Math.max.apply(null, t.responseTimes) : 0;
  var maxQ = maxSec > 0 ? t.responseTimes.indexOf(maxSec) + 1 : 0;

  // 에이전트 요약
  var agentSummary = {};
  Object.keys(t.agents).forEach(function(k) {
    var a = t.agents[k];
    agentSummary[k] = { count: a.count, avgSec: a.count > 0 ? Math.round(a.totalSec / a.count) : 0 };
  });

  // 파일 Top 10
  var fileKeys = Object.keys(t.files).sort(function(a, b) {
    return (t.files[b].read + t.files[b].edit) - (t.files[a].read + t.files[a].edit);
  }).slice(0, 10);
  var fileSummary = {};
  fileKeys.forEach(function(k) { fileSummary[k] = t.files[k]; });

  // 응답 요약 추출 (JSONL transcript 파싱) -- text 매칭으로 인덱스 무관
  var transcriptTurns = parseTranscriptTurns(t.transcriptPath);
  var summaries = buildTurnSummaries(t.turns, transcriptTurns);
  var turnsOut = t.turns.map(function(turn, idx) {
    return {
      q: turn.q,
      prompt: turn.prompt,
      summary: summaries[idx] || '',
      sec: turn.sec,
      tools: turn.tools,
      agents: turn.agents,
    };
  });

  var record = {
    name: sess.name || pid,
    cwd: sess.cwd || '',
    startTime: sess.startTime,
    endTime: new Date().toISOString(),
    questions: t.questions,
    avgResponseSec: avgSec,
    longestQuestion: maxSec > 0 ? { q: maxQ, sec: maxSec } : null,
    agents: agentSummary,
    tools: t.tools,
    files: fileSummary,
    turns: turnsOut,
    truncated: t.truncated === true || t.questions > turnsOut.length,
  };

  // 파일명: YYYY-MM-DD_HHmmss_sessionName.json
  var now = new Date();
  var ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
    + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
  var safeName = (sess.name || pid).replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 40);
  var filename = ts + '_' + safeName + '.json';

  try {
    var json = JSON.stringify(record);
    fs.writeFileSync(path.join(HISTORY_DIR, filename), json, 'utf8');
    console.log('  [HISTORY] saved:', filename, '(' + json.length + 'B)');
  } catch(e) { console.log('  [HISTORY] save error:', e.message); }

  delete state.sessionTrackers[pid];
}

function cleanHistory() {
  // 1) 7일 이상 된 히스토리 파일 삭제
  var MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  try {
    var allFiles = fs.readdirSync(HISTORY_DIR).filter(function(f) { return f.endsWith('.json'); });
    allFiles.forEach(function(f) {
      var fpath = path.join(HISTORY_DIR, f);
      var stat = fs.statSync(fpath);
      if (Date.now() - stat.mtimeMs > MAX_AGE) {
        fs.unlinkSync(fpath);
        console.log('  [HISTORY] cleaned (age):', f);
      }
    });
    // 2) 디렉토리 전체 크기가 상한 초과 시 오래된 것부터 추가 삭제
    var remaining = fs.readdirSync(HISTORY_DIR)
      .filter(function(f) { return f.endsWith('.json'); })
      .map(function(f) {
        var fpath = path.join(HISTORY_DIR, f);
        var st = fs.statSync(fpath);
        return { f: f, path: fpath, size: st.size, mtime: st.mtimeMs };
      })
      .sort(function(a, b) { return a.mtime - b.mtime }); // 오래된 순
    var totalSize = remaining.reduce(function(a, b) { return a + b.size; }, 0);
    while (totalSize > HISTORY_DIR_MAX_BYTES && remaining.length > 0) {
      var oldest = remaining.shift();
      try {
        fs.unlinkSync(oldest.path);
        totalSize -= oldest.size;
        console.log('  [HISTORY] cleaned (size):', oldest.f);
      } catch(e2) {}
    }
  } catch(e) { console.log('  [HISTORY] clean error:', e.message); }
}

module.exports = {
  HISTORY_DIR: HISTORY_DIR,
  HISTORY_DIR_MAX_BYTES: HISTORY_DIR_MAX_BYTES,
  parseTranscriptTurns: parseTranscriptTurns,
  buildTurnSummaries: buildTurnSummaries,
  saveSessionHistory: saveSessionHistory,
  cleanHistory: cleanHistory,
};
