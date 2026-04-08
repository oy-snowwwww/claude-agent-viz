// HTTP 통합 테스트 헬퍼 — 테스트 포트에 child 서버 spawn + fetch 유틸
// 실제 서버(54321)와 격리된 포트(54399) 사용

const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const TEST_PORT = 54399;
const HOST = '127.0.0.1';

// 테스트용 child 서버 기동 + listen 대기 + 종료 함수 반환
function startTestServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', '..', 'server.js');
    const child = spawn(process.execPath, [serverPath], {
      env: Object.assign({}, process.env, {
        AGENT_VIZ_PORT: String(TEST_PORT),
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) { child.kill(); reject(new Error('server start timeout')); }
    }, 5000);

    child.stdout.on('data', (chunk) => {
      const out = chunk.toString();
      if (!ready && (out.includes('localhost:' + TEST_PORT) || out.includes('Orchestrator'))) {
        // banner 출력되면 준비 완료
        ready = true;
        clearTimeout(timer);
        // 소켓 바인딩 여유 50ms
        setTimeout(() => resolve(child), 50);
      }
    });
    child.stderr.on('data', () => {}); // 로그 무시
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function stopTestServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) { resolve(); return; }
    child.on('exit', () => resolve());
    child.kill('SIGTERM');
    // 2초 내 안 죽으면 SIGKILL
    setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve(); }, 2000);
  });
}

// 간단한 fetch 유틸 (Node 내장 http, 의존성 0)
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: HOST,
      port: TEST_PORT,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json: json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

module.exports = { TEST_PORT, HOST, startTestServer, stopTestServer, request };
