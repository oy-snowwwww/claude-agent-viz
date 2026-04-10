// MCP 서버 + Hooks 사이드바 렌더
// 로드 순서: stats 이후, modal 이전
// 의존: utils.js(esc)

// === MCP ===
var mcpServers = [];

function renderMcpList() {
  var box = document.getElementById('mcpList'); box.innerHTML = '';
  if (mcpServers.length === 0) { box.innerHTML = '<div class="mcp-empty">' + (_lang === 'en' ? 'No MCP servers' : 'MCP 서버 없음') + '</div>'; return }
  // MCP 서버명에서 자동 색상 생성
  function mcpColor(name) { var h = 0; for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return 'hsl(' + (Math.abs(h) % 360) + ',60%,55%)' }
  mcpServers.forEach(function(mcp) {
    var el = document.createElement('div'); el.className = 'mcp-item';
    var color = mcpColor(mcp.id);
    el.innerHTML = '<span class="mcp-dot" style="background:' + esc(color) + ';box-shadow:0 0 4px ' + esc(color) + '"></span><div><div class="mcp-name">' + esc(mcp.name) + '</div><div class="mcp-type">' + esc(mcp.type) + '</div></div>';
    box.appendChild(el);
  });
}

// === Hooks ===
var hooksData = [];

function renderHooksList() {
  var box = document.getElementById('hooksList'); box.innerHTML = '';
  if (hooksData.length === 0) { box.innerHTML = '<div class="mcp-empty">' + (_lang === 'en' ? 'No hooks' : 'Hook 없음') + '</div>'; return }
  var EVENT_COLORS = { SessionStart: '#10b981', SessionEnd: '#f43f5e', UserPromptSubmit: '#fbbf24', Stop: '#fb923c', PreToolUse: '#00d4ff', PostToolUse: '#a78bfa' };
  // 이벤트별 그룹핑
  var groups = {};
  hooksData.forEach(function(h) {
    if (!groups[h.event]) groups[h.event] = [];
    groups[h.event].push(h);
  });
  Object.keys(groups).forEach(function(evt) {
    var g = document.createElement('div'); g.className = 'hook-group';
    var color = EVENT_COLORS[evt] || 'var(--accent)';
    var header = '<div class="hook-event"><span class="hook-event-dot" style="background:' + color + '"></span>' + esc(evt) + ' <span style="font-size:.4rem;color:var(--text-secondary);font-weight:400">(' + groups[evt].length + ')</span></div>';
    g.innerHTML = header;
    groups[evt].forEach(function(h) {
      var cmd = h.command || '';
      // 경로 축약
      var shortCmd = cmd.replace(/\/Users\/[^/]+/g, '~').replace(/\/\.claude\/agent-viz\//, '');
      var line = document.createElement('div'); line.className = 'hook-handler'; line.textContent = shortCmd; line.dataset.tip = cmd;
      g.appendChild(line);
      if (h.matcher) {
        var m = document.createElement('div'); m.className = 'hook-matcher'; m.textContent = 'matcher: ' + h.matcher;
        g.appendChild(m);
      }
    });
    box.appendChild(g);
  });
}
