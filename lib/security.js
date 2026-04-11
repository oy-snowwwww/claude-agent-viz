// 보안 가드 -- CSRF, body 크기 제한, 경로 검증

var fs = require('fs');
var path = require('path');

var MAX_BODY_DEFAULT = 50 * 1024; // 50KB

// CSRF 방어: Origin 헤더가 있으면 host와 일치해야 함
// (curl 등 server-to-server 요청은 Origin 없음 -> 허용)
function isAllowedOrigin(req) {
  var origin = req.headers.origin || '';
  var host = req.headers.host || '';
  if (!origin) return true;
  try {
    var u = new URL(origin);
    return u.host === host;
  } catch(e) { return false; }
}

// 공통 보안 가드: CSRF(Origin) + body 크기 제한
// skipOrigin: true면 Origin 체크 생략 (훅 엔드포인트용)
function guardMutate(req, res, opts) {
  opts = opts || {};
  if (!opts.skipOrigin && !isAllowedOrigin(req)) {
    res.writeHead(403, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ error: 'forbidden origin' }));
    return false;
  }
  return true;
}

function readBodySafe(req, maxBytes, cb) {
  var chunks = []; var len = 0; var aborted = false;
  maxBytes = maxBytes || MAX_BODY_DEFAULT;
  req.on('data', function(c) {
    if (aborted) return;
    len += c.length;
    if (len > maxBytes) { aborted = true; cb(new Error('payload too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', function() { if (!aborted) cb(null, Buffer.concat(chunks).toString()); });
  req.on('error', function() { if (!aborted) cb(new Error('read error')); });
}

// cwd 검증: 실존 디렉토리이고, 상위 탈출(../) 없는지 확인
function isValidCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') return false;
  var resolved = path.resolve(cwd);
  // .. 포함 여부 (path traversal 방지)
  if (resolved !== cwd && cwd.indexOf('..') !== -1) return false;
  // 홈 디렉토리 하위만 허용 (/etc, /usr 등 시스템 경로 차단)
  var home = process.env.HOME || '';
  if (!home || !resolved.startsWith(home + path.sep)) return false;
  // 실존 디렉토리인지 확인
  try { return fs.statSync(resolved).isDirectory(); } catch(e) { return false; }
}

// Path Traversal 방어: 대상 경로가 허용 디렉토리 하위인지 검증
function safePath(baseDir, userInput) {
  var resolved = path.resolve(baseDir, userInput);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) return null;
  return resolved;
}

module.exports = {
  guardMutate: guardMutate,
  readBodySafe: readBodySafe,
  isValidCwd: isValidCwd,
  safePath: safePath,
  isAllowedOrigin: isAllowedOrigin,
  MAX_BODY_DEFAULT: MAX_BODY_DEFAULT,
};
