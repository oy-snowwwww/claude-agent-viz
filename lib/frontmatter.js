// YAML Frontmatter 파서 -- 에이전트 .md 파일의 메타데이터 읽기/쓰기

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
  if (meta.order != null) lines.push('order: ' + meta.order);
  lines.push('---');
  lines.push('');
  lines.push(body);
  return lines.join('\n');
}

module.exports = {
  parseFrontmatter: parseFrontmatter,
  buildFrontmatter: buildFrontmatter,
};
