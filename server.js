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
const HTML_PATH = path.join(__dirname, 'index.html');
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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
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
          session_tty: session.tty || ''
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
            if (session.name && session.name !== 'unknown') {
              var oldName = sessions[targetPid].name;
              sessions[targetPid].name = session.name;
              if (oldName !== session.name) {
                broadcastEvent({ event: 'session_renamed', session_pid: targetPid, session_name: session.name });
              }
            }
          }
        }

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

  // API: 서버 재시작
  if (url === '/api/restart' && req.method === 'POST') {
    console.log('\n  \x1b[33mUI에서 재시작 요청\x1b[0m\n');
    broadcastEvent({ event: 'server_restart', reason: 'user requested' });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    setTimeout(function() {
      var spawn = require('child_process').spawn;
      var child = spawn('nohup', ['node', __filename], { detached: true, stdio: 'ignore' });
      child.unref();
      process.exit(0);
    }, 500);
    return;
  }

  // API: 서버 종료
  if (url === '/api/shutdown' && req.method === 'POST') {
    console.log('\n  \x1b[33mUI에서 종료 요청 → 서버 종료\x1b[0m\n');
    broadcastEvent({ event: 'server_shutdown', reason: 'user requested' });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    setTimeout(function() { process.exit(0); }, 500);
    return;
  }

  // HTML 페이지
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(fs.readFileSync(HTML_PATH, 'utf8'));
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

  // 메모리 세션: PID가 아닌 활동 기반으로 정리
  // (hook의 $PPID는 임시 프로세스라 바로 죽으므로 PID 체크 불가)
  // 2시간 이상 무활동 세션만 제거
  var SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2시간
  Object.keys(sessions).forEach(function(pid) {
    var lastActivity = new Date(sessions[pid].lastActivity).getTime();
    var inactiveMs = Date.now() - lastActivity;
    if (inactiveMs > SESSION_TIMEOUT) {
      console.log('  [SESSION-]', sessions[pid].name || pid, '(timeout)');
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

server.listen(PORT, function() {
  console.log('\n  \x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('  \x1b[36m║\x1b[0m  \x1b[1m\x1b[32mClaude Agent Orchestrator\x1b[0m              \x1b[36m║\x1b[0m');
  console.log('  \x1b[36m║\x1b[0m  \x1b[90mhttp://localhost:' + PORT + '\x1b[0m                  \x1b[36m║\x1b[0m');
  console.log('  \x1b[36m║\x1b[0m  \x1b[90mAgents: ' + AGENTS_DIR + '\x1b[0m  \x1b[36m║\x1b[0m');
  console.log('  \x1b[36m╚══════════════════════════════════════════╝\x1b[0m\n');
  console.log('  \x1b[90m세션 헬스체크: 30초 간격\x1b[0m');
  console.log('  \x1b[33mCtrl+C\x1b[0m 로 수동 종료\n');

  // 30초마다 세션 체크
  setInterval(checkSessions, 30000);
});
