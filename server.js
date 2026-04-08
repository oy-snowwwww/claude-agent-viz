#!/usr/bin/env node
/**
 * Claude Agent Orchestrator - Local Server
 * ~/.claude/agents/*.md 파일을 읽고/쓰고 시각화 제공
 *
 * 실행: node ~/.claude/agent-viz/server.js
 * 또는: claude-viz (alias 설정 시)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.AGENT_VIZ_PORT || '54321', 10);
const AGENTS_DIR = path.join(process.env.HOME, '.claude', 'agents');
const MCP_JSON = path.join(process.env.HOME, '.mcp.json');
const SETTINGS_JSON = path.join(process.env.HOME, '.claude', 'settings.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const HTML_PATH = path.join(PUBLIC_DIR, 'index.html');
const GLOBAL_CLAUDE_MD = path.join(process.env.HOME, 'CLAUDE.md');

// Path Traversal 방어: 대상 경로가 허용 디렉토리 하위인지 검증
function safePath(baseDir, userInput) {
  var resolved = path.resolve(baseDir, userInput);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) return null;
  return resolved;
}

// --- YAML Frontmatter Parser (간단한 파서, 외부 의존성 없음) ---
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const raw = match[1];
  const body = match[2].trim();
  const meta = {};

  raw.split('\n').forEach(function(line) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) return;
    var key = m[1];
    var val = m[2].trim();
    // array 파싱 ["a","b"]
    if (val.startsWith('[')) {
      try { val = JSON.parse(val); } catch(e) { /* keep string */ }
    }
    // boolean
    if (val === 'true') val = true;
    if (val === 'false') val = false;
    meta[key] = val;
  });

  return { meta: meta, body: body };
}

function buildFrontmatter(meta, body) {
  var lines = ['---'];
  if (meta.name) lines.push('name: ' + meta.name);
  if (meta.description) lines.push('description: ' + meta.description);
  if (meta.tools) {
    if (Array.isArray(meta.tools)) {
      lines.push('tools: ' + JSON.stringify(meta.tools));
    } else {
      lines.push('tools: ' + meta.tools);
    }
  }
  if (meta.model) lines.push('model: ' + meta.model);
  lines.push('---');
  lines.push('');
  lines.push(body);
  return lines.join('\n');
}

// --- Read all agents ---
function readAgents() {
  var agents = [];
  if (!fs.existsSync(AGENTS_DIR)) return agents;

  fs.readdirSync(AGENTS_DIR).forEach(function(file) {
    if (!file.endsWith('.md')) return;
    var content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    var parsed = parseFrontmatter(content);
    agents.push({
      filename: file,
      id: file.replace('.md', ''),
      name: parsed.meta.name || file.replace('.md', ''),
      description: parsed.meta.description || '',
      tools: parsed.meta.tools || [],
      model: parsed.meta.model || 'sonnet',
      body: parsed.body,
      raw: content
    });
  });
  return agents;
}

function readMcpServers() {
  var servers = [];
  // ~/.mcp.json
  if (fs.existsSync(MCP_JSON)) {
    try {
      var data = JSON.parse(fs.readFileSync(MCP_JSON, 'utf8'));
      var mcp = data.mcpServers || {};
      Object.keys(mcp).forEach(function(id) {
        var s = mcp[id];
        var cmd = s.command || '';
        var args = s.args || [];
        var type = cmd;
        if (cmd === 'docker') type = 'docker';
        else if (cmd === 'npx' || cmd.includes('npx')) type = 'npx';
        else if (cmd === 'node' || cmd.includes('node')) type = 'node';
        else if (cmd.includes('python')) type = 'python';
        servers.push({ id: id, name: id, command: cmd, args: args, type: type, source: '~/.mcp.json' });
      });
    } catch(e) {}
  }
  // settings.json / settings.local.json mcpServers
  var settingsFiles = [
    path.join(process.env.HOME, '.claude', 'settings.json'),
    path.join(process.env.HOME, '.claude', 'settings.local.json')
  ];
  settingsFiles.forEach(function(f) {
    if (!fs.existsSync(f)) return;
    try {
      var data = JSON.parse(fs.readFileSync(f, 'utf8'));
      var mcp = data.mcpServers || {};
      Object.keys(mcp).forEach(function(id) {
        if (servers.find(function(s) { return s.id === id; })) return;
        var s = mcp[id];
        servers.push({ id: id, name: id, command: s.command || '', type: s.command || '', source: path.basename(f) });
      });
    } catch(e) {}
  });
  return servers;
}

function readHooks() {
  var result = [];
  if (!fs.existsSync(SETTINGS_JSON)) return result;
  try {
    var data = JSON.parse(fs.readFileSync(SETTINGS_JSON, 'utf8'));
    var hooks = data.hooks || {};
    Object.keys(hooks).forEach(function(event) {
      var entries = hooks[event] || [];
      entries.forEach(function(entry) {
        var matcher = entry.matcher || '';
        var innerHooks = entry.hooks || [];
        innerHooks.forEach(function(h) {
          result.push({
            event: event,
            type: h.type || 'command',
            command: h.command || '',
            matcher: matcher
          });
        });
      });
    });
  } catch(e) {}
  return result;
}

// --- Session History ---
var HISTORY_DIR = path.join(__dirname, 'history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// 히스토리 용량 방어 상수
var HISTORY_MAX_PROMPT_LEN = 500;       // 프롬프트 최대 길이
var HISTORY_MAX_SUMMARY_LEN = 300;      // 응답 요약 최대 길이
var HISTORY_MAX_QUESTIONS_PER_SESSION = 100;  // 세션당 최대 질문 수
var HISTORY_DIR_MAX_BYTES = 10 * 1024 * 1024; // history/ 디렉토리 최대 10MB

// Privacy: 프롬프트 기록 여부 (파일 존재로 제어)
var PRIVACY_FILE = path.join(__dirname, 'privacy');
function isPrivacyOn() { return fs.existsSync(PRIVACY_FILE); }

// 민감정보 마스킹 (API 키/토큰 패턴)
function maskSecrets(s) {
  if (!s) return s;
  return String(s)
    // OpenAI / Anthropic / 일반 sk- 계열 (sk-proj-, sk-ant- 등 모두 매칭)
    .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_KEY]')
    // GitHub tokens
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, '[REDACTED_GH]')
    .replace(/ghs_[a-zA-Z0-9]{20,}/g, '[REDACTED_GH]')
    .replace(/gho_[a-zA-Z0-9]{20,}/g, '[REDACTED_GH]')
    .replace(/ghu_[a-zA-Z0-9]{20,}/g, '[REDACTED_GH]')
    .replace(/github_pat_[a-zA-Z0-9_]{22,}/g, '[REDACTED_GH]')
    // Slack
    .replace(/xox[baprs]-[a-zA-Z0-9-]{20,}/g, '[REDACTED_SLACK]')
    // AWS Access Key
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS]')
    // JWT (3 segment base64url, 첫 segment는 일반적으로 eyJ로 시작)
    .replace(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, '[REDACTED_JWT]')
    // Bearer 토큰 — 일반 단어 false positive 방지를 위해 컨텍스트를 좁힘
    // 1) Authorization 헤더 컨텍스트 (가장 확실)
    .replace(/(Authorization\s*:\s*Bearer\s+)\S+/gi, '$1[REDACTED]')
    // 2) Bearer + JWT 형태 (eyJ로 시작하는 3-segment base64url)
    .replace(/\bBearer\s+eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, 'Bearer [REDACTED]')
    // 3) Bearer + 40자 이상 문자열 (일반 영어 단어는 40자 미만)
    .replace(/\bBearer\s+[A-Za-z0-9._\-]{40,}/g, 'Bearer [REDACTED]');
}

