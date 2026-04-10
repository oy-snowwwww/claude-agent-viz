// 순수 상수 — 다른 모듈에서 read-only로 참조
// 로드 순서: 1번째 (의존성 없음)

var MAX_LOGS = 500;

// 세션 탭 색상 팔레트
var SESSION_COLORS = ['#00ffc8','#a78bfa','#f472b6','#fb923c','#00d4ff','#84cc16','#fbbf24','#ef4444','#06b6d4','#e879f9'];

// 에이전트 타입별 고유 색상
var AGENT_COLORS = {
  master: '#fbbf24',
  coder: '#00ffc8',
  reviewer: '#a78bfa',
  qa: '#10b981',
  architect: '#00d4ff',
  designer: '#f472b6',
  planner: '#fb923c',
  _default: ['#00ffc8','#a78bfa','#10b981','#00d4ff','#f472b6','#fb923c','#fbbf24','#ef4444','#06b6d4','#84cc16']
};

// Claude Code 기본 도구 목록
var ALL_TOOLS = ['Read','Write','Edit','Glob','Grep','Bash','Agent','WebFetch','WebSearch','NotebookEdit'];

// 에이전트별 악세서리 이모지
var AGENT_ACCESSORIES = {master:'👑',coder:'💻',reviewer:'🔍',qa:'✅',architect:'📐',planner:'📋'};

// === Village Tier 임계점 ===
// 워크스페이스 폭에 따라 자동 선택. T별로 캐릭터 크기만 달라짐 (CSS --char-size, .workspace.tier-N)
var VILLAGE_TIER_MIN_W = { 1: 0, 2: 780, 3: 1500 };

function pickVillageTier(workspaceWidth) {
  if (workspaceWidth >= VILLAGE_TIER_MIN_W[3]) return 3;
  if (workspaceWidth >= VILLAGE_TIER_MIN_W[2]) return 2;
  return 1;
}

