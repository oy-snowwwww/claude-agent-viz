// 순수 유틸리티 -- 외부 상태 의존 없이 입력만으로 결과를 반환하는 함수들

var fs = require('fs');
var path = require('path');

// lib/ 에서 프로젝트 루트 참조
var PROJECT_ROOT = path.join(__dirname, '..');

// --- 히스토리 용량 방어 상수 ---
var HISTORY_MAX_PROMPT_LEN = 500;
var HISTORY_MAX_SUMMARY_LEN = 300;
var HISTORY_MAX_QUESTIONS_PER_SESSION = 100;

// --- Privacy ---
var PRIVACY_FILE = path.join(PROJECT_ROOT, 'privacy');
function isPrivacyOn() { return fs.existsSync(PRIVACY_FILE); }

// --- 민감정보 마스킹 (API 키/토큰 패턴) ---
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

// --- 문자열 자르기 ---
function truncate(s, max) {
  if (!s) return '';
  var cleaned = String(s).replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '\u2026' : cleaned;
}

// --- 일자 키 (로컬 기준 YYYY-MM-DD) ---
function _ymd(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}
function todayKey() { return _ymd(); }

// --- transcript path 화이트리스트 검증 (Path Traversal 방어) ---
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

// --- 시스템 메시지/캐비엇 식별 (실제 사용자 질문이 아님) ---
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

module.exports = {
  _ymd: _ymd,
  todayKey: todayKey,
  maskSecrets: maskSecrets,
  truncate: truncate,
  isPrivacyOn: isPrivacyOn,
  isNoiseUserText: isNoiseUserText,
  isValidTranscriptPath: isValidTranscriptPath,
  TRANSCRIPT_BASE: TRANSCRIPT_BASE,
  TRANSCRIPT_MAX_BYTES: TRANSCRIPT_MAX_BYTES,
  HISTORY_MAX_PROMPT_LEN: HISTORY_MAX_PROMPT_LEN,
  HISTORY_MAX_SUMMARY_LEN: HISTORY_MAX_SUMMARY_LEN,
  HISTORY_MAX_QUESTIONS_PER_SESSION: HISTORY_MAX_QUESTIONS_PER_SESSION,
};