// CSRF 방어: Origin 헤더가 있으면 host와 일치해야 함
// (curl 등 server-to-server 요청은 Origin 없음 → 허용)
function isAllowedOrigin(req) {
  var origin = req.headers.origin || '';
  var host = req.headers.host || '';
  if (!origin) return true;
  try {
    var u = new URL(origin);
    return u.host === host;
  } catch(e) { return false; }
}
function truncate(s, max) {
  if (!s) return '';
  var cleaned = String(s).replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

// 세션별 요약 트래커 (메모리) — 세션 종료 시 요약 파일로 저장
var sessionTrackers = {}; // pid -> tracker

function getTracker(pid) {
  if (!sessionTrackers[pid]) {
    sessionTrackers[pid] = {
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
  return sessionTrackers[pid];
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
    // 저장 시점에 whitelist 검증 → invalid path가 메모리에 머물지 않게 (path traversal 방어)
    if (parsed.transcript_path && isValidTranscriptPath(parsed.transcript_path)) {
      t.transcriptPath = parsed.transcript_path;
    }
    // /rename 명령 자동 감지 → 세션 이름 동기화 (transcript의 rename이 hook session.name보다 우선)
    if (parsed.transcript_path && sessions[pid]) {
      var renamed = extractLatestRenameFromTranscript(parsed.transcript_path);
      if (renamed && renamed !== sessions[pid].name) {
        var oldName = sessions[pid].name;
        sessions[pid].name = renamed;
        sessions[pid]._renamedFromTranscript = true;
        console.log('  [SESSION~] /rename detected:', oldName, '→', renamed);
        broadcastEvent({ event: 'session_renamed', session_pid: pid, session_name: renamed });
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

// transcript path 화이트리스트 검증 (Path Traversal 방어)
// ~/.claude/projects/ 하위 + .jsonl 확장자만 허용
var TRANSCRIPT_BASE = path.resolve(process.env.HOME || '', '.claude', 'projects');
var TRANSCRIPT_MAX_BYTES = 50 * 1024 * 1024; // 50MB
function isValidTranscriptPath(p) {
  if (!p || typeof p !== 'string') return false;
  try {
    var resolved = path.resolve(p);
    if (!resolved.startsWith(TRANSCRIPT_BASE + path.sep)) return false;
    if (!resolved.endsWith('.jsonl')) return false;
    return true;
  } catch(e) { return false; }
}

// 시스템 메시지/캐비엇 식별 (실제 사용자 질문이 아님)
function isNoiseUserText(text) {
  if (!text) return true;
  var trimmed = text.trim();
  if (/^\[Request interrupted/.test(trimmed)) return true;
  // 멀티라인 wrapper strip 후 남은 텍스트 기준으로 판정:
  //   - wrapper만 있으면(strip 결과 빈 문자열) noise
  //   - wrapper + 실제 사용자 텍스트면 실제 텍스트를 살림 (noise 아님)
  var TAG = '(command-name|command-message|command-args|system-reminder|local-command-(stdout|stderr|caveat)|tool_use_error|user_input|bash-stdout|bash-stderr|bash-input|bash-output|request_metadata)';
  var stripped = trimmed
    .replace(new RegExp('<' + TAG + '[^>]*>[\\s\\S]*?</\\1>', 'g'), '')
    .replace(new RegExp('<' + TAG + '[^>]*/>', 'g'), '')
    .trim();
  return !stripped;
}

// JSONL transcript에서 가장 최근 /rename 명령의 인자(새 이름)를 추출
// Claude Code의 /rename은 system + local_command 메시지에 <command-name>/rename</command-name> + <command-args>NAME</command-args> 형식
function extractLatestRenameFromTranscript(transcriptPath) {
  if (!isValidTranscriptPath(transcriptPath)) return null;
  if (!fs.existsSync(transcriptPath)) return null;
  try {
    var stat = fs.statSync(transcriptPath);
    if (stat.size > TRANSCRIPT_MAX_BYTES) return null;
    var fileContent = fs.readFileSync(transcriptPath, 'utf8');
    var lines = fileContent.split('\n').filter(function(l) { return l.trim(); });
    var latest = null;
    // 끝에서 거꾸로 스캔 (최신 rename 우선)
    for (var i = lines.length - 1; i >= 0; i--) {
      var d;
      try { d = JSON.parse(lines[i]); } catch(e) { continue; }
      if (d.type !== 'system' || d.subtype !== 'local_command') continue;
      var content = d.content || '';
      if (content.indexOf('<command-name>/rename</command-name>') === -1) continue;
      var m = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
      if (m && m[1]) {
        latest = m[1].trim();
        break;
      }
    }
    return latest;
  } catch(e) { return null; }
}

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
//   - tracker prompt는 truncate(500자, 끝에 …)로 저장됨
//   - 매칭 키는 trailing … 제거 + whitespace 정규화
//   - 1단계: 정확 일치 (truncate되지 않은 prompt)
//   - 2단계: transcript의 user text가 prompt(truncate된)로 시작하는지 (prompt가 truncate된 케이스)
//   - 짧은 prompt(5자 미만) → 매칭 포기 (오답 방지)
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
    if (key.length < 5) return -1; // 너무 짧으면 오매칭 위험 → 포기
    // 1단계: 정확 일치
    for (var i = 0; i < precomputed.length; i++) {
      if (used[i]) continue;
      if (precomputed[i].full === key) return i;
    }
    // 2단계: transcript가 key로 시작 (tracker prompt가 truncate된 경우만 허용 — 역방향 X)
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
  var t = sessionTrackers[pid];
  if (!t) return;
  var sess = sessions[pid];
  if (!sess || t.questions === 0) { delete sessionTrackers[pid]; return; }

  // privacy ON: 디스크 저장 자체를 skip
  // (메모리 트래커는 정리해서 누수 방지. 실시간 UI는 메모리 기반이라 영향 없음)
  if (isPrivacyOn()) {
    console.log('  [HISTORY] privacy ON — skipped:', sess.name || pid);
    delete sessionTrackers[pid];
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

  // 응답 요약 추출 (JSONL transcript 파싱) — text 매칭으로 인덱스 무관
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

  delete sessionTrackers[pid];
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
// cleanHistory + interval 은 server.listen 블록 안에서 초기화 (require() 테스트 시 side-effect 방지)
var _cleanHistoryInterval = null;
var _checkSessionsInterval = null;

// --- Daily Stats ---
var STATS_FILE = path.join(__dirname, 'agent-stats.json');

function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

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

var statsData = loadStats();
ensureToday();
saveStats();

function ensureToday() {
  var today = todayKey();
  if (!statsData.today || statsData.today.date !== today) {
    // 이전 today를 history로 이동
    if (statsData.today && statsData.today.date) {
      if (!statsData.history) statsData.history = [];
      statsData.history.push(statsData.today);
      // 최근 90일만 보관
      if (statsData.history.length > 90) statsData.history = statsData.history.slice(-90);
    }
    statsData.today = { date: today, prompts: 0, agents: {}, tools: {} };
  }
  if (!statsData.total) statsData.total = { since: today, prompts: 0, agents: {}, tools: {}, days: 0 };
  if (!statsData.history) statsData.history = [];
}

function saveStats() {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(statsData), 'utf8'); } catch(e) {}
}

function recordStat(event, toolName, agentType) {
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

// --- Session Tracking ---
var sessions = {}; // pid → { pid, name, cwd, startTime, lastActivity, eventCount }
var pendingEnds = {}; // pid → setTimeout handle (세션 종료 디바운스)

// --- SSE (Server-Sent Events) for real-time ---
var sseClients = [];

function broadcastEvent(eventData) {
  var msg = 'data: ' + JSON.stringify(eventData) + '\n\n';
  sseClients = sseClients.filter(function(client) {
    try { client.write(msg); return true; }
    catch(e) { return false; }
  });
}

// SSE keep-alive ping — 30초마다 모든 클라이언트에 주석 라인 전송
// 이벤트가 없을 때 연결이 idle timeout으로 끊기는 것을 방지
// graceful shutdown 시 clearInterval (SIGTERM/SIGINT 핸들러에서 정리)
// server.listen 블록 안에서 초기화 (require() 테스트 시 side-effect 방지)
var _ssePingInterval = null;

// --- HTTP Server ---
const server = http.createServer(function(req, res) {
  // CORS
  var origin = req.headers.origin || '';
  var allowedOrigin = (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) ? origin : 'http://localhost:' + PORT;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  var url = req.url.split('?')[0];

  // SSE: 브라우저가 실시간 이벤트를 구독
  if (url === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // 프록시 버퍼링 비활성화
    });
    res.write('retry: 3000\n\n'); // 클라이언트에 재연결 간격 힌트 (3초)
    res.write('data: {"event":"connected"}\n\n');
    sseClients.push(res);
    req.on('close', function() {
      sseClients = sseClients.filter(function(c) { return c !== res; });
    });
    return;
  }

  // Hook Events: Claude Code Hook에서 POST로 전달
  if (url === '/api/events' && req.method === 'POST') {
    var bodyChunks = [];
    req.on('data', function(c) { bodyChunks.push(c); });
    req.on('end', function() {
      try {
        var data = JSON.parse(Buffer.concat(bodyChunks).toString());

        // 이벤트 타입별 처리
        var event = data.event || 'unknown';
        var toolInput = data.data || {};
        var session = data.session || {};

        var parsed = {
          event: event,
          timestamp: new Date().toISOString(),
          tool_name: toolInput.tool_name || '',
          tool_input: toolInput.tool_input || {},
          session_pid: session.pid || '',
          session_name: session.name || '',
          session_cwd: session.cwd || '',
          session_tty: session.tty || '',
          // 훅 원본 데이터 중 히스토리에 필요한 필드
          prompt: toolInput.prompt || '',
          transcript_path: toolInput.transcript_path || '',
        };

        // Agent 도구인 경우 에이전트 정보 추출
        if (parsed.tool_name === 'Agent' || (parsed.tool_input && parsed.tool_input.subagent_type)) {
          var sat = parsed.tool_input.subagent_type || '';
          var nm = parsed.tool_input.name || '';
          var desc = parsed.tool_input.description || '';
          // subagent_type이 general-purpose이면 name을 우선 사용, 둘 다 없으면 description
          parsed.agent_type = (sat && sat !== 'general-purpose') ? sat : (nm || desc || sat || 'unknown');
          parsed.agent_description = parsed.tool_input.description || '';
          parsed.agent_prompt = (parsed.tool_input.prompt || '').substring(0, 200);
        }
        // 에이전트 내부 도구 사용 시 agent_type 전달
        if (toolInput.agent_type && !parsed.agent_type) {
          parsed.agent_type = toolInput.agent_type;
        }

        // 세션 종료 이벤트 — 디바운스로 메인 세션 종료만 처리
        // 에이전트 서브세션 종료 후 메인 세션 이벤트가 이어지면 타이머 취소
        if (event === 'session_end') {
          var endPid = session.pid || '';
          // TTY → 기존 세션 매칭
          var endTarget = sessions[endPid] ? endPid : null;
          if (!endTarget && session.sid) {
            endTarget = Object.keys(sessions).find(function(pid) {
              return sessions[pid].sid === session.sid && sessions[pid].alive !== false;
            }) || null;
          }
          if (endTarget && sessions[endTarget]) {
            // 이전 대기 중인 타이머 취소 후 재설정
            if (pendingEnds[endTarget]) clearTimeout(pendingEnds[endTarget]);
            var endName = sessions[endTarget].name || endTarget;
            console.log('  [SESSION-] pending session_end (3s):', endTarget, endName);
            pendingEnds[endTarget] = setTimeout(function() {
              delete pendingEnds[endTarget];
              if (sessions[endTarget]) {
                sessions[endTarget].alive = false;
                saveSessionHistory(endTarget);
                broadcastEvent({
                  event: 'session_stopped',
                  session_pid: endTarget,
                  session_name: sessions[endTarget].name || endTarget,
                });
                console.log('  [SESSION-] stopped:', endTarget, sessions[endTarget].name || '');
              }
            }, 3000);
          } else {
            console.log('  [SESSION-] ignored session_end (no match):', endPid);
          }
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
          return;
        }

        // 세션 추적
        if (session.pid) {
          var targetPid = session.pid;
          var isNew = !sessions[targetPid];

          if (!isNew && event === 'session_start') {
            // 같은 TTY에서 새 세션 시작 → 기존 세션 재활성화
            if (sessions[targetPid].alive === false) {
              sessions[targetPid].alive = true;
              sessions[targetPid].startTime = new Date().toISOString();
              if (session.sid) sessions[targetPid].sid = session.sid;
              broadcastEvent({ event: 'session_registered', session: sessions[targetPid] });
              console.log('  [SESSION+] revived:', sessions[targetPid].name);
            }
          }

          if (isNew && event === 'session_start') {
            // 에이전트 세션 감지: 기존 활성 세션으로 라우팅 (별도 탭 안 만듦)
            var existingSession = null;
            var incomingSid = session.sid || '';
            var incomingCwd = session.cwd || '';

            // 같은 sid의 활성 세션이 있으면 에이전트 세션 → 기존 세션으로 라우팅
            if (incomingSid) {
              existingSession = Object.keys(sessions).find(function(pid) {
                return sessions[pid].sid === incomingSid && sessions[pid].alive !== false;
              });
            }
            if (existingSession) {
              console.log('  [SESSION+] agent → existing:', sessions[existingSession].name);
              targetPid = existingSession;
              parsed.session_pid = existingSession;
              parsed.session_name = sessions[existingSession].name;
            }
            if (!sessions[targetPid]) {
              sessions[targetPid] = {
                pid: targetPid,
                name: session.name || 'Session ' + targetPid,
                cwd: session.cwd || '',
                tty: session.pid || session.tty || '',
                sid: session.sid || '',
                startTime: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                eventCount: 0
              };
              broadcastEvent({ event: 'session_registered', session: sessions[targetPid] });
              console.log('  [SESSION+]', session.name || targetPid, 'sid=' + (session.sid || '?').substring(0, 8));
            }
          } else if (isNew) {
            // session_start 없이 도착한 이벤트 → 세션 자동 복구
            // session.pid = TTY (hook-handler.sh에서 ps -o tty=로 추출)
            var ttyId = session.pid || '';
            var validTty = ttyId && ttyId !== 'none' && ttyId !== 'unknown';

            if (validTty) {
              // 유효한 TTY → 새 세션으로 등록 (CWD 매칭으로 다른 세션에 합치지 않음)
              targetPid = ttyId;
              sessions[targetPid] = {
                pid: targetPid,
                name: session.name || 'Session ' + targetPid,
                cwd: session.cwd || '',
                tty: ttyId,
                sid: session.sid || '',
                startTime: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                eventCount: 0
              };
              broadcastEvent({ event: 'session_registered', session: sessions[targetPid] });
              console.log('  [SESSION+] auto-recovered by TTY:', ttyId, sessions[targetPid].name);
            } else {
              // TTY 없음 → CWD 매칭 시도 (fallback)
              var candidates = [];
              if (session.cwd) {
                candidates = Object.keys(sessions).filter(function(pid) {
                  return sessions[pid].cwd === session.cwd;
                });
              }
              if (candidates.length > 0) {
                candidates.sort(function(a, b) {
                  return (sessions[b].lastActivity || '').localeCompare(sessions[a].lastActivity || '');
                });
                targetPid = candidates[0];
                parsed.session_pid = targetPid;
                parsed.session_name = sessions[targetPid].name;
              } else {
                // 매칭 실패 → 새 세션으로 자동 등록
                targetPid = session.pid;
                sessions[targetPid] = {
                  pid: targetPid,
                  name: session.name || 'Session ' + targetPid,
                  cwd: session.cwd || '',
                  tty: '',
                  sid: session.sid || '',
                  startTime: new Date().toISOString(),
                  lastActivity: new Date().toISOString(),
                  eventCount: 0
                };
                broadcastEvent({ event: 'session_registered', session: sessions[targetPid] });
                console.log('  [SESSION+] auto-recovered (no TTY):', sessions[targetPid].name);
              }
            }
          }

          if (targetPid && sessions[targetPid]) {
            // 새 상호작용 이벤트만 종료 타이머 취소 (thinking_end 등 잔여 이벤트는 무시)
            if (pendingEnds[targetPid] && (event === 'session_start' || event === 'thinking_start')) {
              clearTimeout(pendingEnds[targetPid]);
              delete pendingEnds[targetPid];
              console.log('  [SESSION-] cancelled pending end:', targetPid, '(new event:', event, ')');
            }
            sessions[targetPid].lastActivity = new Date().toISOString();
            sessions[targetPid].eventCount = (sessions[targetPid].eventCount || 0) + 1;
            // 세션 이름은 첫 등록 시 또는 사용자가 수동으로 rename 안 한 경우에만 hook session.name으로 갱신
            // (recordSessionEvent에서 transcript의 /rename을 우선시하기 위함)
            if (session.name && session.name !== 'unknown' && !sessions[targetPid]._renamedFromTranscript) {
              var oldName = sessions[targetPid].name;
              sessions[targetPid].name = session.name;
              if (oldName !== session.name) {
                broadcastEvent({ event: 'session_renamed', session_pid: targetPid, session_name: session.name });
              }
            }
          }
        }

        // 세션 이벤트 기록 (히스토리)
        var targetPidForLog = parsed.session_pid || session.pid || '';
        if (targetPidForLog) recordSessionEvent(targetPidForLog, parsed);

        // 일일 통계 기록
        recordStat(event, parsed.tool_name, parsed.agent_type);

        // 모든 SSE 클라이언트에 브로드캐스트
        broadcastEvent(parsed);

        // 콘솔 로그 (디버깅용)
        var sessionLabel = session.name ? '[' + session.name + '] ' : '';
        console.log('  [EVENT]', sessionLabel + event, parsed.tool_name || '', parsed.agent_type || '');

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // API: 세션 목록
  if (url === '/api/sessions' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(Object.values(sessions)));
    return;
  }

  // API: 세션 이름 변경
  if (url.startsWith('/api/sessions/') && req.method === 'PUT') {
    var pid = url.split('/api/sessions/')[1];
    var bodyChunks = [];
    req.on('data', function(c) { bodyChunks.push(c); });
    req.on('end', function() {
      try {
        var data = JSON.parse(Buffer.concat(bodyChunks).toString());
        if (sessions[pid]) {
          sessions[pid].name = data.name || sessions[pid].name;
          broadcastEvent({ event: 'session_renamed', session_pid: pid, session_name: sessions[pid].name });
          console.log('  [SESSION~]', pid, '->', sessions[pid].name);
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        } else {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'session not found'}));
        }
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // API: Master (CLAUDE.md) 정보 — ?cwd= 로 프로젝트 경로 지정 가능
  if (req.url.split('?')[0] === '/api/master' && req.method === 'GET') {
    var qs = req.url.split('?')[1] || '';
    var params = {};
    qs.split('&').forEach(function(p) { var kv = p.split('='); if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    var targetCwd = params.cwd || process.cwd();
    var projectPath = path.join(targetCwd, 'CLAUDE.md');

    var master = { global: '', project: '', projectPath: '', globalPath: GLOBAL_CLAUDE_MD, cwd: targetCwd };
    if (fs.existsSync(GLOBAL_CLAUDE_MD)) master.global = fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8');
    // 프로젝트 CLAUDE.md: 글로벌과 다른 경로일 때만
    if (projectPath !== GLOBAL_CLAUDE_MD && fs.existsSync(projectPath)) {
      master.project = fs.readFileSync(projectPath, 'utf8');
      master.projectPath = projectPath;
    }
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(master));
    return;
  }

  // API: Master CLAUDE.md 저장 (PUT /api/master/:type)
  if (url.startsWith('/api/master/') && req.method === 'PUT') {
    var type = url.split('/api/master/')[1];
    var bodyChunks = [];
    req.on('data', function(c) { bodyChunks.push(c); });
    req.on('end', function() {
      try {
        var data = JSON.parse(Buffer.concat(bodyChunks).toString());
        var filepath;
        if (type === 'global') {
          filepath = GLOBAL_CLAUDE_MD;
        } else {
          // cwd 기반 프로젝트 CLAUDE.md
          var targetCwd = data.cwd || process.cwd();
          filepath = path.join(targetCwd, 'CLAUDE.md');
        }
        fs.writeFileSync(filepath, data.content, 'utf8');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true, path: filepath}));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // API: 에이전트 목록
  if (url === '/api/agents' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(readAgents()));
    return;
  }

  // API: 에이전트 저장 (PUT /api/agents/:id)
  if (url.startsWith('/api/agents/') && req.method === 'PUT') {
    var id = url.split('/api/agents/')[1];
    var bodyChunks = [];
    req.on('data', function(c) { bodyChunks.push(c); });
    req.on('end', function() {
      try {
        var data = JSON.parse(Buffer.concat(bodyChunks).toString());
        var meta = {
          name: data.name || id,
          description: data.description || '',
          tools: data.tools || [],
          model: data.model || 'sonnet'
        };
        var content = buildFrontmatter(meta, data.body || '');
        var filepath = safePath(AGENTS_DIR, id + '.md');
        if (!filepath) { res.writeHead(400); res.end(JSON.stringify({error: 'invalid id'})); return; }
        fs.writeFileSync(filepath, content, 'utf8');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // API: 에이전트 생성 (POST /api/agents)
  if (url === '/api/agents' && req.method === 'POST') {
    var bodyChunks = [];
    req.on('data', function(c) { bodyChunks.push(c); });
    req.on('end', function() {
      try {
        var data = JSON.parse(Buffer.concat(bodyChunks).toString());
        var id = data.id || data.name || 'new-agent';
        id = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        var meta = {
          name: data.name || id,
          description: data.description || '',
          tools: data.tools || ['Read', 'Glob', 'Grep'],
          model: data.model || 'sonnet'
        };
        var content = buildFrontmatter(meta, data.body || '');
        fs.writeFileSync(path.join(AGENTS_DIR, id + '.md'), content, 'utf8');
        res.writeHead(201, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true, id: id}));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // API: 에이전트 삭제 (DELETE /api/agents/:id)
  if (url.startsWith('/api/agents/') && req.method === 'DELETE') {
    var id = url.split('/api/agents/')[1];
    var filepath = safePath(AGENTS_DIR, id + '.md');
    if (!filepath) { res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: 'invalid id'})); return; }
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true}));
    } else {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'not found'}));
    }
    return;
  }

  // API: 프로젝트별 에이전트 설정 (GET /api/project-agents?cwd=...)
  if (url.startsWith('/api/project-agents') && req.method === 'GET') {
    var qs = req.url.split('?')[1] || '';
    var params = {};
    qs.split('&').forEach(function(p) { var kv = p.split('='); if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    var cwd = params.cwd || '';
    var enabled = []; // 빈 배열 = 제한 없음 (전부 사용)
    var hasRestriction = false;
    if (cwd) {
      var claudeMd = path.join(cwd, 'CLAUDE.md');
      if (fs.existsSync(claudeMd)) {
        var content = fs.readFileSync(claudeMd, 'utf8');
        var match = content.match(/<!-- agent-viz:agents (.*?) -->/);
        if (match) {
          hasRestriction = true;
          if (match[1].trim() !== 'none') {
            enabled = match[1].split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          }
        }
      }
    }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ enabled: enabled, hasRestriction: hasRestriction }));
    return;
  }

  // API: 프로젝트별 에이전트 설정 저장 (PUT /api/project-agents)
  if (url === '/api/project-agents' && req.method === 'PUT') {
    var bodyChunks = [];
    req.on('data', function(c) { bodyChunks.push(c); });
    req.on('end', function() {
      try {
        var data = JSON.parse(Buffer.concat(bodyChunks).toString());
        var cwd = data.cwd || '';
        var enabled = data.enabled || [];
        var hasRestriction = data.hasRestriction !== undefined ? data.hasRestriction : enabled.length > 0;
        if (!cwd) { res.writeHead(400); res.end(JSON.stringify({error: 'cwd required'})); return; }

        var claudeMd = path.join(cwd, 'CLAUDE.md');
        var content = '';
        if (fs.existsSync(claudeMd)) {
          content = fs.readFileSync(claudeMd, 'utf8');
        }

        // 기존 마커 제거
        content = content.replace(/\s*<!-- agent-viz:agents .*? -->\s*<!-- 이 프로젝트에서는 .*? -->\s*/g, '');

        // 제한이 있으면 마커 추가
        if (hasRestriction) {
          var agentList = enabled.length > 0 ? enabled.join(', ') : 'none';
          var comment = enabled.length > 0 ? '이 프로젝트에서는 위 에이전트만 사용한다' : '이 프로젝트에서는 에이전트를 사용하지 않는다';
          var marker = '\n<!-- agent-viz:agents ' + agentList + ' -->\n<!-- ' + comment + ' -->\n';
          content = content.trimEnd() + '\n' + marker;
        }

        fs.writeFileSync(claudeMd, content, 'utf8');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // API: MCP 서버 목록
  if (url === '/api/mcp' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(readMcpServers()));
    return;
  }

  // API: Hooks 현황
  if (url === '/api/hooks' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(readHooks()));
    return;
  }

  // API: 통계 전체 초기화 (POST /api/stats/reset)
  // today + history + total 모두 비우고 since를 오늘로 재설정
  if (url === '/api/stats/reset' && req.method === 'POST') {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }
    // body 미사용 — 클라이언트가 보낸 데이터가 있어도 흘려서 socket 즉시 해제
    req.resume();
    var today = todayKey();
    statsData = {
      today: { date: today, prompts: 0, agents: {}, tools: {} },
      history: [],
      total: { since: today, prompts: 0, agents: {}, tools: {}, days: 0 },
    };
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify(statsData), 'utf8');
      console.log('  [STATS] reset (since=' + today + ')');
    } catch(e) {
      console.log('  [STATS] reset write error:', e.message);
    }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ ok: true, since: today }));
    return;
  }

  // API: 통계
  if (url === '/api/stats' && req.method === 'GET') {
    ensureToday();
    var d = statsData.today;
    var totalAgents = 0;
    Object.keys(d.agents || {}).forEach(function(k) { totalAgents += d.agents[k]; });
    var totalTools = 0;
    Object.keys(d.tools || {}).forEach(function(k) { totalTools += d.tools[k]; });

    // 주간 합산 (최근 7일)
    var weekly = { prompts: d.prompts || 0, agents: {}, tools: {} };
    var weekDays = statsData.history.filter(function(h) {
      var diff = (new Date(todayKey()) - new Date(h.date)) / 86400000;
      return diff < 7;
    });
    weekDays.forEach(function(h) {
      weekly.prompts += (h.prompts || 0);
      Object.keys(h.agents || {}).forEach(function(k) { weekly.agents[k] = (weekly.agents[k] || 0) + h.agents[k]; });
      Object.keys(h.tools || {}).forEach(function(k) { weekly.tools[k] = (weekly.tools[k] || 0) + h.tools[k]; });
    });
    // 오늘 에이전트/도구도 주간에 합산
    Object.keys(d.agents || {}).forEach(function(k) { weekly.agents[k] = (weekly.agents[k] || 0) + d.agents[k]; });
    Object.keys(d.tools || {}).forEach(function(k) { weekly.tools[k] = (weekly.tools[k] || 0) + d.tools[k]; });

    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({
      date: d.date,
      prompts: d.prompts || 0,
      totalAgents: totalAgents,
      totalTools: totalTools,
      agents: d.agents || {},
      tools: d.tools || {},
      weekly: weekly,
      total: statsData.total || {},
    }));
    return;
  }

  // API: 세션 히스토리 목록 (?q=검색어&agent=에이전트&days=N)
  if (url === '/api/history' && req.method === 'GET') {
    var parsedUrl = new URL(req.url, 'http://localhost');
    var q = (parsedUrl.searchParams.get('q') || '').toLowerCase().trim();
    var agentFilter = parsedUrl.searchParams.get('agent') || '';
    var daysParam = Math.max(0, parseInt(parsedUrl.searchParams.get('days') || '0', 10) || 0);
    var cutoff = daysParam > 0 ? Date.now() - daysParam * 24 * 60 * 60 * 1000 : 0;

    fs.readdir(HISTORY_DIR, function(err, allFiles) {
      if (err) {
        console.log('  [HISTORY] read error:', err.message);
        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({ items: [], partial: false, totalCount: 0, filteredCount: 0, hasFilter: false }));
        return;
      }
      var files = allFiles.filter(function(f) { return f.endsWith('.json'); });
      var totalCount = files.length; // 보관 중인 전체 파일 개수 (필터 무관)
      files.sort().reverse();
      // 파일명 prefilter: YYYY-MM-DD_HHmmss_name.json (로컬 타임존, saveSessionHistory의 종료 시각)
      // 본 필터(rec.endTime)와 동일 기준으로 비교 — 일관성 유지
      if (cutoff > 0) {
        files = files.filter(function(f) {
          var m = f.match(/^(\d{4}-\d{2}-\d{2})_/);
          if (!m) return true;
          var fileDay = new Date(m[1] + 'T23:59:59').getTime();
          return fileDay >= cutoff;
        });
      }
      // 검색/필터 없으면 50개만, 있으면 더 넓게 스캔 (200개 cap)
      var hasFilter = !!(q || agentFilter || daysParam > 0);
      var targets = files.slice(0, hasFilter ? 200 : 50);
      var list = [];
      var done = 0;
      if (targets.length === 0) {
        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({ items: [], partial: false, totalCount: totalCount, filteredCount: 0, hasFilter: hasFilter }));
        return;
      }
      var responded = false;
      var partial = false;
      function respond() {
        if (responded) return;
        responded = true;
        var matched = list.filter(Boolean);
        var result = matched.slice(0, 50);
        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({
          items: result,
          partial: partial,
          totalCount: totalCount,        // 필터 무관 전체 보관 개수
          filteredCount: matched.length, // 현재 필터/검색 적용 후 매칭 개수 (cap 200 안에서)
          hasFilter: hasFilter,
        }));
      }
      // 안전망: 5초 내 모든 read 미완료 시 부분 결과 반환
      var safetyTimer = setTimeout(function() { partial = true; respond(); }, 5000);
      targets.forEach(function(f, idx) {
        fs.readFile(path.join(HISTORY_DIR, f), 'utf8', function(e, content) {
          // 이미 응답한 후라면 (timeout 발동 등) early return — CPU/메모리 낭비 방지
          if (responded) return;
          if (!e) {
            try {
              var rec = JSON.parse(content);
              var matched = true;
              // endTime 기준 (prefilter와 동일 기준 — 세션이 끝난 시점)
              var recTime = rec.endTime ? new Date(rec.endTime).getTime() : (rec.startTime ? new Date(rec.startTime).getTime() : 0);
              if (cutoff && recTime && recTime < cutoff) matched = false;
              if (matched && agentFilter && !(rec.agents && rec.agents[agentFilter])) matched = false;
              if (matched && q) {
                var hay = (rec.name || '') + ' ' + (rec.cwd || '');
                if (rec.turns) rec.turns.forEach(function(tn) { hay += ' ' + (tn.prompt || '') + ' ' + (tn.summary || ''); });
                if (rec.files) hay += ' ' + Object.keys(rec.files).join(' ');
                if (hay.toLowerCase().indexOf(q) === -1) matched = false;
              }
              if (matched) {
                rec.filename = f; // 클라이언트 개별 삭제용
                list[idx] = rec;
              }
            } catch(pe) {
              console.log('  [HISTORY] parse error:', f, pe.message);
              // 손상된 JSON은 .corrupt 확장자로 격리 (목록에서 제외 + 수동 확인 가능)
              try {
                var src = path.join(HISTORY_DIR, f);
                var dst = src + '.corrupt';
                fs.rename(src, dst, function(re) {
                  if (!re) console.log('  [HISTORY] quarantined:', f, '→ .corrupt');
                });
              } catch(qe) { /* 실패해도 무해 */ }
            }
          }
          done++;
          if (done === targets.length) {
            clearTimeout(safetyTimer);
            respond();
          }
        });
      });
    });
    return;
  }

  // API: 히스토리 전체 삭제 (DELETE /api/history)
  // 비동기 I/O — 100+ 파일 삭제 시에도 이벤트 루프 블로킹 없음
  if (url === '/api/history' && req.method === 'DELETE') {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }
    req.resume(); // body 미사용 — socket drain
    fs.readdir(HISTORY_DIR, function(err, files) {
      if (err) {
        console.log('  [HISTORY] clear-all readdir error:', err.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'readdir failed' }));
        return;
      }
      var jsonFiles = files.filter(function(f) { return f.endsWith('.json'); });
      if (jsonFiles.length === 0) {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true, deleted: 0 }));
        return;
      }
      var deletedAll = 0;
      var pending = jsonFiles.length;
      function done() {
        pending--;
        if (pending === 0) {
          console.log('  [HISTORY] cleared all:', deletedAll, 'file(s)');
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ ok: true, deleted: deletedAll }));
        }
      }
      jsonFiles.forEach(function(f) {
        var fp = safePath(HISTORY_DIR, f);
        if (!fp) { done(); return; }
        fs.unlink(fp, function(e) {
          if (!e) deletedAll++;
          done();
        });
      });
    });
    return;
  }

  // API: 히스토리 개별 삭제 (DELETE /api/history/:filename)
  if (url.startsWith('/api/history/') && req.method === 'DELETE') {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }
    req.resume(); // body 미사용 — socket drain
    var rawName;
    try {
      rawName = decodeURIComponent(url.split('/api/history/')[1] || '');
    } catch (e) {
      // 잘못된 URI 인코딩(URIError) 방어 — uncaught throw 방지
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'invalid encoding' }));
      return;
    }
    // 화이트리스트: 저장 규칙(`[^a-zA-Z0-9가-힣_-]` → `_`)과 일치 + .json 확장자 필수
    // path traversal/제어문자 방어 + 저장 포맷과 entropy 통일
    if (!/^[a-zA-Z0-9_\-가-힣]+\.json$/.test(rawName)) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'invalid filename' }));
      return;
    }
    var fpath = safePath(HISTORY_DIR, rawName);
    if (!fpath) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'invalid path' }));
      return;
    }
    // async 통일 (bulk DELETE와 동일 패턴). existsSync 제거 — ENOENT → 404로 매핑
    fs.unlink(fpath, function(e) {
      if (e) {
        if (e.code === 'ENOENT') {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'not found' }));
        } else {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }
      console.log('  [HISTORY] deleted:', rawName);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // API: Privacy 토글 (프롬프트 기록 여부)
  if (url === '/api/privacy' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ enabled: isPrivacyOn() }));
    return;
  }
  if (url === '/api/privacy' && req.method === 'POST') {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }
    // 멀티바이트 chunk 경계 깨짐 방지 — setEncoding 전에 chunk는 Buffer, 이후부터 string으로 decode됨
    req.setEncoding('utf8');
    var body = '';
    var aborted = false;
    req.on('data', function(chunk) {
      if (aborted) return;
      body += chunk;
      if (body.length > 1024) { // 1KB DoS 방어
        aborted = true;
        res.writeHead(413, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'payload too large' }));
        req.destroy();
      }
    });
    req.on('end', function() {
      if (aborted) return;
      try {
        var data = JSON.parse(body || '{}');
        if (data.enabled) {
          fs.writeFileSync(PRIVACY_FILE, '1', 'utf8');
          // 활성 트래커들의 메모리에 쌓인 프롬프트 즉시 비움 (다음 history save부터는 빈 값으로 저장)
          // 디스크 정리는 하지 않음 — 사용자가 명시적으로 "삭제" 액션을 수행해야 함
          Object.values(sessionTrackers).forEach(function(t) {
            (t.turns || []).forEach(function(turn) { turn.prompt = ''; turn.summary = ''; });
          });
        } else {
          try {
            if (fs.existsSync(PRIVACY_FILE)) fs.unlinkSync(PRIVACY_FILE);
          } catch(e2) { /* race: 이미 삭제됨 */ }
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true, enabled: isPrivacyOn() }));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 서버 재시작
  if (url === '/api/restart' && req.method === 'POST') {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }
    req.resume(); // body 미사용 — socket drain
    console.log('\n  \x1b[33mUI에서 재시작 요청\x1b[0m\n');
    broadcastEvent({ event: 'server_restart', reason: 'user requested' });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    // 순서: 500ms 대기(응답 전송 완료) → 타이머/SSE/트래커 정리 → server.close() → 포트 해제 확인 후 자식 spawn → 부모 exit
    // (이전: spawn 후 즉시 process.exit → 포트 race로 자식이 EADDRINUSE로 조용히 죽는 버그)
    setTimeout(function() {
      if (_ssePingInterval) { clearInterval(_ssePingInterval); _ssePingInterval = null; }
      if (_cleanHistoryInterval) { clearInterval(_cleanHistoryInterval); _cleanHistoryInterval = null; }
      if (_checkSessionsInterval) { clearInterval(_checkSessionsInterval); _checkSessionsInterval = null; }
      sseClients.forEach(function(c) { try { c.end(); } catch(e) {} });
      saveAllTrackers();
      var _spawned = false;
      function spawnChild() {
        if (_spawned) return;
        _spawned = true;
        var spawn = require('child_process').spawn;
        var child = spawn(process.execPath, [__filename], { detached: true, stdio: 'ignore', cwd: __dirname });
        child.unref();
        process.exit(0);
      }
      server.close(spawnChild);
      // server.close()가 기존 keep-alive connection 때문에 지연될 수 있음 → 2초 안전망
      setTimeout(spawnChild, 2000).unref();
    }, 500);
    return;
  }

  // API: 서버 종료
  if (url === '/api/shutdown' && req.method === 'POST') {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'forbidden origin' }));
      return;
    }
    req.resume(); // body 미사용 — socket drain
    console.log('\n  \x1b[33mUI에서 종료 요청 → 서버 종료\x1b[0m\n');
    broadcastEvent({ event: 'server_shutdown', reason: 'user requested' });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    // gracefulShutdown 내부에서 saveAllTrackers + 정리 일원화
    setTimeout(gracefulShutdown, 500);
    return;
  }

  // HTML 페이지
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(fs.readFileSync(HTML_PATH, 'utf8'));
    return;
  }

  // 정적 파일 서빙 (public/css/, public/js/) — Path Traversal 방어
  var staticMatch = url.match(/^\/(css|js)\/([a-zA-Z0-9_\-.]+)$/);
  if (staticMatch && req.method === 'GET') {
    var subdir = staticMatch[1];
    var filename = staticMatch[2];
    var filePath = path.join(PUBLIC_DIR, subdir, filename);
    // path.resolve로 실제 경로 검증 (../ 등 방어)
    var resolvedPath = path.resolve(filePath);
    var allowedBase = path.resolve(PUBLIC_DIR, subdir);
    if (!resolvedPath.startsWith(allowedBase + path.sep) || !fs.existsSync(resolvedPath)) {
      res.writeHead(404); res.end('Not Found');
      return;
    }
    var contentType = subdir === 'css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
    res.writeHead(200, {'Content-Type': contentType, 'Cache-Control': 'no-cache'});
    res.end(fs.readFileSync(resolvedPath, 'utf8'));
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

// --- Session Health Check: 30초마다 살아있는 세션 확인, 0개면 자동 종료 ---
const SESSIONS_DIR = path.join(__dirname, 'sessions');

function checkSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;

  var files = fs.readdirSync(SESSIONS_DIR);
  if (files.length === 0) return; // 세션 파일이 없으면 수동 실행이므로 유지

  var alive = 0;
  files.forEach(function(file) {
    var pid = parseInt(file);
    if (isNaN(pid)) return;
    try {
      process.kill(pid, 0); // 프로세스 존재 확인 (신호 안 보냄)
      alive++;
    } catch(e) {
      // 프로세스 없음 → 세션 파일 삭제
      try { fs.unlinkSync(path.join(SESSIONS_DIR, file)); } catch(e2) {}
    }
  });

  // 메모리 세션 정리
  // - alive: false → 1분 후 제거 (종료된 세션)
  // - alive: true → 2시간 무활동 시 제거 (hook의 $PPID는 임시 프로세스라 PID 체크 불가)
  var DEAD_TIMEOUT = 60 * 1000; // 1분
  var SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2시간
  Object.keys(sessions).forEach(function(pid) {
    var s = sessions[pid];
    var lastActivity = new Date(s.lastActivity).getTime();
    var inactiveMs = Date.now() - lastActivity;
    var shouldRemove = (s.alive === false && inactiveMs > DEAD_TIMEOUT) || (inactiveMs > SESSION_TIMEOUT);
    if (shouldRemove) {
      console.log('  [SESSION-]', s.name || pid, s.alive === false ? '(dead)' : '(timeout)');
      saveSessionHistory(pid);
      var removedSession = sessions[pid];
      delete sessions[pid];
      broadcastEvent({ event: 'session_removed', session_pid: pid, session_name: removedSession.name });
    }
  });

  // 서버 자동 종료 비활성화 — UI 종료 버튼(■)으로만 종료
  // 세션이 없어도 서버는 유지 (새 세션 대기)
}

