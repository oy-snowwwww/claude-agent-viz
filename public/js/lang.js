// i18n — 한국어/영어 문자열 관리
// 로드 순서: 가장 먼저 (다른 모든 JS보다 앞)
// 사용법: t('key') → 현재 언어의 문자열 반환
// 언어 전환: setLang('en') / setLang('ko')

var _lang = localStorage.getItem('agviz-lang') || 'ko';

var L = {
  ko: {
    // === 헤더 ===
    sessions_waiting: 'Claude Code 세션 대기 중...',
    session: 'session',
    sessions: 'sessions',
    active: 'active',
    points_tip: '포인트 · 클릭: 상점',
    streak_tip: '연속 활동 일수',
    achievement_tip: '성취',
    grass_tip: '활동 잔디',
    notif_tip: '알림',
    history_tip: '히스토리',
    help_tip: '도움말',

    // === 상점 ===
    shop_title: '우주 상점',
    shop_wallet_preview: '프리뷰 모드 — 구매 불가',
    shop_lifetime: '누적',
    shop_owned: '보유 중',
    shop_not_owned: '미보유',
    shop_max: 'MAX',
    shop_confirm: '정말?',
    shop_buy_ok: '구매 완료',
    shop_buy_fail: '구매 실패',
    shop_insufficient: '포인트 부족',
    shop_locked: '이 카테고리는',
    shop_locked_suffix: '을(를) 먼저 구매해야 사용할 수 있습니다.',
    shop_locked_tab: '해금 탭',
    shop_refund: '환불 초기화',
    shop_refund_confirm: '정말 환불?',
    shop_refund_ok: '환불 →',
    shop_refund_restore: 'P 복원',
    shop_no_items: '환불할 아이템이 없습니다',
    shop_empty: '아이템 없음',
    shop_connect_fail: '연결 실패',

    // === 성취 ===
    ach_title: '성취',
    ach_achieved: '달성',
    ach_loading: '로딩 중...',
    ach_empty: '성취 정의 없음',
    ach_connect_fail: '서버 연결 실패',

    // === 잔디 ===
    grass_title: '활동 잔디',
    grass_summary_prefix: '최근 90일:',
    grass_days_active: '일 활동',
    grass_total_prefix: '총',
    grass_total_suffix: '회 질문',
    grass_less: '적음',
    grass_more: '많음',
    grass_load_fail: '로드 실패',
    grass_dow: ['일','월','화','수','목','금','토'],

    // === 알림 ===
    notif_on: '알림 ON',
    notif_off: '알림 OFF',
    notif_no_support: '이 브라우저는 알림을 지원하지 않습니다',
    notif_permission: '알림 권한이 필요합니다. 주소창 왼쪽 아이콘 > 알림 > 허용',
    notif_enabled: '알림이 활성화되었습니다. 탭을 벗어나면 작업 완료 시 알림을 받습니다.',
    notif_response_done: '응답 완료',
    notif_all_done: '모든 에이전트 완료',
    notif_agent_done: '완료',

    // === 포인트 ===
    points_preview: 'PREVIEW',
    points_tip_detail: '포인트',
    points_tip_lifetime: '누적',
    points_tip_shop: '클릭: 상점',
    points_drop: '보너스 드롭!',
    points_ach_done: '달성!',
    points_levelup: '달성!',

    // === 통계 ===
    stat_today: '오늘',
    stat_weekly: '주간 (7일)',
    stat_total: '전체',
    stat_question: '질문',
    stat_agent: '에이전트',
    stat_tool: '도구',
    stat_reset: '모든 통계(오늘/주간/전체)를 초기화합니다.\n이 작업은 되돌릴 수 없습니다.\n\n계속하시겠습니까?',
    stat_reset_done: '통계 초기화됨',
    stat_reset_fail: '초기화 실패',
    stat_file_heatmap: '파일 히트맵',
    stat_no_files: '파일 접근 기록 없음',

    // === 히스토리 ===
    hist_title: '세션 히스토리',
    hist_privacy: '사용 안 함',
    hist_clear_all: '전체 삭제',
    hist_search: '프롬프트/파일명/세션명 검색...',
    hist_no_result: '검색 결과가 없습니다',
    hist_empty: '저장된 히스토리가 없습니다',
    hist_confirm_clear: '저장된 히스토리 파일을 모두 삭제합니다.\n되돌릴 수 없습니다.\n\n계속하시겠습니까?',
    hist_clear_done: '히스토리 전체 삭제됨',
    hist_copy: '복사됨',

    // === 워크스페이스 ===
    ws_thinking: '생각 중...',
    ws_master: 'Master',

    // === 헤더 툴팁 ===
    tip_timer: '현재 세션 경과 시간',
    tip_points: '포인트 · 클릭: 상점',
    tip_streak: '연속 활동 일수',
    tip_achievement: '성취',
    tip_grass: '활동 잔디',
    tip_notif: '알림',
    tip_history: '히스토리',
    tip_help: '도움말',
    tip_restart: '재시작',
    tip_shutdown: '종료',

    // === 모달/히스토리 정적 텍스트 ===
    modal_settings: '설정',
    modal_delete: '삭제',
    modal_cancel: '취소',
    modal_save: '저장',
    modal_project_claude: '프로젝트 CLAUDE.md',
    hint_agent_id: '영문 소문자, 하이픈만 사용',
    hint_agent_desc: '에이전트 설명',
    hint_prompt: '시스템 프롬프트...',
    hist_session_history: '세션 히스토리',
    hist_privacy_tip: '다음 세션부터 프롬프트/요약을 디스크에 저장하지 않습니다',
    hist_privacy_label: '사용 안 함',
    hist_clear_tip: '저장된 히스토리 파일 전체 삭제 (되돌릴 수 없음)',
    hist_clear_btn: '전체 삭제',
    hist_search_placeholder: '프롬프트/파일명/세션명 검색...',
    hist_all: '전체',
    hist_today: '오늘',
    hist_3days: '최근 3일',
    hist_7days: '최근 7일',
    hist_all_agents: '모든 에이전트',
    hist_no_data: '히스토리가 없습니다',
    hist_copy_path: '폴더 경로 복사됨',
    hist_copy_fail: '복사 실패',
    hist_connect_fail: '서버 연결 실패',
    hist_retention: '7일·10MB 보관',
    hist_privacy_on: '프롬프트 기록 OFF',
    hist_privacy_off: '프롬프트 기록 ON',
    hist_change_fail: '변경 실패',
    hist_delete_fail: '삭제 실패',
    hist_deleted: '삭제됨',
    hist_delete_this: '이 기록 삭제',
    hist_delete_confirm: '한번 더 클릭하면 삭제됩니다 (3초 내)',
    hist_session_end_note: '세션이 종료되면 여기에 기록됩니다',
    hist_interrupted: '중단됨',

    // === 서버 ===
    srv_restart: '서버 재시작',
    srv_restart_confirm: '서버를 재시작합니다.\n브라우저가 자동으로 재연결됩니다.',
    srv_shutdown: '서버 종료',
    srv_shutdown_confirm: '서버를 종료합니다.\n다시 시작하려면 터미널에서 실행하세요.',

    // === 도움말 모달 ===
    help_html: '<div class="help-section"><h3>Terminal</h3><div class="help-cmd"><code>claude-agents</code><span>서버 시작 + 브라우저 열기</span></div><div class="help-cmd"><code>claude-agents stop</code><span>서버 종료 (헤더 ■ 버튼과 동일)</span></div><div class="help-cmd"><code>claude-agents status</code><span>현재 상태 확인</span></div><div class="help-cmd"><code>claude-agents on</code><span>세션 시작 시 자동 실행 ON</span></div><div class="help-cmd"><code>claude-agents off</code><span>자동 실행 OFF</span></div></div><div class="help-section"><h3>Header</h3><div class="help-tip"><strong>🔔</strong> — 브라우저 알림 on/off</div><div class="help-tip"><strong>🕐</strong> — 세션 히스토리</div><div class="help-tip"><strong>?</strong> — 이 도움말</div><div class="help-tip"><strong>↻</strong> — 서버 재시작</div><div class="help-tip"><strong>■</strong> — 서버 종료</div><div class="help-tip"><strong>🌙/☀️</strong> — 다크/라이트 테마 전환</div></div><div class="help-section"><h3>Session Tab</h3><div class="help-tip"><strong>클릭</strong> — 세션 필터</div><div class="help-tip"><strong>더블클릭</strong> — 이름 변경</div><div class="help-tip"><strong>드래그앤드롭</strong> — 탭 순서 변경</div><div class="help-tip"><strong>×</strong> — 탭 제거</div></div><div class="help-section"><h3>Workspace</h3><div class="help-tip">에이전트 캐릭터가 실시간 상태 표시 (idle/working/done)</div><div class="help-tip">우주 배경 + 별/은하수/성운/별똥별/별자리</div></div><div class="help-section"><h3>Left Panel</h3><div class="help-tip"><strong>Master</strong> — CLAUDE.md 편집</div><div class="help-tip"><strong>Agent</strong> — 에이전트 설정 편집</div><div class="help-tip"><strong>+ New</strong> — 새 에이전트 생성</div></div><div class="help-section"><h3>히스토리 & Privacy</h3><div class="help-tip">질문 프롬프트 + 응답 요약 + 통계</div><div class="help-tip">🔒 Privacy 토글로 기록 on/off</div><div class="help-tip">민감정보 자동 마스킹 (API 키, 토큰 등)</div><div class="help-tip">자동 정리: 7일 · 10MB · 1시간 주기</div></div><div class="help-section"><h3>알림</h3><div class="help-tip">탭 비활성 시 에이전트 완료/응답 완료 알림</div></div><div class="help-section"><h3>Hook Events</h3><div class="help-tip"><strong>SessionStart</strong> → 세션 등록</div><div class="help-tip"><strong>UserPromptSubmit</strong> → thinking_start</div><div class="help-tip"><strong>Stop</strong> → thinking_end</div><div class="help-tip"><strong>PreToolUse</strong> → 도구 사용</div><div class="help-tip"><strong>PostToolUse (Agent)</strong> → 에이전트 완료</div><div class="help-tip"><strong>SessionEnd</strong> → 히스토리 저장</div></div>',

    // === 캐릭터 대화 ===
    chat_solo: ['흠...', '이거 복잡하네', '거의 다 됐다', '하나만 더...', '집중!', '좋아좋아', '오 이거 되네'],
    chat_pair: [
      ['도와줄까?', '괜찮아 거의 끝나'],
      ['여기 봐봐', '오 좋은데?'],
      ['이건 어때?', '그거 좋다!'],
      ['힘들어...', '파이팅!'],
      ['버그 찾았다', '어디어디?'],
      ['다 했다!', '나도 거의!'],
      ['리뷰 부탁해', '잠깐만~'],
    ],
  },

  en: {
    // === Header ===
    sessions_waiting: 'Waiting for Claude Code sessions...',
    session: 'session',
    sessions: 'sessions',
    active: 'active',
    points_tip: 'Points · Click: Shop',
    streak_tip: 'Activity streak',
    achievement_tip: 'Achievements',
    grass_tip: 'Activity graph',
    notif_tip: 'Notifications',
    history_tip: 'History',
    help_tip: 'Help',

    // === Shop ===
    shop_title: 'Space Shop',
    shop_wallet_preview: 'Preview mode — Purchase disabled',
    shop_lifetime: 'Lifetime',
    shop_owned: 'Owned',
    shop_not_owned: 'Not owned',
    shop_max: 'MAX',
    shop_confirm: 'Sure?',
    shop_buy_ok: 'Purchased',
    shop_buy_fail: 'Purchase failed',
    shop_insufficient: 'Not enough points',
    shop_locked: 'This category requires',
    shop_locked_suffix: 'first.',
    shop_locked_tab: 'Unlock tab',
    shop_refund: 'Refund All',
    shop_refund_confirm: 'Really refund?',
    shop_refund_ok: 'Refunded →',
    shop_refund_restore: 'P restored',
    shop_no_items: 'No items to refund',
    shop_empty: 'No items',
    shop_connect_fail: 'Connection failed',

    // === Achievements ===
    ach_title: 'Achievements',
    ach_achieved: 'achieved',
    ach_loading: 'Loading...',
    ach_empty: 'No achievements',
    ach_connect_fail: 'Connection failed',

    // === Grass ===
    grass_title: 'Activity Graph',
    grass_summary_prefix: 'Last 90 days:',
    grass_days_active: 'days active',
    grass_total_prefix: 'Total',
    grass_total_suffix: 'questions',
    grass_less: 'Less',
    grass_more: 'More',
    grass_load_fail: 'Load failed',
    grass_dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],

    // === Notifications ===
    notif_on: 'Notifications ON',
    notif_off: 'Notifications OFF',
    notif_no_support: 'This browser does not support notifications',
    notif_permission: 'Notification permission required. Click the icon left of the address bar > Notifications > Allow',
    notif_enabled: 'Notifications enabled. You will be notified when tasks complete while this tab is inactive.',
    notif_response_done: 'Response complete',
    notif_all_done: 'All agents done',
    notif_agent_done: 'done',

    // === Points ===
    points_preview: 'PREVIEW',
    points_tip_detail: 'Points',
    points_tip_lifetime: 'Lifetime',
    points_tip_shop: 'Click: Shop',
    points_drop: 'Bonus drop!',
    points_ach_done: 'achieved!',
    points_levelup: 'reached!',

    // === Stats ===
    stat_today: 'Today',
    stat_weekly: 'Weekly (7d)',
    stat_total: 'All Time',
    stat_question: 'Questions',
    stat_agent: 'Agents',
    stat_tool: 'Tools',
    stat_reset: 'Reset all statistics (today/weekly/total)?\nThis cannot be undone.\n\nContinue?',
    stat_reset_done: 'Stats reset',
    stat_reset_fail: 'Reset failed',
    stat_file_heatmap: 'File Heatmap',
    stat_no_files: 'No file access recorded',

    // === History ===
    hist_title: 'Session History',
    hist_privacy: 'Disabled',
    hist_clear_all: 'Clear All',
    hist_search: 'Search prompts/files/sessions...',
    hist_no_result: 'No results found',
    hist_empty: 'No history saved',
    hist_confirm_clear: 'Delete all saved history files?\nThis cannot be undone.\n\nContinue?',
    hist_clear_done: 'All history cleared',
    hist_copy: 'Copied',

    // === Workspace ===
    ws_thinking: 'Thinking...',
    ws_master: 'Master',

    // === Header Tooltips ===
    tip_timer: 'Session elapsed time',
    tip_points: 'Points · Click: Shop',
    tip_streak: 'Activity streak',
    tip_achievement: 'Achievements',
    tip_grass: 'Activity graph',
    tip_notif: 'Notifications',
    tip_history: 'History',
    tip_help: 'Help',
    tip_restart: 'Restart',
    tip_shutdown: 'Shutdown',

    // === Modal/History static text ===
    modal_settings: 'Settings',
    modal_delete: 'Delete',
    modal_cancel: 'Cancel',
    modal_save: 'Save',
    modal_project_claude: 'Project CLAUDE.md',
    hint_agent_id: 'lowercase letters and hyphens only',
    hint_agent_desc: 'Agent description',
    hint_prompt: 'System prompt...',
    hist_session_history: 'Session History',
    hist_privacy_tip: 'Stop saving prompts/summaries to disk from next session',
    hist_privacy_label: 'Disabled',
    hist_clear_tip: 'Delete all saved history files (cannot be undone)',
    hist_clear_btn: 'Clear All',
    hist_search_placeholder: 'Search prompts/files/sessions...',
    hist_all: 'All',
    hist_today: 'Today',
    hist_3days: 'Last 3 days',
    hist_7days: 'Last 7 days',
    hist_all_agents: 'All agents',
    hist_no_data: 'No history',
    hist_copy_path: 'Path copied',
    hist_copy_fail: 'Copy failed',
    hist_connect_fail: 'Connection failed',
    hist_retention: '7d · 10MB retention',
    hist_privacy_on: 'Prompt recording OFF',
    hist_privacy_off: 'Prompt recording ON',
    hist_change_fail: 'Change failed',
    hist_delete_fail: 'Delete failed',
    hist_deleted: 'Deleted',
    hist_delete_this: 'Delete this record',
    hist_delete_confirm: 'Click again to delete (3s)',
    hist_session_end_note: 'Records appear after session ends',
    hist_interrupted: 'Interrupted',

    // === Server ===
    srv_restart: 'Restart Server',
    srv_restart_confirm: 'Restart the server?\nThe browser will reconnect automatically.',
    srv_shutdown: 'Shutdown Server',
    srv_shutdown_confirm: 'Shut down the server?\nRestart from terminal to resume.',

    // === Help Modal ===
    help_html: '<div class="help-section"><h3>Terminal</h3><div class="help-cmd"><code>claude-agents</code><span>Start server + open browser</span></div><div class="help-cmd"><code>claude-agents stop</code><span>Stop server</span></div><div class="help-cmd"><code>claude-agents status</code><span>Check status</span></div><div class="help-cmd"><code>claude-agents on</code><span>Auto-start ON</span></div><div class="help-cmd"><code>claude-agents off</code><span>Auto-start OFF</span></div></div><div class="help-section"><h3>Header</h3><div class="help-tip"><strong>🔔</strong> — Browser notifications on/off</div><div class="help-tip"><strong>🕐</strong> — Session history</div><div class="help-tip"><strong>?</strong> — This help</div><div class="help-tip"><strong>↻</strong> — Restart server</div><div class="help-tip"><strong>■</strong> — Shutdown server</div><div class="help-tip"><strong>🌙/☀️</strong> — Dark/Light theme</div></div><div class="help-section"><h3>Session Tab</h3><div class="help-tip"><strong>Click</strong> — Filter by session</div><div class="help-tip"><strong>Double-click</strong> — Rename session</div><div class="help-tip"><strong>Drag & Drop</strong> — Reorder tabs</div><div class="help-tip"><strong>×</strong> — Remove tab</div></div><div class="help-section"><h3>Workspace</h3><div class="help-tip">Agent characters show real-time status (idle/working/done)</div><div class="help-tip">Space background + stars/galaxy/nebula/meteors/constellations</div></div><div class="help-section"><h3>Left Panel</h3><div class="help-tip"><strong>Master</strong> — Edit CLAUDE.md</div><div class="help-tip"><strong>Agent</strong> — Edit agent settings</div><div class="help-tip"><strong>+ New</strong> — Create new agent</div></div><div class="help-section"><h3>History & Privacy</h3><div class="help-tip">Question prompts + response summaries + stats</div><div class="help-tip">🔒 Privacy toggle to disable recording</div><div class="help-tip">Auto-masking of sensitive data (API keys, tokens)</div><div class="help-tip">Auto-cleanup: 7 days · 10MB · hourly</div></div><div class="help-section"><h3>Notifications</h3><div class="help-tip">Alerts when agents complete while tab is inactive</div></div><div class="help-section"><h3>Hook Events</h3><div class="help-tip"><strong>SessionStart</strong> → Session registered</div><div class="help-tip"><strong>UserPromptSubmit</strong> → thinking_start</div><div class="help-tip"><strong>Stop</strong> → thinking_end</div><div class="help-tip"><strong>PreToolUse</strong> → Tool use</div><div class="help-tip"><strong>PostToolUse (Agent)</strong> → Agent done</div><div class="help-tip"><strong>SessionEnd</strong> → History saved</div></div>',

    // === Character Chat ===
    chat_solo: ['Hmm...', 'This is tricky', 'Almost done', 'One more...', 'Focus!', 'Nice nice', 'Oh this works'],
    chat_pair: [
      ['Need help?', 'Almost done thanks'],
      ['Check this', 'Oh nice!'],
      ['How about this?', 'Love it!'],
      ['Struggling...', 'You got this!'],
      ['Found a bug', 'Where?!'],
      ['Done!', 'Me too almost!'],
      ['Review pls', 'Just a sec~'],
    ],
  },
};

