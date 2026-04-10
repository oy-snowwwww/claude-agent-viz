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
  unlock_pulse:    { name: '큰 별 해금', name_en: 'Unlock Pulse Stars', desc: '큰 맥동 별 시스템을 활성화합니다', desc_en: 'Activate the pulse star system', category: 'unlock', rarity: 'common', price: 120, maxStack: 1, effect: { key: 'unlockPulse', delta: 1 } },
  unlock_nebula:   { name: '성운 해금', name_en: 'Unlock Nebula', desc: '첫 성운 1개가 등장합니다', desc_en: 'First nebula appears', category: 'unlock', rarity: 'common', price: 160, maxStack: 1, effect: { key: 'unlockNebula', delta: 1 } },
  unlock_galaxy:   { name: '은하수 해금', name_en: 'Unlock Galaxy', desc: '첫 은하수가 등장합니다', desc_en: 'First galaxy appears', category: 'unlock', rarity: 'rare', price: 300, maxStack: 1, effect: { key: 'unlockGalaxy', delta: 1 } },
  unlock_meteor:   { name: '별똥별 해금', name_en: 'Unlock Meteors', desc: '별똥별 시스템을 활성화합니다', desc_en: 'Activate shooting stars', category: 'unlock', rarity: 'common', price: 100, maxStack: 1, effect: { key: 'unlockMeteor', delta: 1 } },
  unlock_rainbow:  { name: '반짝이는 별 해금', name_en: 'Unlock Rainbow Stars', desc: '무지개 별 1개가 등장합니다', desc_en: 'First rainbow star appears', category: 'unlock', rarity: 'epic', price: 600, maxStack: 1, effect: { key: 'unlockRainbow', delta: 1 } },
  // ─── ⭐ 일반 별 ───
  star_count:      { name: '별 4개 추가', name_en: '+4 Stars', desc: '일반 별 +4개', desc_en: '+4 regular stars', category: 'stars', rarity: 'common', price: 30, maxStack: 10, effect: { key: 'starCountAdd', delta: 4 } },
  star_twinkle:    { name: '반짝임 가속', name_en: 'Twinkle Speed', desc: '별 반짝임 속도 +10%', desc_en: 'Twinkle speed +10%', category: 'stars', rarity: 'common', price: 40, maxStack: 5, effect: { key: 'starTwinkleMul', delta: 0.10 } },
  star_size:       { name: '별 확대', name_en: 'Star Size', desc: '일반 별 크기 +1px/stack', desc_en: 'Star size +1px/stack', category: 'stars', rarity: 'common', price: 50, maxStack: 2, effect: { key: 'starSizeAdd', delta: 1 } },
  star_brightness: { name: '별빛 강화', name_en: 'Star Glow', desc: '별 주변 글로우 +1px/stack', desc_en: 'Star glow +1px/stack', category: 'stars', rarity: 'common', price: 60, maxStack: 5, effect: { key: 'starBrightnessMul', delta: 1 } },
  star_palette:    { name: '별 팔레트 확장', name_en: 'Star Palette', desc: '일반 별 색상 +3종 (5색 → 8색)', desc_en: '+3 star colors (5 → 8)', category: 'stars', rarity: 'rare', price: 120, maxStack: 1, effect: { key: 'starPaletteAdd', delta: 1 } },
  // ─── 💫 큰 별 (pulse) ───
  pulse_count:     { name: '등대 증설', name_en: '+1 Beacon', desc: '큰 별 +1개', desc_en: '+1 pulse star', category: 'pulse', rarity: 'common', price: 80, maxStack: 6, effect: { key: 'pulseCountAdd', delta: 1 } },
  pulse_size:      { name: '등대 확대', name_en: 'Beacon Size', desc: '큰 별 크기 +1px', desc_en: 'Pulse star size +1px', category: 'pulse', rarity: 'rare', price: 240, maxStack: 2, effect: { key: 'pulseSizeAdd', delta: 1 } },
  pulse_glow:      { name: '등대 강화', name_en: 'Beacon Glow', desc: '큰 별 글로우 반경 +30%', desc_en: 'Pulse glow radius +30%', category: 'pulse', rarity: 'common', price: 120, maxStack: 5, effect: { key: 'pulseGlowMul', delta: 0.30 } },
  pulse_speed:     { name: '맥동 가속', name_en: 'Pulse Speed', desc: '큰 별 맥동 속도 +10%/stack', desc_en: 'Pulse speed +10%/stack', category: 'pulse', rarity: 'common', price: 70, maxStack: 3, effect: { key: 'pulseSpeedMul', delta: 0.10 } },
  // ─── 🔵 푸른 별 ───
  blue_ratio:      { name: '푸른빛 결정', name_en: 'Blue Crystal', desc: '푸른 별 +3개', desc_en: '+3 blue stars', category: 'blue', rarity: 'common', price: 60, maxStack: 10, effect: { key: 'blueStarAdd', delta: 3 } },
  blue_glow:       { name: '푸른빛 글로우', name_en: 'Blue Glow', desc: '푸른 별 글로우 +30%', desc_en: 'Blue star glow +30%', category: 'blue', rarity: 'common', price: 80, maxStack: 3, effect: { key: 'blueGlowMul', delta: 0.30 } },
  blue_pulse:      { name: '푸른 등대', name_en: 'Blue Beacon', desc: '큰 별 1개 푸른빛 확정', desc_en: '1 pulse star turns blue', category: 'blue', rarity: 'epic', price: 400, maxStack: 3, effect: { key: 'bluePulseAdd', delta: 1 } },
  // ─── 🟠 주황 별 ───
  orange_ratio:    { name: '호박빛 결정', name_en: 'Amber Crystal', desc: '주황 별 +3개', desc_en: '+3 orange stars', category: 'orange', rarity: 'common', price: 60, maxStack: 10, effect: { key: 'orangeStarAdd', delta: 3 } },
  orange_glow:     { name: '호박빛 글로우', name_en: 'Amber Glow', desc: '주황 별 글로우 +30%', desc_en: 'Orange star glow +30%', category: 'orange', rarity: 'common', price: 80, maxStack: 3, effect: { key: 'orangeGlowMul', delta: 0.30 } },
  orange_pulse:    { name: '호박 등대', name_en: 'Amber Beacon', desc: '큰 별 1개 주황빛 확정', desc_en: '1 pulse star turns orange', category: 'orange', rarity: 'epic', price: 400, maxStack: 3, effect: { key: 'orangePulseAdd', delta: 1 } },
  // ─── 💎 반짝이는 별 ───
  rainbow_count:   { name: '무지개 별 +1', name_en: '+1 Rainbow Star', desc: '반짝이는 별 +1개', desc_en: '+1 rainbow star', category: 'rainbow', rarity: 'rare', price: 300, maxStack: 7, effect: { key: 'rainbowCountAdd', delta: 1 } },
  rainbow_speed:   { name: '무지개 가속', name_en: 'Rainbow Speed', desc: '색 전환 속도 +20%', desc_en: 'Color cycle speed +20%', category: 'rainbow', rarity: 'rare', price: 160, maxStack: 5, effect: { key: 'rainbowSpeedMul', delta: 0.20 } },
  rainbow_size:    { name: '반짝이는 별 확대', name_en: 'Rainbow Size', desc: '크기 +1px/stack', desc_en: 'Size +1px/stack', category: 'rainbow', rarity: 'rare', price: 200, maxStack: 2, effect: { key: 'rainbowSizeAdd', delta: 1 } },
  rainbow_glow:    { name: '무지개 블룸', name_en: 'Rainbow Bloom', desc: '글로우 반경 +30%', desc_en: 'Glow radius +30%', category: 'rainbow', rarity: 'rare', price: 240, maxStack: 3, effect: { key: 'rainbowGlowMul', delta: 0.30 } },
  rainbow_trail:   { name: '무지개 잔상', name_en: 'Rainbow Trail', desc: '반짝이는 별 뒤에 무지개 글로우 잔상', desc_en: 'Rainbow glow trail behind star', category: 'rainbow', rarity: 'epic', price: 400, maxStack: 1, effect: { key: 'rainbowTrail', delta: 1 } },
  // ─── 🌌 은하수 ───
  galaxy_extra:    { name: '추가 은하수', name_en: '+1 Galaxy', desc: '은하수 +1개 (최대 +3, 총 4개)', desc_en: '+1 galaxy (max +3, total 4)', category: 'galaxy', rarity: 'rare', price: 800, maxStack: 3, effect: { key: 'galaxyExtraAdd', delta: 1 } },
  galaxy_density:  { name: '은하수 응축', name_en: 'Galaxy Density', desc: '별 밀도 +5%', desc_en: 'Star density +5%', category: 'galaxy', rarity: 'common', price: 100, maxStack: 10, effect: { key: 'galaxyDensityMul', delta: 0.05 } },
  galaxy_size:     { name: '은하수 팽창', name_en: 'Galaxy Size', desc: '크기 +5%', desc_en: 'Size +5%', category: 'galaxy', rarity: 'common', price: 120, maxStack: 10, effect: { key: 'galaxySizeMul', delta: 0.05 } },
  galaxy_blue:     { name: '푸른 은하수', name_en: 'Blue Galaxy', desc: '색조 파랑 선호', desc_en: 'Blue color tint', category: 'galaxy', rarity: 'epic', price: 500, maxStack: 1, effect: { key: 'galaxyBlueTint', delta: 1 } },
  galaxy_orange:   { name: '주황 은하수', name_en: 'Orange Galaxy', desc: '색조 주황 선호', desc_en: 'Orange color tint', category: 'galaxy', rarity: 'epic', price: 500, maxStack: 1, effect: { key: 'galaxyOrangeTint', delta: 1 } },
  galaxy_rotation: { name: '은하수 회전', name_en: 'Galaxy Rotation', desc: '180초에 한 바퀴 매우 천천히 회전', desc_en: 'Very slow rotation (180s/rev)', category: 'galaxy', rarity: 'epic', price: 700, maxStack: 1, effect: { key: 'galaxyRotation', delta: 1 } },
  galaxy_arms:     { name: '나선팔', name_en: 'Spiral Arms', desc: '은하수 나선팔 강조 (밀도 +20%/팔)', desc_en: 'Galaxy spiral arms (density +20%/arm)', category: 'galaxy', rarity: 'rare', price: 400, maxStack: 2, effect: { key: 'galaxyArmsAdd', delta: 1 } },
  // ─── ☁️ 성운 ───
  nebula_count:    { name: '성운 확장', name_en: '+1 Nebula', desc: '성운 +1개 (기본 1 + 최대 2 = 3개)', desc_en: '+1 nebula (base 1 + max 2 = 3)', category: 'nebula', rarity: 'common', price: 160, maxStack: 2, effect: { key: 'nebulaCountAdd', delta: 1 } },
  nebula_size:     { name: '성운 팽창', name_en: 'Nebula Size', desc: '크기 +3%', desc_en: 'Size +3%', category: 'nebula', rarity: 'common', price: 50, maxStack: 10, effect: { key: 'nebulaSizeMul', delta: 0.03 } },
  nebula_pulse:    { name: '성운 맥동', name_en: 'Nebula Pulse', desc: '숨쉬듯 밝아집니다 (진폭 +6%)', desc_en: 'Breathing glow (amplitude +6%)', category: 'nebula', rarity: 'common', price: 80, maxStack: 5, effect: { key: 'nebulaPulseAdd', delta: 0.06 } },
  nebula_purple:   { name: '보라 성운', name_en: 'Purple Nebula', desc: '추가 보라 성운 +1개 (기본과 별개)', desc_en: '+1 purple nebula (separate)', category: 'nebula', rarity: 'rare', price: 200, maxStack: 1, effect: { key: 'nebulaPurpleAdd', delta: 1 } },
  nebula_lightning: { name: '성운 번개', name_en: 'Nebula Lightning', desc: '성운 속에 가끔 번개 (전자기 폭풍)', desc_en: 'Occasional lightning in nebula', category: 'nebula', rarity: 'epic', price: 600, maxStack: 1, effect: { key: 'nebulaLightning', delta: 1 } },
  // ─── 🌠 별똥별 ───
  meteor_freq:     { name: '유성 빈도', name_en: 'Meteor Frequency', desc: '발생 간격 -10%', desc_en: 'Interval -10%', category: 'meteor', rarity: 'common', price: 60, maxStack: 8, effect: { key: 'meteorFreqMul', delta: 0.10 } },
  meteor_burst:    { name: '연쇄 확률', name_en: 'Burst Chance', desc: 'burst 확률 +5%', desc_en: 'Burst chance +5%', category: 'meteor', rarity: 'common', price: 100, maxStack: 10, effect: { key: 'meteorBurstAdd', delta: 0.05 } },
  meteor_burst_n:  { name: '연쇄 폭', name_en: 'Burst Count', desc: 'burst 개수 +1', desc_en: 'Burst count +1', category: 'meteor', rarity: 'rare', price: 240, maxStack: 2, effect: { key: 'meteorBurstN', delta: 1 } },
  meteor_tail:     { name: '긴 꼬리', name_en: 'Long Tail', desc: '꼬리 길이 +10%', desc_en: 'Tail length +10%', category: 'meteor', rarity: 'common', price: 50, maxStack: 5, effect: { key: 'meteorTailMul', delta: 0.10 } },
  meteor_size:     { name: '유성 확대', name_en: 'Meteor Size', desc: '별똥별 크기 +10%', desc_en: 'Meteor size +10%', category: 'meteor', rarity: 'common', price: 70, maxStack: 5, effect: { key: 'meteorSizeMul', delta: 0.10 } },
  meteor_direction: { name: '다방향 유성', name_en: 'Multi-Direction', desc: '4방향에서 떨어집니다', desc_en: 'Meteors from 4 directions', category: 'meteor', rarity: 'rare', price: 300, maxStack: 1, effect: { key: 'meteorDirection', delta: 1 } },
  meteor_rainbow:  { name: '무지개 꼬리', name_en: 'Rainbow Tail', desc: '꼬리가 무지개색으로 순환', desc_en: 'Tail cycles through rainbow', category: 'meteor', rarity: 'epic', price: 400, maxStack: 1, effect: { key: 'meteorRainbow', delta: 1 } },
  meteor_explode:  { name: '유성 착지 폭발', name_en: 'Meteor Explosion', desc: '별똥별이 사라질 때 작은 폭발', desc_en: 'Small explosion on impact', category: 'meteor', rarity: 'epic', price: 500, maxStack: 1, effect: { key: 'meteorExplode', delta: 1 } },
  // ─── 🌙 천체 ───
  celestial_moon:    { name: '달', name_en: 'Moon', desc: '큰 달이 화면 한쪽에 상시 표시', desc_en: 'Large moon always visible', category: 'celestial', rarity: 'epic', price: 1000, maxStack: 1, effect: { key: 'celestialMoon', delta: 1 } },
  celestial_planet:  { name: '떠도는 행성', name_en: 'Wandering Planet', desc: '행성 +1 (최대 3, 매우 천천히 공전)', desc_en: '+1 planet (max 3, slow orbit)', category: 'celestial', rarity: 'rare', price: 500, maxStack: 3, effect: { key: 'celestialPlanetAdd', delta: 1 } },
  celestial_pulsar:  { name: '펄사', name_en: 'Pulsar', desc: '매우 빠른 점멸 별 +1 (최대 2)', desc_en: '+1 fast blinking star (max 2)', category: 'celestial', rarity: 'rare', price: 400, maxStack: 2, effect: { key: 'celestialPulsarAdd', delta: 1 } },
  celestial_binary:  { name: '쌍성', name_en: 'Binary Star', desc: '큰 별 2개가 서로 공전', desc_en: 'Two stars orbiting each other', category: 'celestial', rarity: 'epic', price: 800, maxStack: 1, effect: { key: 'celestialBinary', delta: 1 } },
  celestial_station: { name: '우주 정거장', name_en: 'Space Station', desc: '5분마다 다양한 각도에서 빛 트레일이 화면을 가로지름', desc_en: 'Light trail crosses screen every 5min', category: 'celestial', rarity: 'epic', price: 900, maxStack: 1, effect: { key: 'celestialStation', delta: 1 } },
  // ─── 👤 캐릭터 ───
  char_halo:    { name: '후광', name_en: 'Halo', desc: 'working 중 캐릭터 주위 빛 파티클', desc_en: 'Glow particles around working characters', category: 'character', rarity: 'common', price: 200, maxStack: 1, effect: { key: 'charHalo', delta: 1 } },
  char_trail:   { name: '잔상', name_en: 'Trail', desc: '캐릭터 이동 시 사라지는 trail', desc_en: 'Fading trail when characters move', category: 'character', rarity: 'common', price: 150, maxStack: 1, effect: { key: 'charTrail', delta: 1 } },
  char_jump:    { name: '점프', name_en: 'Jump', desc: '가끔 점프 모션 (랜덤 쿨다운)', desc_en: 'Occasional jump motion', category: 'character', rarity: 'common', price: 200, maxStack: 1, effect: { key: 'charJump', delta: 1 } },
  char_fanfare: { name: '완료 팡파르', name_en: 'Fanfare', desc: 'agent_done 시 별이 위로 튀어오름', desc_en: 'Stars burst upward on agent_done', category: 'character', rarity: 'epic', price: 600, maxStack: 1, effect: { key: 'charFanfare', delta: 1 } },
  // ─── 🎆 이벤트 ───
  event_heartbeat:   { name: '우주의 숨결', name_en: 'Cosmic Breath', desc: '15초마다 전체 별 fade 한 번 (0.5s)', desc_en: 'All stars fade once every 15s', category: 'event', rarity: 'common', price: 500, maxStack: 1, effect: { key: 'eventHeartbeat', delta: 1 } },
  event_booster:     { name: '별빛 부스터', name_en: 'Starlight Boost', desc: '30초마다 모든 별 순간 2배 밝기 (1s)', desc_en: 'All stars flash 2x bright every 30s', category: 'event', rarity: 'common', price: 600, maxStack: 1, effect: { key: 'eventBooster', delta: 1 } },
  event_nebulabloom: { name: '성운 개화', name_en: 'Nebula Bloom', desc: '30초마다 성운 크기 +50% (3s)', desc_en: 'Nebula grows 50% every 30s', category: 'event', rarity: 'rare', price: 900, maxStack: 1, effect: { key: 'eventNebulaBloom', delta: 1 } },
  event_galaxyflash: { name: '은하수 번쩍', name_en: 'Galaxy Flash', desc: '45초마다 은하수 halo 3배 밝기 (2s)', desc_en: 'Galaxy halo 3x bright every 45s', category: 'event', rarity: 'rare', price: 800, maxStack: 1, effect: { key: 'eventGalaxyFlash', delta: 1 } },
  event_rainbowwave: { name: '무지개 물결', name_en: 'Rainbow Wave', desc: '1분마다 모든 별 hue-rotate 한 바퀴 (2s)', desc_en: 'All stars hue-rotate every 1min', category: 'event', rarity: 'epic', price: 1200, maxStack: 1, effect: { key: 'eventRainbowWave', delta: 1 } },
  event_color_storm: { name: '컬러 스톰', name_en: 'Color Storm', desc: '1분마다 모든 별이 1초간 색상 회전 (1s)', desc_en: 'All stars color rotate every 1min', category: 'event', rarity: 'epic', price: 1200, maxStack: 1, effect: { key: 'eventColorStorm', delta: 1 } },
  event_pulse_chain: { name: '맥동 연쇄', name_en: 'Pulse Chain', desc: '1분마다 큰 별들이 차례로 강하게 맥동 (3s)', desc_en: 'Pulse stars chain-glow every 1min', category: 'event', rarity: 'rare', price: 1000, maxStack: 1, effect: { key: 'eventPulseChain', delta: 1 } },
  // ─── ⭐ 별자리 ───
  constellation: { name: '별자리', name_en: 'Constellation', desc: '유명 별자리가 밤하늘에 등장 (오리온, 북두칠성 등)', desc_en: 'Famous constellations appear (Orion, Big Dipper...)', category: 'celestial', rarity: 'rare', price: 300, maxStack: 5, effect: { key: 'constellationCount', delta: 1 } },
  // ─── 📈 메타 ───
  meta_streak: { name: '연속 스트릭', name_en: 'Streak Badge', desc: '헤더에 🔥 N일 연속 활동 배지 표시', desc_en: 'Show 🔥 streak badge in header', category: 'meta', rarity: 'common', price: 200, maxStack: 1, effect: { key: 'metaStreak', delta: 1 } },
  // ─── 🎊 Legendary ───
  legendary_supernova: { name: 'Supernova', name_en: 'Supernova', desc: '10분마다 화면 중앙 폭발 flash', desc_en: 'Center screen flash every 10min', category: 'legendary', rarity: 'legendary', price: 3000, maxStack: 1, effect: { key: 'legendarySupernova', delta: 1 } },
  legendary_cosmicrain: { name: 'Cosmic Rain', name_en: 'Cosmic Rain', desc: '1시간마다 10초 유성우 폭풍', desc_en: '10s meteor storm every hour', category: 'legendary', rarity: 'legendary', price: 6000, maxStack: 1, effect: { key: 'legendaryCosmicRain', delta: 1 } },
  legendary_twinmoon:  { name: 'Binary Worlds', name_en: 'Binary Worlds', desc: '좌측 달 + 우측 가스 행성 (자전)', desc_en: 'Left moon + right gas planet (rotating)', category: 'legendary', rarity: 'legendary', price: 5000, maxStack: 1, effect: { key: 'legendaryTwinMoon', delta: 1 } },
};

// 점수 체계 v4 — 성취 보상이 메인 수입원, 기본 획득은 낮게
var POINTS_RULES = {
  thinking_start: 2,     // 질문 제출
  tool_use: 0.3,         // 도구 사용
  agent_done: 5,         // 에이전트 완료
  thinking_end: 0.5,     // 응답 완료
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
// full: 모든 아이템 max stack 완주
function buildPreviewInventory(mode) {
  if (mode === 'full') {
    var inv = {};
    Object.keys(ITEMS).forEach(function(id) { inv[id] = ITEMS[id].maxStack });
    return inv;
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