// 픽셀아트 맵 — 8행 × 7열, 값: 0=투명, 1=본체색, 2=어두운색, 3=스킨, 4=눈, 5=왕관(gold)
var PMAPS = {
  master:    [[0,5,0,5,0,5,0],[0,5,5,5,5,5,0],[0,0,1,1,1,1,0],[0,0,3,4,4,3,0],[0,0,3,3,3,3,0],[0,1,1,1,1,1,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  // coder: 양옆 헤드폰 컵 + 가운데 머리. 컵은 본체색(1), 머리는 본체색(1)
  coder:     [[1,1,0,0,0,1,1],[0,1,1,1,1,1,0],[0,0,3,4,4,3,0],[0,0,3,3,3,3,0],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  reviewer:  [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,2,3,4,4,3,2],[0,0,3,3,3,3,0],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  qa:        [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,0,3,4,4,3,0],[0,0,3,3,3,3,0],[0,1,1,2,2,1,0],[0,0,1,2,1,0,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  // architect: 챙 달린 헬멧. 행 0=모자 본체, 행 1=가로 가득한 챙(어두운 띠로 입체감)
  architect: [[0,1,1,1,1,1,0],[1,1,2,2,2,1,1],[0,0,3,4,4,3,0],[0,0,3,3,3,3,0],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  planner:   [[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[0,0,3,4,4,3,0],[0,0,3,3,3,3,0],[0,1,2,1,2,1,0],[0,0,1,1,1,0,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  _default:  [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,0,3,4,4,3,0],[0,0,3,3,3,3,0],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,1,0,1,0,0],[0,0,2,0,2,0,0]],
  // 모델별 변형 (머리 부분만)
  _opus:     [[0,5,0,5,0,5,0],[0,0,1,1,1,0,0]],
  _sonnet:   [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0]],
  _haiku:    [[0,0,0,0,0,0,0],[0,0,1,1,1,0,0]]
};

// === 게임화 아이템 카탈로그 (v5) ===
// 각 아이템: { name, desc, category, rarity, price, maxStack, effect: { key, delta } }
// buffs 계산: inventory[id] * effect.delta → buffs[effect.key]에 누적
// category: unlock | stars | pulse | rainbow | blue | orange | galaxy | nebula | meteor | celestial | character | event | meta | legendary
// rarity: common | rare | epic | legendary
//
// ⚠ 키 변경 시 village.js / workspace.js / event-ticks.js에서 참조하는 buffs 키도 함께 수정
var ITEMS = {
  // ─── 해금 아이템 (1회 구매) ───
  unlock_pulse:    { name: '큰 별 해금',          desc: '큰 맥동 별 시스템을 활성화합니다',       category: 'unlock', rarity: 'common', price: 120,  maxStack: 1, effect: { key: 'unlockPulse',    delta: 1 } },
  unlock_nebula:   { name: '성운 해금',           desc: '첫 성운 1개가 등장합니다',             category: 'unlock', rarity: 'common', price: 160,  maxStack: 1, effect: { key: 'unlockNebula',   delta: 1 } },
  unlock_galaxy:   { name: '은하수 해금',         desc: '첫 은하수가 등장합니다',               category: 'unlock', rarity: 'rare',   price: 300, maxStack: 1, effect: { key: 'unlockGalaxy',   delta: 1 } },
  unlock_meteor:   { name: '별똥별 해금',         desc: '별똥별 시스템을 활성화합니다',          category: 'unlock', rarity: 'common', price: 100,  maxStack: 1, effect: { key: 'unlockMeteor',   delta: 1 } },
  unlock_rainbow:  { name: '반짝이는 별 해금',    desc: '무지개 별 1개가 등장합니다',           category: 'unlock', rarity: 'epic',   price: 600, maxStack: 1, effect: { key: 'unlockRainbow',  delta: 1 } },

  // ─── ⭐ 일반 별 ───
  star_count:      { name: '별 4개 추가',         desc: '일반 별 +4개',                        category: 'stars',  rarity: 'common', price: 30, maxStack: 10, effect: { key: 'starCountAdd',      delta: 4    } },
  star_twinkle:    { name: '반짝임 가속',         desc: '별 반짝임 속도 +10%',                  category: 'stars',  rarity: 'common', price: 40, maxStack: 5,  effect: { key: 'starTwinkleMul',    delta: 0.10 } },
  star_size:       { name: '별 확대',             desc: '일반 별 크기 +1px/stack',              category: 'stars',  rarity: 'common', price: 50, maxStack: 2,  effect: { key: 'starSizeAdd',       delta: 1    } },
  star_brightness: { name: '별빛 강화',           desc: '별 주변 글로우 +1px/stack',            category: 'stars',  rarity: 'common', price: 60, maxStack: 5,  effect: { key: 'starBrightnessMul', delta: 1    } },
  star_palette:    { name: '별 팔레트 확장',      desc: '일반 별 색상 +3종 (5색 → 8색)',        category: 'stars',  rarity: 'rare',   price: 120, maxStack: 1,  effect: { key: 'starPaletteAdd',    delta: 1    } },

  // ─── 💫 큰 별 (pulse) ───
  pulse_count:     { name: '등대 증설',           desc: '큰 별 +1개',                          category: 'pulse',  rarity: 'common', price: 80,  maxStack: 6,  effect: { key: 'pulseCountAdd',   delta: 1    } },
  pulse_size:      { name: '등대 확대',           desc: '큰 별 크기 +1px',                      category: 'pulse',  rarity: 'rare',   price: 240, maxStack: 2,  effect: { key: 'pulseSizeAdd',    delta: 1    } },
  pulse_glow:      { name: '등대 강화',           desc: '큰 별 글로우 반경 +30%',               category: 'pulse',  rarity: 'common', price: 120,  maxStack: 5,  effect: { key: 'pulseGlowMul',    delta: 0.30 } },
  pulse_speed:     { name: '맥동 가속',           desc: '큰 별 맥동 속도 +10%/stack',           category: 'pulse',  rarity: 'common', price: 70,  maxStack: 3,  effect: { key: 'pulseSpeedMul',   delta: 0.10 } },

  // ─── 🔵 푸른 별 ───
  blue_ratio:      { name: '푸른빛 결정',         desc: '푸른 별 +3개',                        category: 'blue',   rarity: 'common', price: 60,  maxStack: 10, effect: { key: 'blueStarAdd',     delta: 3    } },
  blue_glow:       { name: '푸른빛 글로우',       desc: '푸른 별 글로우 +30%',                  category: 'blue',   rarity: 'common', price: 80,  maxStack: 3,  effect: { key: 'blueGlowMul',     delta: 0.30 } },
  blue_pulse:      { name: '푸른 등대',           desc: '큰 별 1개 푸른빛 확정',                category: 'blue',   rarity: 'epic',   price: 400, maxStack: 3,  effect: { key: 'bluePulseAdd',    delta: 1    } },

  // ─── 🟠 주황 별 ───
  orange_ratio:    { name: '호박빛 결정',         desc: '주황 별 +3개',                        category: 'orange', rarity: 'common', price: 60,  maxStack: 10, effect: { key: 'orangeStarAdd',   delta: 3    } },
  orange_glow:     { name: '호박빛 글로우',       desc: '주황 별 글로우 +30%',                  category: 'orange', rarity: 'common', price: 80,  maxStack: 3,  effect: { key: 'orangeGlowMul',   delta: 0.30 } },
  orange_pulse:    { name: '호박 등대',           desc: '큰 별 1개 주황빛 확정',                category: 'orange', rarity: 'epic',   price: 400, maxStack: 3,  effect: { key: 'orangePulseAdd',  delta: 1    } },

  // ─── 💎 반짝이는 별 (무지개 회전, 해금 후) ───
  rainbow_count:   { name: '무지개 별 +1',        desc: '반짝이는 별 +1개',                    category: 'rainbow', rarity: 'rare',  price: 300, maxStack: 7,  effect: { key: 'rainbowCountAdd', delta: 1    } },
  rainbow_speed:   { name: '무지개 가속',         desc: '색 전환 속도 +20%',                   category: 'rainbow', rarity: 'rare',  price: 160,  maxStack: 5,  effect: { key: 'rainbowSpeedMul', delta: 0.20 } },
  rainbow_size:    { name: '반짝이는 별 확대',    desc: '크기 +1px/stack',                     category: 'rainbow', rarity: 'rare',  price: 200, maxStack: 2,  effect: { key: 'rainbowSizeAdd',  delta: 1    } },
  rainbow_glow:    { name: '무지개 블룸',         desc: '글로우 반경 +30%',                    category: 'rainbow', rarity: 'rare',  price: 240, maxStack: 3,  effect: { key: 'rainbowGlowMul',  delta: 0.30 } },
  rainbow_trail:   { name: '무지개 잔상',         desc: '반짝이는 별 뒤에 무지개 글로우 잔상',  category: 'rainbow', rarity: 'epic',  price: 400, maxStack: 1,  effect: { key: 'rainbowTrail',    delta: 1    } },

  // ─── 🌌 은하수 (해금 후) ───
  galaxy_extra:    { name: '추가 은하수',         desc: '은하수 +1개 (최대 +3, 총 4개)',        category: 'galaxy', rarity: 'rare',   price: 800, maxStack: 3,  effect: { key: 'galaxyExtraAdd',  delta: 1    } },
  galaxy_density:  { name: '은하수 응축',         desc: '별 밀도 +5%',                         category: 'galaxy', rarity: 'common', price: 100,  maxStack: 10, effect: { key: 'galaxyDensityMul',delta: 0.05 } },
  galaxy_size:     { name: '은하수 팽창',         desc: '크기 +5%',                            category: 'galaxy', rarity: 'common', price: 120,  maxStack: 10, effect: { key: 'galaxySizeMul',   delta: 0.05 } },
  galaxy_blue:     { name: '푸른 은하수',         desc: '색조 파랑 선호',                       category: 'galaxy', rarity: 'epic',   price: 500, maxStack: 1,  effect: { key: 'galaxyBlueTint',  delta: 1    } },
  galaxy_orange:   { name: '주황 은하수',         desc: '색조 주황 선호',                       category: 'galaxy', rarity: 'epic',   price: 500, maxStack: 1,  effect: { key: 'galaxyOrangeTint',delta: 1    } },
  galaxy_rotation: { name: '은하수 회전',         desc: '180초에 한 바퀴 매우 천천히 회전',     category: 'galaxy', rarity: 'epic',   price: 700, maxStack: 1,  effect: { key: 'galaxyRotation',  delta: 1    } },
  galaxy_arms:     { name: '나선팔',              desc: '은하수 나선팔 강조 (밀도 +20%/팔)',    category: 'galaxy', rarity: 'rare',   price: 400, maxStack: 2,  effect: { key: 'galaxyArmsAdd',   delta: 1    } },

  // ─── ☁️ 성운 (해금 후) ───
  nebula_count:    { name: '성운 확장',           desc: '성운 +1개 (기본 1 + 최대 2 = 3개)',   category: 'nebula', rarity: 'common', price: 160,  maxStack: 2,  effect: { key: 'nebulaCountAdd',  delta: 1    } },
  nebula_size:     { name: '성운 팽창',           desc: '크기 +3%',                            category: 'nebula', rarity: 'common', price: 50,  maxStack: 10, effect: { key: 'nebulaSizeMul',   delta: 0.03 } },
  nebula_pulse:    { name: '성운 맥동',           desc: '숨쉬듯 밝아집니다 (진폭 +6%)',        category: 'nebula', rarity: 'common', price: 80,  maxStack: 5,  effect: { key: 'nebulaPulseAdd',  delta: 0.06 } },
  nebula_purple:   { name: '보라 성운',           desc: '추가 보라 성운 +1개 (기본과 별개)',    category: 'nebula', rarity: 'rare',   price: 200, maxStack: 1,  effect: { key: 'nebulaPurpleAdd', delta: 1    } },
  nebula_lightning:{ name: '성운 번개',           desc: '성운 속에 가끔 번개 (전자기 폭풍)',    category: 'nebula', rarity: 'epic',   price: 600, maxStack: 1,  effect: { key: 'nebulaLightning', delta: 1    } },

  // ─── 🌠 별똥별 (해금 후) ───
  meteor_freq:     { name: '유성 빈도',           desc: '발생 간격 -10%',                      category: 'meteor', rarity: 'common', price: 60,  maxStack: 8,  effect: { key: 'meteorFreqMul',   delta: 0.10 } },
  meteor_burst:    { name: '연쇄 확률',           desc: 'burst 확률 +5%',                      category: 'meteor', rarity: 'common', price: 100,  maxStack: 10, effect: { key: 'meteorBurstAdd',  delta: 0.05 } },
  meteor_burst_n:  { name: '연쇄 폭',             desc: 'burst 개수 +1',                       category: 'meteor', rarity: 'rare',   price: 240, maxStack: 2,  effect: { key: 'meteorBurstN',    delta: 1    } },
  meteor_tail:     { name: '긴 꼬리',             desc: '꼬리 길이 +10%',                      category: 'meteor', rarity: 'common', price: 50,  maxStack: 5,  effect: { key: 'meteorTailMul',   delta: 0.10 } },
  meteor_size:     { name: '유성 확대',           desc: '별똥별 크기 +10%',                    category: 'meteor', rarity: 'common', price: 70,  maxStack: 5,  effect: { key: 'meteorSizeMul',   delta: 0.10 } },
  meteor_direction:{ name: '다방향 유성',         desc: '4방향에서 떨어집니다',                 category: 'meteor', rarity: 'rare',   price: 300, maxStack: 1,  effect: { key: 'meteorDirection', delta: 1    } },
  meteor_rainbow:  { name: '무지개 꼬리',         desc: '꼬리가 무지개색으로 순환',             category: 'meteor', rarity: 'epic',   price: 400, maxStack: 1,  effect: { key: 'meteorRainbow',   delta: 1    } },
  meteor_explode:  { name: '유성 착지 폭발',      desc: '별똥별이 사라질 때 작은 폭발',         category: 'meteor', rarity: 'epic',   price: 500, maxStack: 1,  effect: { key: 'meteorExplode',   delta: 1    } },

  // ─── 🌙 천체 (Celestial) — 상시 표시 구조물 ───
  celestial_moon:    { name: '달',                 desc: '큰 달이 화면 한쪽에 상시 표시',        category: 'celestial', rarity: 'epic',   price: 1000, maxStack: 1, effect: { key: 'celestialMoon',      delta: 1 } },
  celestial_planet:  { name: '떠도는 행성',        desc: '행성 +1 (최대 3, 매우 천천히 공전)',   category: 'celestial', rarity: 'rare',   price: 500,  maxStack: 3, effect: { key: 'celestialPlanetAdd', delta: 1 } },
  celestial_pulsar:  { name: '펄사',               desc: '매우 빠른 점멸 별 +1 (최대 2)',       category: 'celestial', rarity: 'rare',   price: 400,  maxStack: 2, effect: { key: 'celestialPulsarAdd', delta: 1 } },
  celestial_binary:  { name: '쌍성',               desc: '큰 별 2개가 서로 공전',                category: 'celestial', rarity: 'epic',   price: 800,  maxStack: 1, effect: { key: 'celestialBinary',    delta: 1 } },
  celestial_station: { name: '우주 정거장',        desc: '5분마다 다양한 각도에서 빛 트레일이 화면을 가로지름', category: 'celestial', rarity: 'epic',   price: 900,  maxStack: 1, effect: { key: 'celestialStation',   delta: 1 } },

  // ─── 👤 캐릭터 (Character) — 에이전트 시각 강화 ───
  char_halo:    { name: '후광',          desc: 'working 중 캐릭터 주위 빛 파티클', category: 'character', rarity: 'common', price: 200, maxStack: 1, effect: { key: 'charHalo',    delta: 1 } },
  char_trail:   { name: '잔상',          desc: '캐릭터 이동 시 사라지는 trail',     category: 'character', rarity: 'common', price: 150, maxStack: 1, effect: { key: 'charTrail',   delta: 1 } },
  char_jump:    { name: '점프',          desc: '가끔 점프 모션 (랜덤 쿨다운)',     category: 'character', rarity: 'common', price: 200, maxStack: 1, effect: { key: 'charJump',    delta: 1 } },
  char_fanfare: { name: '완료 팡파르',   desc: 'agent_done 시 별이 위로 튀어오름', category: 'character', rarity: 'epic',   price: 600, maxStack: 1, effect: { key: 'charFanfare', delta: 1 } },

  // ─── 🎆 이벤트 아이템 (1회 구매, 주기적 발동) ───
  event_heartbeat:    { name: '우주의 숨결',       desc: '15초마다 전체 별 fade 한 번 (0.5s)',   category: 'event', rarity: 'common', price: 500,  maxStack: 1, effect: { key: 'eventHeartbeat',   delta: 1 } },
  event_booster:      { name: '별빛 부스터',       desc: '30초마다 모든 별 순간 2배 밝기 (1s)',  category: 'event', rarity: 'common', price: 600,  maxStack: 1, effect: { key: 'eventBooster',     delta: 1 } },
  event_nebulabloom:  { name: '성운 개화',         desc: '30초마다 성운 크기 +50% (3s)',         category: 'event', rarity: 'rare',   price: 900,  maxStack: 1, effect: { key: 'eventNebulaBloom', delta: 1 } },
  event_galaxyflash:  { name: '은하수 번쩍',       desc: '45초마다 은하수 halo 3배 밝기 (2s)',    category: 'event', rarity: 'rare',   price: 800,  maxStack: 1, effect: { key: 'eventGalaxyFlash', delta: 1 } },
  event_rainbowwave:  { name: '무지개 물결',       desc: '1분마다 모든 별 hue-rotate 한 바퀴 (2s)', category: 'event', rarity: 'epic', price: 1200, maxStack: 1, effect: { key: 'eventRainbowWave', delta: 1 } },
  event_color_storm:  { name: '컬러 스톰',         desc: '1분마다 모든 별이 1초간 색상 회전 (1s)', category: 'event', rarity: 'epic',  price: 1200,  maxStack: 1, effect: { key: 'eventColorStorm',  delta: 1 } },
  event_pulse_chain:  { name: '맥동 연쇄',         desc: '1분마다 큰 별들이 차례로 강하게 맥동 (3s)', category: 'event', rarity: 'rare', price: 1000, maxStack: 1, effect: { key: 'eventPulseChain', delta: 1 } },

  // ─── 📈 메타 (Meta) — 진척/리워드 ───
  meta_streak: { name: '연속 스트릭',  desc: '헤더에 🔥 N일 연속 활동 배지 표시',   category: 'meta', rarity: 'common', price: 200, maxStack: 1, effect: { key: 'metaStreak', delta: 1 } },

  // ─── 🎊 Legendary (1회 구매) ───
  legendary_supernova: { name: 'Supernova',          desc: '10분마다 화면 중앙 폭발 flash',       category: 'legendary', rarity: 'legendary', price: 3000, maxStack: 1, effect: { key: 'legendarySupernova', delta: 1 } },
  legendary_cosmicrain:{ name: 'Cosmic Rain',        desc: '1시간마다 10초 유성우 폭풍',           category: 'legendary', rarity: 'legendary', price: 6000, maxStack: 1, effect: { key: 'legendaryCosmicRain',delta: 1 } },
  legendary_twinmoon:  { name: 'Binary Worlds',      desc: '좌측 달 + 우측 가스 행성 (자전)',      category: 'legendary', rarity: 'legendary', price: 5000, maxStack: 1, effect: { key: 'legendaryTwinMoon',  delta: 1 } },
};

// 점수 체계 v3 (소수점 누적, UI는 반올림)
var POINTS_RULES = {
  thinking_start: 3,     // 질문 제출
  tool_use: 0.5,         // 도구 사용
  agent_done: 10,        // 에이전트 완료
  thinking_end: 1,       // 응답 완료
};

// === 아이템 카탈로그 → 버프 객체 계산 ===
// inventory: { id: count } → buffs: { key: value }
// unknown id는 무시 (역호환)
function computeBuffs(inventory) {
  var buffs = {};
  if (!inventory) return buffs;
  Object.keys(inventory).forEach(function(id) {
    var def = ITEMS[id];
    if (!def) return;
    var count = Math.min(inventory[id] || 0, def.maxStack);
    if (count <= 0) return;
    var key = def.effect.key;
    buffs[key] = (buffs[key] || 0) + def.effect.delta * count;
  });
  return buffs;
}

// === 프리뷰 모드 — 가상 인벤토리 생성 ===
// mode: 'empty' | 'mid' | 'full' | null
// empty: 모든 해금/업그레이드 없음 (빈 우주)
// mid: 약 1개월 진행 (해금 4개 + 주요 업그레이드 절반)
// full: 모든 아이템 max stack 완주
function buildPreviewInventory(mode) {
  if (mode === 'full') {
    var inv = {};
    Object.keys(ITEMS).forEach(function(id) { inv[id] = ITEMS[id].maxStack });
    return inv;
  }
  if (mode === 'mid') {
    return {
      unlock_meteor: 1, unlock_nebula: 1, unlock_galaxy: 1,
      star_count: 5, star_twinkle: 2,
      nebula_count: 2, nebula_size: 4,
      galaxy_density: 4, galaxy_size: 4,
      meteor_freq: 3, meteor_burst: 4, meteor_size: 3,
      event_heartbeat: 1, event_booster: 1,
    };
  }
  return {}; // empty
}

// CommonJS 조건부 export (Node 테스트 환경에서만, 브라우저에는 영향 없음)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pickVillageTier: pickVillageTier,
    VILLAGE_TIER_MIN_W: VILLAGE_TIER_MIN_W,
    PMAPS: PMAPS,
    ITEMS: ITEMS,
    POINTS_RULES: POINTS_RULES,
    computeBuffs: computeBuffs,
    buildPreviewInventory: buildPreviewInventory,
  };
}
