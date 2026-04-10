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

    // === 서버 ===
    srv_restart: '서버 재시작',
    srv_restart_confirm: '서버를 재시작합니다.\n브라우저가 자동으로 재연결됩니다.',
    srv_shutdown: '서버 종료',
    srv_shutdown_confirm: '서버를 종료합니다.\n다시 시작하려면 터미널에서 실행하세요.',

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

    // === Server ===
    srv_restart: 'Restart Server',
    srv_restart_confirm: 'Restart the server?\nThe browser will reconnect automatically.',
    srv_shutdown: 'Shutdown Server',
    srv_shutdown_confirm: 'Shut down the server?\nRestart from terminal to resume.',

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
