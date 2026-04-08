// 전역 상태 변수 선언
// 로드 순서: 2번째 (constants 이후, utils/main 이전)
// 주의: 다른 모듈에서 직접 read/write 하므로 이름 충돌 금지

// API 엔드포인트 (server.js와 같은 origin)
var API = 'http://localhost:' + (location.port || '54321');

// 에이전트 목록 (서버에서 fetch)
var agents = [];

// Master(CLAUDE.md) 데이터 + UI 상태
var masterData = { global: '', project: '', globalPath: '', projectPath: '', cwd: '' };
var elapsed = 0;
var editingId = null;
var masterTab = 'global';

// 프로젝트별 에이전트 토글 상태
var projectAgents = { hasRestriction: false, enabled: [] };

// === 세션 관리 ===
var sessions = {};           // pid → 세션 객체
var currentSession = null;   // 현재 활성 탭의 pid
var logEntries = [];         // 로그 패널 엔트리 (최대 MAX_LOGS개)

// 사용자가 드래그앤드롭으로 저장한 탭 순서 (pid 배열, localStorage 영속)
// 저장되지 않은 새 세션은 맨 뒤에 추가됨
var _tabOrder = (function() {
  try {
    var raw = localStorage.getItem('agviz-tab-order');
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
})();

function saveTabOrder() {
  try { localStorage.setItem('agviz-tab-order', JSON.stringify(_tabOrder)); }
  catch (e) {}
}

// === 실행 중 에이전트 인스턴스 ===
var liveInstances = {};      // key(sp_ai) → 인스턴스 객체

// === 테마 ===
var currentTheme = localStorage.getItem('viz-theme') || 'dark';

// === Village Tier (마을 크기 단계) ===
// 1=Compact, 2=Standard, 3=Spacious. detectVillageTier()로 갱신됨.
var currentVillageTier = 1;
