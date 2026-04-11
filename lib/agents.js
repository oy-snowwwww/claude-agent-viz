// 에이전트/MCP/Hooks CRUD -- ~/.claude/ 설정 파일 읽기

var fs = require('fs');
var path = require('path');
var frontmatter = require('./frontmatter');

var AGENTS_DIR = path.join(process.env.HOME, '.claude', 'agents');
var MCP_JSON = path.join(process.env.HOME, '.mcp.json');
var SETTINGS_JSON = path.join(process.env.HOME, '.claude', 'settings.json');

// --- Read all agents ---
function readAgents() {
  var agents = [];
  if (!fs.existsSync(AGENTS_DIR)) return agents;

  fs.readdirSync(AGENTS_DIR).forEach(function(file) {
    if (!file.endsWith('.md')) return;
    var content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    var parsed = frontmatter.parseFrontmatter(content);
    agents.push({
      filename: file,
      id: file.replace('.md', ''),
      name: parsed.meta.name || file.replace('.md', ''),
      description: parsed.meta.description || '',
      tools: parsed.meta.tools || [],
      model: parsed.meta.model || 'sonnet',
      order: parsed.meta.order != null ? Number(parsed.meta.order) : 999,
      body: parsed.body,
      raw: content
    });
  });
  agents.sort(function(a, b) { return a.order - b.order; });
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

module.exports = {
  readAgents: readAgents,
  readMcpServers: readMcpServers,
  readHooks: readHooks,
  AGENTS_DIR: AGENTS_DIR,
};