function t(key) {
  return (L[_lang] || L.ko)[key] || (L.ko)[key] || key;
}

function setLang(lang) {
  _lang = lang;
  localStorage.setItem('agviz-lang', lang);
  location.reload();
}

function getLang() { return _lang; }

// DOM 로드 후 정적 텍스트 + 툴팁 일괄 교체
document.addEventListener('DOMContentLoaded', function() {
  // 언어 버튼
  var btn = document.getElementById('langBtn');
  if (btn) btn.textContent = _lang === 'ko' ? 'KO' : 'EN';

  // data-tip 교체 (id → lang key 매핑)
  var tipMap = {
    sessionTimer: 'tip_timer',
    pointsBadge: 'tip_points',
    streakBadge: 'tip_streak',
    notifBtn: 'tip_notif',
  };
  Object.keys(tipMap).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.dataset.tip = t(tipMap[id]);
  });

  // 버튼 data-tip (onclick 기반 매핑)
  var btnTips = {
    'openPointsChart()': 'tip_achievement',
    'openGrassModal()': 'tip_grass',
    'toggleHistory()': 'tip_history',
    'toggleHelp()': 'tip_help',
    'restartServer()': 'tip_restart',
    'shutdownServer()': 'tip_shutdown',
  };
  document.querySelectorAll('.help-btn,.stop-btn,.restart-btn').forEach(function(el) {
    var oc = el.getAttribute('onclick') || '';
    Object.keys(btnTips).forEach(function(k) {
      if (oc.indexOf(k) >= 0) el.dataset.tip = t(btnTips[k]);
    });
  });

  // 정적 텍스트 교체
  var textMap = {
    noSessionsHint: 'sessions_waiting',
    modalTitle: 'modal_settings',
  };
  Object.keys(textMap).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = t(textMap[id]);
  });

  // 모달 버튼
  var btnDel = document.getElementById('btnDel');
  if (btnDel) btnDel.textContent = t('modal_delete');
  document.querySelectorAll('.btn-cancel').forEach(function(el) { el.textContent = t('modal_cancel'); });
  document.querySelectorAll('.btn-save').forEach(function(el) { el.textContent = t('modal_save'); });

  // 히스토리 모달
  var histTitle = document.querySelector('.hist-header h2');
  if (histTitle) histTitle.innerHTML = '&#128337; ' + t('hist_session_history') + ' <span class="hist-meta-info" id="histMetaInfo"></span>';
  var histPrivacy = document.querySelector('.hist-privacy');
  if (histPrivacy) histPrivacy.dataset.tip = t('hist_privacy_tip');
  var histPrivLabel = document.querySelector('.hist-privacy span');
  if (histPrivLabel) histPrivLabel.textContent = '🔒 ' + t('hist_privacy_label');
  var histClearBtn = document.querySelector('.hist-clear-all');
  if (histClearBtn) { histClearBtn.dataset.tip = t('hist_clear_tip'); histClearBtn.textContent = '🗑 ' + t('hist_clear_btn'); }
  var histSearchQ = document.getElementById('histSearchQ');
  if (histSearchQ) histSearchQ.placeholder = '🔍 ' + t('hist_search_placeholder');
  // 히스토리 기간 옵션
  var histDays = document.getElementById('histSearchDays');
  if (histDays) {
    var opts = histDays.querySelectorAll('option');
    var dayLabels = [t('hist_all'), t('hist_today'), t('hist_3days'), t('hist_7days')];
    opts.forEach(function(o, i) { if (dayLabels[i]) o.textContent = dayLabels[i]; });
  }
  // 에이전트 필터 첫 옵션
  var histAgent = document.getElementById('histAgentFilter');
  if (histAgent && histAgent.options[0]) histAgent.options[0].textContent = t('hist_all_agents');
  // 빈 히스토리
  var histEmpty = document.querySelector('.hist-empty');
  if (histEmpty) histEmpty.textContent = t('hist_no_data');
  // 에이전트 모달 힌트
  document.querySelectorAll('.hint').forEach(function(el) {
    if (el.textContent.indexOf('영문') >= 0) el.textContent = t('hint_agent_id');
  });
  var fDesc = document.getElementById('fDesc');
  if (fDesc) fDesc.placeholder = t('hint_agent_desc');
  var fBody = document.getElementById('fBody');
  if (fBody) fBody.placeholder = t('hint_prompt');
  // 프로젝트 CLAUDE.md 탭
  document.querySelectorAll('.tab-bar button').forEach(function(btn) {
    if (btn.textContent.indexOf('프로젝트') >= 0) btn.textContent = t('modal_project_claude');
  });
  // 도움말 모달 내용 교체
  var helpModal = document.querySelector('.help-modal');
  if (helpModal) {
    var closeBtn = helpModal.querySelector('h2 button');
    helpModal.innerHTML = '<h2>Guide <button onclick="toggleHelp()">&times;</button></h2>' + t('help_html');
  }
});
