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

// --- lib 모듈 ---
var state = require('./lib/state');
var utils = require('./lib/utils');
var security = require('./lib/security');
var frontmatter = require('./lib/frontmatter');
var sse = require('./lib/sse');
var agents = require('./lib/agents');
var stats = require('./lib/stats');
var gamification = require('./lib/gamification');
var sessionTracker = require('./lib/session-tracker');
var history = require('./lib/history');

// --- 상수 ---
const PORT = parseInt(process.env.AGENT_VIZ_PORT || '54321', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const HTML_PATH = path.join(PUBLIC_DIR, 'index.html');
const GLOBAL_CLAUDE_MD = path.join(process.env.HOME, 'CLAUDE.md');

// cleanHistory + interval 은 server.listen 블록 안에서 초기화 (require() 테스트 시 side-effect 방지)
var _cleanHistoryInterval = null;
var _checkSessionsInterval = null;

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
    state.sseClients.push(res);
    req.on('close', function() {
      state.sseClients = state.sseClients.filter(function(c) { return c !== res; });
    });
    return;
  }

  // Hook Events: Claude Code Hook에서 POST로 전달
  if (url === '/api/events' && req.method === 'POST') {
    security.readBodySafe(req, 256 * 1024, function(err, rawBody) {
      if (err) { res.writeHead(400); res.end('read error'); return; }
      try {
        var data = JSON.parse(rawBody);

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
          var endTarget = state.sessions[endPid] ? endPid : null;
          if (!endTarget && session.sid) {
            endTarget = Object.keys(state.sessions).find(function(pid) {
              return state.sessions[pid].sid === session.sid && state.sessions[pid].alive !== false;
            }) || null;
          }
          if (endTarget && state.sessions[endTarget]) {
            // 이전 대기 중인 타이머 취소 후 재설정
            if (state.pendingEnds[endTarget]) clearTimeout(state.pendingEnds[endTarget]);
            var endName = state.sessions[endTarget].name || endTarget;
            console.log('  [SESSION-] pending session_end (3s):', endTarget, endName);
            state.pendingEnds[endTarget] = setTimeout(function() {
              delete state.pendingEnds[endTarget];
              if (state.sessions[endTarget]) {
                state.sessions[endTarget].alive = false;
                history.saveSessionHistory(endTarget);
                sse.broadcastEvent({
                  event: 'session_stopped',
                  session_pid: endTarget,
                  session_name: state.sessions[endTarget].name || endTarget,
                });
                console.log('  [SESSION-] stopped:', endTarget, state.sessions[endTarget].name || '');
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
          var isNew = !state.sessions[targetPid];

          if (!isNew && event === 'session_start') {
            // 같은 TTY에서 새 세션 시작 → 기존 세션 재활성화
            if (state.sessions[targetPid].alive === false) {
              state.sessions[targetPid].alive = true;
              state.sessions[targetPid].startTime = new Date().toISOString();
              if (session.sid) state.sessions[targetPid].sid = session.sid;
              sse.broadcastEvent({ event: 'session_registered', session: state.sessions[targetPid] });
              console.log('  [SESSION+] revived:', state.sessions[targetPid].name);
            }
          }

          if (isNew && event === 'session_start') {
            // 에이전트 세션 감지: 기존 활성 세션으로 라우팅 (별도 탭 안 만듦)
            var existingSession = null;
            var incomingSid = session.sid || '';
            var incomingCwd = session.cwd || '';

            // 같은 sid의 활성 세션이 있으면 에이전트 세션 → 기존 세션으로 라우팅
            if (incomingSid) {
              existingSession = Object.keys(state.sessions).find(function(pid) {
                return state.sessions[pid].sid === incomingSid && state.sessions[pid].alive !== false;
              });
            }
            if (existingSession) {
              console.log('  [SESSION+] agent → existing:', state.sessions[existingSession].name);
              targetPid = existingSession;
              parsed.session_pid = existingSession;
              parsed.session_name = state.sessions[existingSession].name;
            }
            if (!state.sessions[targetPid]) {
              // 세션 상한 (50개) — 초과 시 가장 오래된 비활성 세션 제거
              var MAX_SESSIONS = 50;
              var sKeys = Object.keys(state.sessions);
              if (sKeys.length >= MAX_SESSIONS) {
                var oldest = sKeys.filter(function(k) { return !state.sessions[k].alive; }).sort(function(a, b) {
                  return (state.sessions[a].lastActivity || '').localeCompare(state.sessions[b].lastActivity || '');
                })[0];
                if (oldest) { delete state.sessions[oldest]; delete state.sessionTrackers[oldest]; }
              }
              state.sessions[targetPid] = {
                pid: targetPid,
                name: session.name || 'Session ' + targetPid,
                cwd: session.cwd || '',
                tty: session.pid || session.tty || '',
                sid: session.sid || '',
                startTime: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                eventCount: 0
              };
              sse.broadcastEvent({ event: 'session_registered', session: state.sessions[targetPid] });
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
              state.sessions[targetPid] = {
                pid: targetPid,
                name: session.name || 'Session ' + targetPid,
                cwd: session.cwd || '',
                tty: ttyId,
                sid: session.sid || '',
                startTime: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                eventCount: 0
              };
              sse.broadcastEvent({ event: 'session_registered', session: state.sessions[targetPid] });
              console.log('  [SESSION+] auto-recovered by TTY:', ttyId, state.sessions[targetPid].name);
            } else {
              // TTY 없음 → CWD 매칭 시도 (fallback)
              var candidates = [];
              if (session.cwd) {
                candidates = Object.keys(state.sessions).filter(function(pid) {
                  return state.sessions[pid].cwd === session.cwd;
                });
              }
              if (candidates.length > 0) {
                candidates.sort(function(a, b) {
                  return (state.sessions[b].lastActivity || '').localeCompare(state.sessions[a].lastActivity || '');
                });
                targetPid = candidates[0];
                parsed.session_pid = targetPid;
                parsed.session_name = state.sessions[targetPid].name;
              } else {
                // 매칭 실패 → 새 세션으로 자동 등록
                targetPid = session.pid;
                state.sessions[targetPid] = {
                  pid: targetPid,
                  name: session.name || 'Session ' + targetPid,
                  cwd: session.cwd || '',
                  tty: '',
                  sid: session.sid || '',
                  startTime: new Date().toISOString(),
                  lastActivity: new Date().toISOString(),
                  eventCount: 0
                };
                sse.broadcastEvent({ event: 'session_registered', session: state.sessions[targetPid] });
                console.log('  [SESSION+] auto-recovered (no TTY):', state.sessions[targetPid].name);
              }
            }
          }

          if (targetPid && state.sessions[targetPid]) {
            // 새 상호작용 이벤트만 종료 타이머 취소 (thinking_end 등 잔여 이벤트는 무시)
            if (state.pendingEnds[targetPid] && (event === 'session_start' || event === 'thinking_start')) {
              clearTimeout(state.pendingEnds[targetPid]);
              delete state.pendingEnds[targetPid];
              console.log('  [SESSION-] cancelled pending end:', targetPid, '(new event:', event, ')');
            }
            state.sessions[targetPid].lastActivity = new Date().toISOString();
            state.sessions[targetPid].eventCount = (state.sessions[targetPid].eventCount || 0) + 1;
            // 세션 이름은 첫 등록 시 또는 사용자가 수동으로 rename 안 한 경우에만 hook session.name으로 갱신
            // (recordSessionEvent에서 transcript의 /rename을 우선시하기 위함)
            if (session.name && session.name !== 'unknown' && !state.sessions[targetPid]._renamedFromTranscript) {
              var oldName = state.sessions[targetPid].name;
              state.sessions[targetPid].name = session.name;
              if (oldName !== session.name) {
                sse.broadcastEvent({ event: 'session_renamed', session_pid: targetPid, session_name: session.name });
              }
            }
          }
        }

        // 세션 이벤트 기록 (히스토리)
        var targetPidForLog = parsed.session_pid || session.pid || '';
        if (targetPidForLog) sessionTracker.recordSessionEvent(targetPidForLog, parsed);

        // 일일 통계 기록
        stats.recordStat(event, parsed.tool_name, parsed.agent_type);

        // 게임화 포인트 획득 (POINTS_RULES에 정의된 이벤트만)
        gamification.recordPoints(event);

        // 모든 SSE 클라이언트에 브로드캐스트
        sse.broadcastEvent(parsed);

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
    res.end(JSON.stringify(Object.values(state.sessions)));
    return;
  }

  // API: 세션 이름 변경
  if (url.startsWith('/api/sessions/') && req.method === 'PUT') {
    if (!security.guardMutate(req, res)) return;
    var pid = url.split('/api/sessions/')[1];
    security.readBodySafe(req, 1024, function(err, body) {
      if (err) { res.writeHead(400); res.end('{}'); return; }
      try {
        var data = JSON.parse(body);
        if (state.sessions[pid]) {
          state.sessions[pid].name = data.name || state.sessions[pid].name;
          sse.broadcastEvent({ event: 'session_renamed', session_pid: pid, session_name: state.sessions[pid].name });
          console.log('  [SESSION~]', pid, '->', state.sessions[pid].name);
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
    if (!security.isValidCwd(targetCwd)) { res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: 'invalid cwd'})); return; }
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
    if (!security.guardMutate(req, res)) return;
    var type = url.split('/api/master/')[1];
    security.readBodySafe(req, 100 * 1024, function(err, body) {
      if (err) { res.writeHead(400); res.end('{}'); return; }
      try {
        var data = JSON.parse(body);
        var filepath;
        if (type === 'global') {
          filepath = GLOBAL_CLAUDE_MD;
        } else {
          // cwd 기반 프로젝트 CLAUDE.md (Path Traversal 방어)
          var targetCwd = data.cwd || process.cwd();
          if (!security.isValidCwd(targetCwd)) { res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: 'invalid cwd'})); return; }
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
    res.end(JSON.stringify(agents.readAgents()));
    return;
  }

  // API: 에이전트 저장 (PUT /api/agents/:id)
  if (url.startsWith('/api/agents/') && req.method === 'PUT') {
    if (!security.guardMutate(req, res)) return;
    var id = decodeURIComponent(url.split('/api/agents/')[1]);
    security.readBodySafe(req, 50 * 1024, function(err, body) {
      if (err) { res.writeHead(400); res.end('{}'); return; }
      try {
        var data = JSON.parse(body);
        var meta = {
          name: data.name || id,
          description: data.description || '',
          tools: data.tools || [],
          model: data.model || 'sonnet',
          order: data.order != null ? data.order : undefined
        };
        var content = frontmatter.buildFrontmatter(meta, data.body || '');
        var filepath = security.safePath(agents.AGENTS_DIR, id + '.md');
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

  // API: 에이전트 순서 변경 (PUT /api/agents-order)
  if (url === '/api/agents-order' && req.method === 'PUT') {
    if (!security.guardMutate(req, res)) return;
    security.readBodySafe(req, 10 * 1024, function(err, body) {
      if (err) { res.writeHead(400); res.end('{}'); return; }
      try {
        var order = JSON.parse(body).order; // ["coder","reviewer","qa",...]
        if (!Array.isArray(order)) throw new Error('order must be array');
        order.forEach(function(id, i) {
          var filepath = security.safePath(agents.AGENTS_DIR, id + '.md');
          if (!filepath || !fs.existsSync(filepath)) return;
          var content = fs.readFileSync(filepath, 'utf8');
          var parsed = frontmatter.parseFrontmatter(content);
          parsed.meta.order = i + 1;
          fs.writeFileSync(filepath, frontmatter.buildFrontmatter(parsed.meta, parsed.body), 'utf8');
        });
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
    if (!security.guardMutate(req, res)) return;
    security.readBodySafe(req, 50 * 1024, function(err, body) {
      if (err) { res.writeHead(400); res.end('{}'); return; }
      try {
        var data = JSON.parse(body);
        var id = data.id || data.name || 'new-agent';
        id = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        var meta = {
          name: data.name || id,
          description: data.description || '',
          tools: data.tools || ['Read', 'Glob', 'Grep'],
          model: data.model || 'sonnet'
        };
        var content = frontmatter.buildFrontmatter(meta, data.body || '');
        var agentPath = security.safePath(agents.AGENTS_DIR, id + '.md');
        if (!agentPath) { res.writeHead(400); res.end(JSON.stringify({error: 'invalid id'})); return; }
        fs.writeFileSync(agentPath, content, 'utf8');
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
    if (!security.guardMutate(req, res)) return;
    req.resume();
    var id = decodeURIComponent(url.split('/api/agents/')[1]);
    var filepath = security.safePath(agents.AGENTS_DIR, id + '.md');
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
      if (!security.isValidCwd(cwd)) { res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: 'invalid cwd'})); return; }
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
    if (!security.guardMutate(req, res)) return;
    security.readBodySafe(req, 2048, function(err, body) {
      if (err) { res.writeHead(400); res.end('{}'); return; }
      try {
        var data = JSON.parse(body);
        var cwd = data.cwd || '';
        var enabled = data.enabled || [];
        var hasRestriction = data.hasRestriction !== undefined ? data.hasRestriction : enabled.length > 0;
        if (!cwd || !security.isValidCwd(cwd)) { res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: 'invalid cwd'})); return; }

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
    res.end(JSON.stringify(agents.readMcpServers()));
    return;
  }

  // API: Hooks 현황
  if (url === '/api/hooks' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(agents.readHooks()));
    return;
  }

  // API: 통계 전체 초기화 (POST /api/stats/reset)
  // today + history + total 모두 비우고 since를 오늘로 재설정
  if (url === '/api/stats/reset' && req.method === 'POST') {
    if (!security.guardMutate(req, res)) return;
    // body 미사용 — 클라이언트가 보낸 데이터가 있어도 흘려서 socket 즉시 해제
    req.resume();
    var today = utils.todayKey();
    state.statsData = {
      today: { date: today, prompts: 0, agents: {}, tools: {} },
      history: [],
      total: { since: today, prompts: 0, agents: {}, tools: {}, days: 0 },
    };
    try {
      fs.writeFileSync(stats.STATS_FILE, JSON.stringify(state.statsData), 'utf8');
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
    stats.ensureToday();
    var d = state.statsData.today;
    var totalAgents = 0;
    Object.keys(d.agents || {}).forEach(function(k) { totalAgents += d.agents[k]; });
    var totalTools = 0;
    Object.keys(d.tools || {}).forEach(function(k) { totalTools += d.tools[k]; });

    // 주간 합산 (최근 7일)
    var weekly = { prompts: d.prompts || 0, agents: {}, tools: {} };
    var weekDays = state.statsData.history.filter(function(h) {
      var diff = (new Date(utils.todayKey()) - new Date(h.date)) / 86400000;
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
      total: state.statsData.total || {},
    }));
    return;
  }



  // GET /api/stats/activity — 일별 활동량 (잔디 데이터, 전체 보관)
  if (url === '/api/stats/activity' && req.method === 'GET') {
    stats.ensureToday();
    var activityMap = {};
    // stats history에서 일별 prompts 집계
    (state.statsData.history || []).forEach(function(h) {
      if (h.date) activityMap[h.date] = (h.prompts || 0);
    });
    // 오늘 데이터 추가
    var tk = utils.todayKey();
    activityMap[tk] = (activityMap[tk] || 0) + (state.statsData.today.prompts || 0);
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({ activity: activityMap }));
    return;
  }

  // === 게임화: 포인트 API ===

  // GET /api/points — 현재 상태 조회 (?lang=en 지원)
  if (url === '/api/points' && req.method === 'GET') {
    var ptsLang = (req.url.split('lang=')[1] || 'ko').split('&')[0];
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({
      version: state.pointsData.version || 1,
      total: Math.floor(state.pointsData.total || 0),       // UI 표시용 정수
      totalRaw: state.pointsData.total || 0,                 // 소수점 포함 원본
      lifetime: Math.floor(state.pointsData.lifetime || 0),
      inventory: state.pointsData.inventory || {},
      buffs: gamification.computeBuffs(state.pointsData.inventory || {}),
      streak: state.pointsData.streak || 0,
      lastStreakDay: state.pointsData.lastStreakDay || null,
      achievements: state.pointsData.achievements || {},
      level: gamification.calcLevel(state.pointsData.lifetime || 0),
      levelTitle: gamification.levelTitleI18n(gamification.calcLevel(state.pointsData.lifetime || 0), ptsLang),
      levelXp: (function() { var lv = gamification.calcLevel(state.pointsData.lifetime || 0); var r = gamification.levelXpRange(lv); return { current: state.pointsData.lifetime || 0, min: r.current, max: r.next }; })(),
      createdAt: state.pointsData.createdAt || null,
      lastEarnedAt: state.pointsData.lastEarnedAt || null,
    }));
    return;
  }

  // GET /api/points/achievements — 성취 정의 + 달성 상태 + 카테고리 (?lang=en 지원)
  if (url === '/api/points/achievements' && req.method === 'GET') {
    var achLang = (req.url.split('lang=')[1] || 'ko').split('&')[0];
    var isEn = achLang === 'en';
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({
      categories: gamification.ACH_CATEGORIES[achLang] || gamification.ACH_CATEGORIES.ko,
      achievementDefs: Object.keys(gamification.ACHIEVEMENTS).map(function(id) {
        var a = gamification.ACHIEVEMENTS[id];
        return {
          id: id,
          cat: a.cat || 'master',
          name: isEn ? (a.name_en || a.name) : a.name,
          desc: isEn ? (a.desc_en || a.desc) : a.desc,
          reward: a.reward,
          unlocked: !!(state.pointsData.achievements || {})[id],
          unlockedAt: (state.pointsData.achievements || {})[id] || null,
          progress: typeof a.progress === 'function' ? a.progress() : null,
        };
      }),
    }));
    return;
  }

  // POST /api/points/purchase — 아이템 구매 {itemId: "..."}
  if (url === '/api/points/purchase' && req.method === 'POST') {
    if (!security.guardMutate(req, res)) return;
    security.readBodySafe(req, 1024, function(err, pBody) {
      if (err) { res.writeHead(413, {'Content-Type': 'application/json'}); res.end(JSON.stringify({ error: 'payload too large' })); return; }
      try {
        var data = JSON.parse(pBody || '{}');
        var itemId = (typeof data.itemId === 'string') ? data.itemId : '';
        // 화이트리스트: GAME_ITEMS에 정의된 ID만
        if (!itemId || !gamification.GAME_ITEMS[itemId]) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'invalid item' }));
          return;
        }
        var result = gamification.purchaseItem(itemId);
        if (!result.ok) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify(result));
          return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /api/points/reset — 초기화 {mode: "refund"|"full"}
  if (url === '/api/points/reset' && req.method === 'POST') {
    if (!security.guardMutate(req, res)) return;
    security.readBodySafe(req, 1024, function(err, rBody) {
      if (err) { res.writeHead(413, {'Content-Type': 'application/json'}); res.end(JSON.stringify({ error: 'payload too large' })); return; }
      try {
        var data = JSON.parse(rBody || '{}');
        var mode = data.mode;
        if (mode !== 'refund' && mode !== 'full') {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'invalid mode (refund|full)' }));
          return;
        }
        var result = gamification.resetPoints(mode);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 세션 히스토리 목록 (?q=검색어&agent=에이전트&days=N)
  if (url === '/api/history' && req.method === 'GET') {
    var parsedUrl = new URL(req.url, 'http://localhost');
    var q = (parsedUrl.searchParams.get('q') || '').toLowerCase().trim();
    var agentFilter = parsedUrl.searchParams.get('agent') || '';
    var daysParam = Math.max(0, parseInt(parsedUrl.searchParams.get('days') || '0', 10) || 0);
    var cutoff = daysParam > 0 ? Date.now() - daysParam * 24 * 60 * 60 * 1000 : 0;

    fs.readdir(history.HISTORY_DIR, function(err, allFiles) {
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
      // 검색/필터 없으면 50개만, 있으면 더 넓게 스캔 (1000개 cap)
      // 7일 + 10MB 자동 정리가 있어서 1000개 상한은 사실상 "최근 n주간 전체" 수준
      var hasFilter = !!(q || agentFilter || daysParam > 0);
      var targets = files.slice(0, hasFilter ? 1000 : 50);
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
        fs.readFile(path.join(history.HISTORY_DIR, f), 'utf8', function(e, content) {
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
                var src = path.join(history.HISTORY_DIR, f);
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
    if (!security.guardMutate(req, res)) return;
    req.resume(); // body 미사용 — socket drain
    fs.readdir(history.HISTORY_DIR, function(err, files) {
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
        var fp = security.safePath(history.HISTORY_DIR, f);
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
    if (!security.guardMutate(req, res)) return;
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
    var fpath = security.safePath(history.HISTORY_DIR, rawName);
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
    res.end(JSON.stringify({ enabled: utils.isPrivacyOn() }));
    return;
  }
  if (url === '/api/privacy' && req.method === 'POST') {
    if (!security.guardMutate(req, res)) return;
    security.readBodySafe(req, 1024, function(err, body) {
      if (err) { res.writeHead(413, {'Content-Type': 'application/json'}); res.end(JSON.stringify({ error: 'payload too large' })); return; }
      try {
        var data = JSON.parse(body || '{}');
        if (data.enabled) {
          fs.writeFileSync(path.join(__dirname, 'privacy'), '1', 'utf8');
          // 활성 트래커들의 메모리에 쌓인 프롬프트 즉시 비움 (다음 history save부터는 빈 값으로 저장)
          // 디스크 정리는 하지 않음 — 사용자가 명시적으로 "삭제" 액션을 수행해야 함
          Object.values(state.sessionTrackers).forEach(function(t) {
            (t.turns || []).forEach(function(turn) { turn.prompt = ''; turn.summary = ''; });
          });
        } else {
          try {
            var privacyFile = path.join(__dirname, 'privacy');
            if (fs.existsSync(privacyFile)) fs.unlinkSync(privacyFile);
          } catch(e2) { /* race: 이미 삭제됨 */ }
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true, enabled: utils.isPrivacyOn() }));
      } catch(e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 서버 재시작
  if (url === '/api/restart' && req.method === 'POST') {
    if (!security.guardMutate(req, res)) return;
    req.resume(); // body 미사용 — socket drain
    console.log('\n  \x1b[33mUI에서 재시작 요청\x1b[0m\n');
    sse.broadcastEvent({ event: 'server_restart', reason: 'user requested' });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    // 순서: 500ms 대기(응답 전송 완료) → 타이머/SSE/트래커 정리 → server.close() → 포트 해제 확인 후 자식 spawn → 부모 exit
    // (이전: spawn 후 즉시 process.exit → 포트 race로 자식이 EADDRINUSE로 조용히 죽는 버그)
    setTimeout(function() {
      if (_ssePingInterval) { clearInterval(_ssePingInterval); _ssePingInterval = null; }
      if (_cleanHistoryInterval) { clearInterval(_cleanHistoryInterval); _cleanHistoryInterval = null; }
      if (_checkSessionsInterval) { clearInterval(_checkSessionsInterval); _checkSessionsInterval = null; }
      state.sseClients.forEach(function(c) { try { c.end(); } catch(e) {} });
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
    if (!security.guardMutate(req, res)) return;
    req.resume(); // body 미사용 — socket drain
    console.log('\n  \x1b[33mUI에서 종료 요청 → 서버 종료\x1b[0m\n');
    sse.broadcastEvent({ event: 'server_shutdown', reason: 'user requested' });
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
  // 하위 디렉토리도 지원 (예: /js/games/snake.js)
  var staticMatch = url.match(/^\/(css|js)\/(.+)$/);
  if (staticMatch && req.method === 'GET') {
    var subdir = staticMatch[1];
    var relPath = staticMatch[2];
    // 파일명 화이트리스트: 영숫자, _, -, ., / 만 허용 (../ 등 차단)
    if (!/^[a-zA-Z0-9_\-./]+$/.test(relPath) || relPath.indexOf('..') !== -1) {
      res.writeHead(400); res.end('Bad Request');
      return;
    }
    var filePath = path.join(PUBLIC_DIR, subdir, relPath);
    // path.resolve로 실제 경로 검증
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

// --- Session Health Check: 30초마다 살아있는 세션 확인 ---
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
  Object.keys(state.sessions).forEach(function(pid) {
    var s = state.sessions[pid];
    var lastActivity = new Date(s.lastActivity).getTime();
    var inactiveMs = Date.now() - lastActivity;
    var shouldRemove = (s.alive === false && inactiveMs > DEAD_TIMEOUT) || (inactiveMs > SESSION_TIMEOUT);
    if (shouldRemove) {
      console.log('  [SESSION-]', s.name || pid, s.alive === false ? '(dead)' : '(timeout)');
      history.saveSessionHistory(pid);
      var removedSession = state.sessions[pid];
      delete state.sessions[pid];
      sse.broadcastEvent({ event: 'session_removed', session_pid: pid, session_name: removedSession.name });
    }
  });

  // 서버 자동 종료 비활성화 — UI 종료 버튼으로만 종료
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
  var pids = Object.keys(state.sessionTrackers);
  if (pids.length === 0) return;
  console.log('  [HISTORY] saving ' + pids.length + ' tracker(s) before exit...');
  pids.forEach(function(pid) { history.saveSessionHistory(pid); });
  // saveSessionHistory 내부에서 delete sessionTrackers[pid]가 호출되지만,
  // 실패 경로가 늘어날 경우에도 안전하도록 명시적으로 clear
  Object.keys(state.sessionTrackers).forEach(function(k) { delete state.sessionTrackers[k]; });
}

function gracefulShutdown() {
  // 디바운스된 저장 즉시 flush
  stats.flushStats();
  gamification.flushPoints();
  // 모든 module-level 타이머를 일괄 정리 (24h 백그라운드 운영 시 일관성)
  if (_ssePingInterval) { clearInterval(_ssePingInterval); _ssePingInterval = null; }
  if (_cleanHistoryInterval) { clearInterval(_cleanHistoryInterval); _cleanHistoryInterval = null; }
  if (_checkSessionsInterval) { clearInterval(_checkSessionsInterval); _checkSessionsInterval = null; }
  state.sseClients.forEach(function(c) { try { c.end(); } catch(e) {} });
  saveAllTrackers();
  process.exit(0);
}
// 직접 실행(`node server.js`) 시에만 listen + 모든 interval 시작 + SIGTERM/SIGINT 바인딩.
// 테스트에서 require('./server') 할 때는 순수 함수 exports만 노출 (listen/interval X).
if (require.main === module) {
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // 시작 시 cleanHistory 1회 + 1시간 주기 정리
  history.cleanHistory();
  _cleanHistoryInterval = setInterval(history.cleanHistory, 60 * 60 * 1000);

  // SSE keep-alive ping — 30초마다 모든 클라이언트에 주석 라인 전송
  _ssePingInterval = setInterval(function() {
    state.sseClients = state.sseClients.filter(function(client) {
      if (client.destroyed || client.writableEnded) return false;
      try { client.write(': ping\n\n'); return true; }
      catch(e) { return false; }
    });
  }, 30000);

  server.listen(PORT, function() {
    console.log('\n  \x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m  \x1b[1m\x1b[32mClaude Agent Orchestrator\x1b[0m              \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m  \x1b[90mhttp://localhost:' + PORT + '\x1b[0m                  \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m  \x1b[90mAgents: ' + agents.AGENTS_DIR + '\x1b[0m  \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m╚══════════════════════════════════════════╝\x1b[0m\n');
    console.log('  \x1b[90m세션 헬스체크: 30초 간격\x1b[0m');
    console.log('  \x1b[33mCtrl+C\x1b[0m 로 수동 종료\n');

    // 30초마다 세션 체크 — gracefulShutdown에서 clear
    _checkSessionsInterval = setInterval(checkSessions, 30000);
  });
} else {
  // 테스트 전용 상태 초기화 헬퍼 — sessionTrackers/sessions/statsData를 테스트 간 격리
  function _resetTestState() {
    Object.keys(state.sessionTrackers).forEach(function(k) { delete state.sessionTrackers[k]; });
    Object.keys(state.sessions).forEach(function(k) { delete state.sessions[k]; });
    state.statsData = {
      today: { date: utils.todayKey(), prompts: 0, agents: {}, tools: {} },
      history: [],
      total: { since: utils.todayKey(), prompts: 0, agents: {}, tools: {}, days: 0 },
    };
  }
  // 테스트 전용: sessionTrackers/sessions 직접 접근 (격리 검증용)
  function _getTestState() {
    return { sessionTrackers: state.sessionTrackers, sessions: state.sessions, statsData: state.statsData };
  }

  module.exports = {
    // 순수 함수 (side-effect 없음)
    maskSecrets: utils.maskSecrets,
    isNoiseUserText: utils.isNoiseUserText,
    isValidTranscriptPath: utils.isValidTranscriptPath,
    todayKey: utils.todayKey,
    safePath: security.safePath,
    truncate: utils.truncate,
    parseFrontmatter: frontmatter.parseFrontmatter,
    buildFrontmatter: frontmatter.buildFrontmatter,
    // 세션 추적 (sessionTrackers 전역 상태에 의존 — _resetTestState로 격리)
    getTracker: sessionTracker.getTracker,
    recordSessionEvent: sessionTracker.recordSessionEvent,
    ensureCurrentTurn: sessionTracker.ensureCurrentTurn,
    // transcript 파싱 (파일 시스템 read — 테스트에서 임시 파일 사용)
    parseTranscriptTurns: history.parseTranscriptTurns,
    extractLatestRenameFromTranscript: sessionTracker.extractLatestRenameFromTranscript,
    buildTurnSummaries: history.buildTurnSummaries,
    // 통계
    ensureToday: stats.ensureToday,
    // HTTP 헬퍼
    isAllowedOrigin: security.isAllowedOrigin,
    isPrivacyOn: utils.isPrivacyOn,
    // 테스트 유틸
    _resetTestState: _resetTestState,
    _getTestState: _getTestState,
  };
}