// 서버 시작 시 로그 파일 정리 (100KB 초과 시 truncate)
['/tmp/agent-viz-server.log', '/tmp/agent-viz-debug.log'].forEach(function(logPath) {
  try {
    var stat = fs.statSync(logPath);
    if (stat.size > 100 * 1024) { fs.writeFileSync(logPath, ''); console.log('  [LOG] truncated:', logPath); }
  } catch(e) {}
});

// 서버 종료 시 모든 활성 세션 히스토리 저장
function saveAllTrackers() {
  var pids = Object.keys(sessionTrackers);
  if (pids.length === 0) return;
  console.log('  [HISTORY] saving ' + pids.length + ' tracker(s) before exit...');
  pids.forEach(function(pid) { saveSessionHistory(pid); });
  // saveSessionHistory 내부에서 delete sessionTrackers[pid]가 호출되지만,
  // 실패 경로가 늘어날 경우에도 안전하도록 명시적으로 clear
  sessionTrackers = {};
}

function gracefulShutdown() {
  // 모든 module-level 타이머를 일괄 정리 (24h 백그라운드 운영 시 일관성)
  if (_ssePingInterval) { clearInterval(_ssePingInterval); _ssePingInterval = null; }
  if (_cleanHistoryInterval) { clearInterval(_cleanHistoryInterval); _cleanHistoryInterval = null; }
  if (_checkSessionsInterval) { clearInterval(_checkSessionsInterval); _checkSessionsInterval = null; }
  sseClients.forEach(function(c) { try { c.end(); } catch(e) {} });
  saveAllTrackers();
  process.exit(0);
}
// 직접 실행(`node server.js`) 시에만 listen + 모든 interval 시작 + SIGTERM/SIGINT 바인딩.
// 테스트에서 require('./server') 할 때는 순수 함수 exports만 노출 (listen/interval X).
if (require.main === module) {
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // 시작 시 cleanHistory 1회 + 1시간 주기 정리
  cleanHistory();
  _cleanHistoryInterval = setInterval(cleanHistory, 60 * 60 * 1000);

  // SSE keep-alive ping — 30초마다 모든 클라이언트에 주석 라인 전송
  _ssePingInterval = setInterval(function() {
    sseClients = sseClients.filter(function(client) {
      if (client.destroyed || client.writableEnded) return false;
      try { client.write(': ping\n\n'); return true; }
      catch(e) { return false; }
    });
  }, 30000);

  server.listen(PORT, function() {
    console.log('\n  \x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m  \x1b[1m\x1b[32mClaude Agent Orchestrator\x1b[0m              \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m  \x1b[90mhttp://localhost:' + PORT + '\x1b[0m                  \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m  \x1b[90mAgents: ' + AGENTS_DIR + '\x1b[0m  \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m╚══════════════════════════════════════════╝\x1b[0m\n');
    console.log('  \x1b[90m세션 헬스체크: 30초 간격\x1b[0m');
    console.log('  \x1b[33mCtrl+C\x1b[0m 로 수동 종료\n');

    // 30초마다 세션 체크 — gracefulShutdown에서 clear
    _checkSessionsInterval = setInterval(checkSessions, 30000);
  });
} else {
  // 순수 함수만 노출 (side-effect 없는 검증 대상)
  module.exports = {
    maskSecrets: maskSecrets,
    isNoiseUserText: isNoiseUserText,
    isValidTranscriptPath: isValidTranscriptPath,
    todayKey: todayKey,
    safePath: safePath,
    truncate: truncate,
    parseFrontmatter: parseFrontmatter,
    buildFrontmatter: buildFrontmatter,
  };
}
