// 게임화: 포인트 저장/획득/구매/성취/레벨 시스템

var fs = require('fs');
var path = require('path');
var state = require('./state');
var utils = require('./utils');
var sse = require('./sse');

// 게임화 카탈로그 — constants.js와 공유 (단일 진실 공급원)
var GAME_CONSTANTS = require(path.join(__dirname, '..', 'public', 'js', 'constants.js'));
var GAME_ITEMS = GAME_CONSTANTS.ITEMS || {};
var POINTS_RULES = GAME_CONSTANTS.POINTS_RULES || {};
var computeBuffs = GAME_CONSTANTS.computeBuffs || function() { return {}; };

// points.json은 프로젝트 루트에 저장
// 스키마: { version, total, lifetime, inventory, achievements, pointsHistory, ... }
// - version: 스키마 마이그레이션용
// - total: 현재 사용 가능한 포인트 (소수점 누적, UI는 정수 반올림)
// - lifetime: 누적 획득 (초기화해도 유지 — 자랑용)
// - inventory: 아이템 ID -> 스택 수
// - achievements: { id: unlockedAt ISO } — 달성한 성취 목록
// - pointsHistory: [{ date, earned, spent }] — 일별 포인트 이력 (최대 30일)
// - lastDailyBonus: "YYYY-MM-DD" — 데일리 보너스 지급 날짜
// - nightCount: 새벽 1~5시 활동 횟수 (올빼미 성취용)
var POINTS_FILE = path.join(__dirname, '..', 'points.json');

// 신규 사용자 환영 보너스 — points.json이 없을 때 1회 지급
// 200P면 unlock_meteor(100P) + unlock_pulse(120P) 등 두세 가지 시도 가능 -> 첫 인상 풍성
// lifetime에는 포함 안 함 (받은 것이지 번 것이 아니므로 누적 획득에서 제외)
var STARTER_BONUS = 200;

// 삭제된 레거시 아이템 가격표 — 기존 사용자가 보유 중이면 환불/계산 시 fallback으로 사용
// GAME_ITEMS(constants.js)에서 제거된 아이템이라도 이 표에 있으면 환불 가능
// 가격은 Phase 2의 x2 적용 기준. 아이템이 점진적으로 삭제되면 여기에 추가.
var DEPRECATED_ITEMS = {
  legendary_aurora:     { price: 4000 },
  legendary_voidpulse:  { price: 5600 },
  event_blackhole:      { price: 1400 },
  event_meteorrush:     { price: 3000 },
  event_fourway:        { price: 1600 },
  event_fullshower:     { price: 2000 },
  event_warp:           { price: 2800 },
  event_gravity_wave:   { price: 2400 },
  event_warp_drive:     { price: 1400 },
  meteor_color:         { price: 50 },
  unlock_ambient:       { price: 200 },
  ambient_rate:         { price: 80 },
  ambient_size:         { price: 60 },
  ambient_height:       { price: 60 },
  ambient_colors:       { price: 120 },
  event_ambientburst:   { price: 700 },
};

// 아이템 가격 조회 — 현행 ITEMS 우선, 없으면 DEPRECATED_ITEMS fallback
function itemPrice(id) {
  var def = GAME_ITEMS[id];
  if (def) return def.price;
  var dep = DEPRECATED_ITEMS[id];
  if (dep) return dep.price;
  return 0;
}

function loadPoints() {
  try {
    if (fs.existsSync(POINTS_FILE)) {
      var data = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
      // 누락 필드 기본값 채우기 (역호환)
      if (typeof data.version !== 'number') data.version = 1;
      if (typeof data.total !== 'number') data.total = 0;
      if (typeof data.lifetime !== 'number') data.lifetime = 0;
      if (!data.inventory || typeof data.inventory !== 'object') data.inventory = {};
      if (typeof data.streak !== 'number') data.streak = 0;
      if (typeof data.lastStreakDay !== 'string') data.lastStreakDay = null;
      if (!data.achievements || typeof data.achievements !== 'object') data.achievements = {};
      if (!Array.isArray(data.pointsHistory)) data.pointsHistory = [];
      if (typeof data.nightCount !== 'number') data.nightCount = 0;
      if (typeof data.promptCount !== 'number') data.promptCount = 0;
      if (typeof data.toolCount !== 'number') data.toolCount = 0;
      if (typeof data.agentCount !== 'number') data.agentCount = 0;
      if (typeof data.earlyCount !== 'number') data.earlyCount = 0;
      if (typeof data.dropCount !== 'number') data.dropCount = 0;
      // 레벨 복원 — 서버 재시작 시 레벨업 토스트 오발 방지
      data._lastLevel = calcLevel(data.lifetime || 0);
      return data;
    }
  } catch(e) {
    console.log('  [POINTS] load error:', e.message);
  }
  // 신규 사용자 — 환영 보너스 지급. lifetime은 0 (받은 보너스는 누적 획득에 포함 X)
  console.log('  [POINTS] 신규 사용자 — 환영 보너스 ' + STARTER_BONUS + 'P 지급');
  return {
    version: 1,
    total: STARTER_BONUS,
    lifetime: 0,
    inventory: {},
    streak: 0,
    lastStreakDay: null,
    achievements: {},
    pointsHistory: [],
    nightCount: 0,
    promptCount: 0,
    toolCount: 0,
    agentCount: 0,
    earlyCount: 0,
    dropCount: 0,
    createdAt: new Date().toISOString(),
  };
}

var _savePointsTimer = null;
function savePoints() {
  if (_savePointsTimer) return;
  _savePointsTimer = setTimeout(function() {
    _savePointsTimer = null;
    try { fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsData), 'utf8'); } catch(e) { console.log('  [POINTS] save error:', e.message); }
  }, 1500);
}
function flushPoints() {
  if (_savePointsTimer) { clearTimeout(_savePointsTimer); _savePointsTimer = null; }
  try { fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsData), 'utf8'); } catch(e) {}
}

// === 성취 정의 (서버에서 조건 체크 — 클라이언트는 표시만) ===
// 성취 카테고리 — lang별 라벨
var ACH_CATEGORIES = {
  ko: { prompt: '🎯 질문', tool: '🔧 도구', agent: '🤖 에이전트', streak: '🔥 연속 활동', time: '🕐 시간대', shop: '🛒 상점', points: '💰 포인트', spend: '💸 소비', luck: '🎰 행운', master: '⭐ 마스터' },
  en: { prompt: '🎯 Questions', tool: '🔧 Tools', agent: '🤖 Agents', streak: '🔥 Streaks', time: '🕐 Time', shop: '🛒 Shop', points: '💰 Points', spend: '💸 Spending', luck: '🎰 Luck', master: '⭐ Master' },
};

// 레벨 칭호 — lang별
var LEVEL_TITLES_I18N = {
  ko: [[1,'초보 관측자'],[5,'별지기'],[10,'항해사'],[15,'천문학자'],[20,'우주 탐험가'],[30,'성운 조각가'],[40,'은하 건축가'],[50,'우주의 현자'],[70,'차원 여행자'],[90,'코스믹 마스터'],[100,'우주의 지배자']],
  en: [[1,'Stargazer'],[5,'Star Keeper'],[10,'Navigator'],[15,'Astronomer'],[20,'Space Explorer'],[30,'Nebula Sculptor'],[40,'Galaxy Architect'],[50,'Cosmic Sage'],[70,'Dimension Traveler'],[90,'Cosmic Master'],[100,'Lord of the Universe']],
};

function levelTitleI18n(lv, lang) {
  var titles = LEVEL_TITLES_I18N[lang] || LEVEL_TITLES_I18N.ko;
  var title = titles[0][1];
  for (var i = 0; i < titles.length; i++) { if (lv >= titles[i][0]) title = titles[i][1]; }
  return title;
}

// 성취 헬퍼 — counter >= target 패턴 (대부분의 성취가 이 구조)
// name/desc = [ko, en] 배열
function _ach(cat, names, descs, reward, field, target) {
  return {
    cat: cat, name: names[0], name_en: names[1], desc: descs[0], desc_en: descs[1], reward: reward,
    check: function() { return (pointsData[field] || 0) >= target; },
    progress: function() { return { current: Math.min(pointsData[field] || 0, target), target: target }; },
  };
}
// 성취 헬퍼 — 인벤토리 종류 수 >= target
function _achInv(cat, names, descs, reward, target) {
  return {
    cat: cat, name: names[0], name_en: names[1], desc: descs[0], desc_en: descs[1], reward: reward,
    check: function() { return Object.keys(pointsData.inventory || {}).length >= target; },
    progress: function() { return { current: Math.min(Object.keys(pointsData.inventory || {}).length, target), target: target }; },
  };
}

var ACHIEVEMENTS = {
  // -- 🎯 질문 --
  prompt_10:     _ach('prompt', ['첫 발걸음','First Steps'],    ['질문 10회','10 questions'],       30,   'promptCount', 10),
  prompt_50:     _ach('prompt', ['호기심','Curious'],           ['질문 50회','50 questions'],       80,   'promptCount', 50),
  prompt_100:    _ach('prompt', ['탐구자','Explorer'],          ['질문 100회','100 questions'],     150,  'promptCount', 100),
  prompt_300:    _ach('prompt', ['연구자','Researcher'],        ['질문 300회','300 questions'],     300,  'promptCount', 300),
  prompt_500:    _ach('prompt', ['학자','Scholar'],             ['질문 500회','500 questions'],     500,  'promptCount', 500),
  prompt_1000:   _ach('prompt', ['현자','Sage'],                ['질문 1,000회','1,000 questions'], 1000, 'promptCount', 1000),
  prompt_5000:   _ach('prompt', ['대현자','Grand Sage'],        ['질문 5,000회','5,000 questions'], 3000, 'promptCount', 5000),
  // -- 🔧 도구 --
  tool_50:       _ach('tool', ['견습생','Apprentice'],     ['도구 50회 사용','50 tool uses'],     30,   'toolCount', 50),
  tool_200:      _ach('tool', ['기능공','Craftsman'],      ['도구 200회 사용','200 tool uses'],   80,   'toolCount', 200),
  tool_500:      _ach('tool', ['장인','Artisan'],          ['도구 500회 사용','500 tool uses'],   200,  'toolCount', 500),
  tool_1000:     _ach('tool', ['명장','Expert'],           ['도구 1,000회 사용','1,000 tool uses'],500, 'toolCount', 1000),
  tool_3000:     _ach('tool', ['달인','Virtuoso'],         ['도구 3,000회 사용','3,000 tool uses'],1000,'toolCount', 3000),
  tool_5000:     _ach('tool', ['마스터','Master'],         ['도구 5,000회 사용','5,000 tool uses'],2000,'toolCount', 5000),
  // -- 🤖 에이전트 --
  agent_5:       _ach('agent', ['팀 빌딩','Team Building'],   ['에이전트 5회 완료','5 agents done'],   30,   'agentCount', 5),
  agent_20:      _ach('agent', ['팀 리더','Team Leader'],     ['에이전트 20회 완료','20 agents done'],  100,  'agentCount', 20),
  agent_50:      _ach('agent', ['지휘관','Commander'],        ['에이전트 50회 완료','50 agents done'],  300,  'agentCount', 50),
  agent_100:     _ach('agent', ['사령관','General'],          ['에이전트 100회 완료','100 agents done'], 800, 'agentCount', 100),
  agent_500:     _ach('agent', ['총사령관','Supreme Commander'],['에이전트 500회 완료','500 agents done'],2000,'agentCount', 500),
  // -- 🔥 연속 활동 --
  streak_3:      _ach('streak', ['시동','Ignition'],         ['3일 연속 활동','3-day streak'],   50,   'streak', 3),
  streak_7:      _ach('streak', ['주간 챔피언','Weekly Champ'],['7일 연속 활동','7-day streak'],   200,  'streak', 7),
  streak_14:     _ach('streak', ['2주 마라톤','2-Week Run'],  ['14일 연속 활동','14-day streak'],  500,  'streak', 14),
  streak_30:     _ach('streak', ['한 달의 기적','Monthly Miracle'],['30일 연속 활동','30-day streak'],1500,'streak', 30),
  streak_60:     _ach('streak', ['철인','Ironman'],           ['60일 연속 활동','60-day streak'],  3000, 'streak', 60),
  streak_100:    _ach('streak', ['전설','Legend'],            ['100일 연속 활동','100-day streak'], 5000,'streak', 100),
  // -- 🕐 시간대 --
  night_owl:     _ach('time', ['올빼미','Night Owl'],       ['새벽 1~5시 활동 10회','10 late-night sessions'],100,'nightCount', 10),
  night_owl_50:  _ach('time', ['야행성','Nocturnal'],       ['새벽 1~5시 활동 50회','50 late-night sessions'],500,'nightCount', 50),
  early_bird:    _ach('time', ['얼리버드','Early Bird'],    ['오전 6~8시 활동 10회','10 early-morning sessions'],100,'earlyCount', 10),
  early_bird_50: _ach('time', ['아침형 인간','Morning Person'],['오전 6~8시 활동 50회','50 early-morning sessions'],500,'earlyCount', 50),
  // -- 🛒 상점 --
  first_buy:     _achInv('shop', ['첫 구매','First Purchase'],     ['상점에서 첫 아이템 구매','Buy your first item'],30,1),
  collector_5:   _achInv('shop', ['초보 수집가','Beginner Collector'],['아이템 5종 보유','Own 5 item types'],100,5),
  collector_10:  _achInv('shop', ['수집가','Collector'],           ['아이템 10종 보유','Own 10 item types'],300,10),
  collector_20:  _achInv('shop', ['컬렉터','Connoisseur'],        ['아이템 20종 보유','Own 20 item types'],800,20),
  collector_30:  _achInv('shop', ['박물관장','Curator'],           ['아이템 30종 보유','Own 30 item types'],1500,30),
  all_unlock:    { cat: 'shop', name: '완전 해금', name_en: 'Full Unlock', desc: '모든 해금 아이템 구매', desc_en: 'Buy all unlock items', reward: 300,
    check: function() { var inv = pointsData.inventory || {}; return !!(inv.unlock_pulse && inv.unlock_nebula && inv.unlock_galaxy && inv.unlock_meteor && inv.unlock_rainbow); },
    progress: function() { var inv = pointsData.inventory || {}; var keys = ['unlock_pulse','unlock_nebula','unlock_galaxy','unlock_meteor','unlock_rainbow']; var c = keys.filter(function(k) { return !!inv[k]; }).length; return { current: c, target: 5 }; } },
  full_celestial:{ cat: 'shop', name: '천문학자', name_en: 'Astronomer', desc: '천체 아이템 전종 보유', desc_en: 'Own all celestial items', reward: 500,
    check: function() { var inv = pointsData.inventory || {}; return !!(inv.celestial_moon && inv.celestial_planet && inv.celestial_pulsar && inv.celestial_binary && inv.celestial_station); },
    progress: function() { var inv = pointsData.inventory || {}; var keys = ['celestial_moon','celestial_planet','celestial_pulsar','celestial_binary','celestial_station']; var c = keys.filter(function(k) { return !!inv[k]; }).length; return { current: c, target: 5 }; } },
  // -- 💰 포인트 --
  lifetime_500:  _ach('points', ['500P','500P'],       ['누적 500P 획득','Earn 500P total'],     50,   'lifetime', 500),
  lifetime_1k:   _ach('points', ['1,000P','1,000P'],   ['누적 1,000P 획득','Earn 1,000P total'],   100,  'lifetime', 1000),
  lifetime_5k:   _ach('points', ['5,000P','5,000P'],   ['누적 5,000P 획득','Earn 5,000P total'],   200,  'lifetime', 5000),
  lifetime_10k:  _ach('points', ['10,000P','10,000P'], ['누적 10,000P 획득','Earn 10,000P total'],  400,  'lifetime', 10000),
  lifetime_30k:  _ach('points', ['30,000P','30,000P'], ['누적 30,000P 획득','Earn 30,000P total'],  800,  'lifetime', 30000),
  lifetime_100k: _ach('points', ['100,000P','100,000P'],['누적 100,000P 획득','Earn 100,000P total'],2000,'lifetime', 100000),
  // -- 💸 소비 --
  spend_1k:  { cat: 'spend', name: '소비자', name_en: 'Consumer', desc: '누적 1,000P 사용', desc_en: 'Spend 1,000P total', reward: 50,
    check: function() { return _totalSpent() >= 1000; }, progress: function() { return { current: Math.min(_totalSpent(), 1000), target: 1000 }; } },
  spend_5k:  { cat: 'spend', name: '큰 손', name_en: 'Big Spender', desc: '누적 5,000P 사용', desc_en: 'Spend 5,000P total', reward: 200,
    check: function() { return _totalSpent() >= 5000; }, progress: function() { return { current: Math.min(_totalSpent(), 5000), target: 5000 }; } },
  spend_20k: { cat: 'spend', name: '고래', name_en: 'Whale', desc: '누적 20,000P 사용', desc_en: 'Spend 20,000P total', reward: 800,
    check: function() { return _totalSpent() >= 20000; }, progress: function() { return { current: Math.min(_totalSpent(), 20000), target: 20000 }; } },
  spend_50k: { cat: 'spend', name: '재벌', name_en: 'Tycoon', desc: '누적 50,000P 사용', desc_en: 'Spend 50,000P total', reward: 2000,
    check: function() { return _totalSpent() >= 50000; }, progress: function() { return { current: Math.min(_totalSpent(), 50000), target: 50000 }; } },
  // -- 🎰 행운 --
  lucky_drop:  _ach('luck', ['행운의 시작','Lucky Start'],  ['보너스 드롭 첫 획득','First bonus drop'],50,'dropCount', 1),
  lucky_3:     _ach('luck', ['행운아','Lucky One'],         ['보너스 드롭 3회','3 bonus drops'],     150,'dropCount', 3),
  lucky_10:    _ach('luck', ['대박','Jackpot'],             ['보너스 드롭 10회','10 bonus drops'],   500,'dropCount', 10),
  // -- ⭐ 마스터 --
  master_galaxy: { cat: 'master', name: '은하계 정복', name_en: 'Galaxy Conqueror', desc: '은하수 4개 + 행성 3개 보유', desc_en: '4 galaxies + 3 planets', reward: 2000,
    check: function() { var inv = pointsData.inventory || {}; return (inv.galaxy_extra || 0) >= 3 && (inv.celestial_planet || 0) >= 3; },
    progress: function() { var inv = pointsData.inventory || {}; var c = Math.min(inv.galaxy_extra || 0, 3) + Math.min(inv.celestial_planet || 0, 3); return { current: c, target: 6 }; } },
  master_legend: { cat: 'master', name: '전설의 시작', name_en: 'Birth of Legend', desc: 'Legendary 아이템 보유', desc_en: 'Own a Legendary item', reward: 1000,
    check: function() { var inv = pointsData.inventory || {}; return !!(inv.legendary_supernova || inv.legendary_cosmicrain || inv.legendary_twinmoon); },
    progress: function() { var inv = pointsData.inventory || {}; var c = (inv.legendary_supernova ? 1 : 0) + (inv.legendary_cosmicrain ? 1 : 0) + (inv.legendary_twinmoon ? 1 : 0); return { current: Math.min(c, 1), target: 1 }; } },
  master_all_leg:{ cat: 'master', name: '신화', name_en: 'Mythology', desc: 'Legendary 전종 보유', desc_en: 'Own all Legendary items', reward: 5000,
    check: function() { var inv = pointsData.inventory || {}; return !!(inv.legendary_supernova && inv.legendary_cosmicrain && inv.legendary_twinmoon); },
    progress: function() { var inv = pointsData.inventory || {}; var c = (inv.legendary_supernova ? 1 : 0) + (inv.legendary_cosmicrain ? 1 : 0) + (inv.legendary_twinmoon ? 1 : 0); return { current: c, target: 3 }; } },
};

// === 레벨 시스템 ===
// 레벨 N 도달에 필요한 누적 lifetime: Lv^2 x 20
// Lv1=0, Lv2=80, Lv5=500, Lv10=2000, Lv20=8000, Lv50=50000, Lv100=200000
function calcLevel(lifetime) {
  var lv = 1;
  while (lv < 100 && lifetime >= (lv + 1) * (lv + 1) * 20) lv++;
  return lv;
}

function levelXpRange(lv) {
  return { current: lv * lv * 20, next: (lv + 1) * (lv + 1) * 20 };
}

// LEVEL_TITLES 단일 진실 공급원: LEVEL_TITLES_I18N
function levelTitle(lv) {
  return levelTitleI18n(lv, 'ko');
}

// 누적 사용 금액 — pointsHistory의 spent 합산 (환불 시에도 정확)
function _totalSpent() {
  var hist = pointsData.pointsHistory || [];
  var sum = 0;
  for (var i = 0; i < hist.length; i++) sum += (hist[i].spent || 0);
  return Math.round(sum);
}

// 성취 체크 — earnPoints/purchase 후 호출. 새 달성 시 보상 지급 + SSE
// 2단계: 먼저 조건 체크 -> 보상은 루프 후 일괄 지급 (연쇄 달성 방지)
function checkAchievements() {
  if (!pointsData.achievements) pointsData.achievements = {};
  var newlyUnlocked = [];
  // 1단계: 조건 체크 (현재 상태 기준, 보상 미반영)
  Object.keys(ACHIEVEMENTS).forEach(function(id) {
    if (pointsData.achievements[id]) return;
    if (ACHIEVEMENTS[id].check()) {
      newlyUnlocked.push({ id: id, name: ACHIEVEMENTS[id].name, reward: ACHIEVEMENTS[id].reward });
    }
  });
  // 2단계: 보상 일괄 지급
  newlyUnlocked.forEach(function(a) {
    pointsData.achievements[a.id] = new Date().toISOString();
    pointsData.total = (pointsData.total || 0) + a.reward;
    pointsData.lifetime = (pointsData.lifetime || 0) + a.reward;
    _recordHistory('earn', a.reward);
  });
  return newlyUnlocked;
}

// 포인트 히스토리 기록 — 일별 earned/spent 누적 (최대 30일 보관)
function _recordHistory(type, amount) {
  if (!pointsData.pointsHistory) pointsData.pointsHistory = [];
  var today = utils._ymd(new Date());
  var last = pointsData.pointsHistory[pointsData.pointsHistory.length - 1];
  if (!last || last.date !== today) {
    last = { date: today, earned: 0, spent: 0 };
    pointsData.pointsHistory.push(last);
  }
  if (type === 'earn') last.earned = (last.earned || 0) + amount;
  else if (type === 'spend') last.spent = (last.spent || 0) + amount;
  // 30일 초과 시 오래된 것 삭제
  while (pointsData.pointsHistory.length > 30) pointsData.pointsHistory.shift();
}

// 점수 획득 — recordStat 옆에서 호출
// SSE 'points_updated' 브로드캐스트로 클라이언트 즉시 갱신
function recordPoints(event) {
  var delta = POINTS_RULES[event] || 0;
  if (delta === 0) return;
  pointsData.total = (pointsData.total || 0) + delta;
  pointsData.lifetime = (pointsData.lifetime || 0) + delta;
  pointsData.lastEarnedAt = new Date().toISOString();

  // 활동 카운터
  if (event === 'thinking_start') pointsData.promptCount = (pointsData.promptCount || 0) + 1;
  if (event === 'tool_use') pointsData.toolCount = (pointsData.toolCount || 0) + 1;
  if (event === 'agent_done') pointsData.agentCount = (pointsData.agentCount || 0) + 1;

  // 시간대 카운터
  var hour = new Date().getHours();
  if (hour >= 1 && hour < 5 && event === 'thinking_start') {
    pointsData.nightCount = (pointsData.nightCount || 0) + 1;
  }
  if (hour >= 6 && hour < 8 && event === 'thinking_start') {
    pointsData.earlyCount = (pointsData.earlyCount || 0) + 1;
  }

  // 데일리 보너스 — 하루 첫 thinking_start에 +15P
  if (event === 'thinking_start') {
    var today = utils._ymd(new Date());
    if (pointsData.lastDailyBonus !== today) {
      pointsData.lastDailyBonus = today;
      var dailyBonus = 15;
      pointsData.total += dailyBonus;
      pointsData.lifetime += dailyBonus;
      delta += dailyBonus;
    }
  }

  // 에이전트 완료 드롭 — 5% 확률 보너스 50~200P
  var dropBonus = 0;
  if (event === 'agent_done' && Math.random() < 0.05) {
    dropBonus = 50 + Math.floor(Math.random() * 151);
    pointsData.total += dropBonus;
    pointsData.lifetime += dropBonus;
    pointsData.dropCount = (pointsData.dropCount || 0) + 1;
    delta += dropBonus;
  }

  // 스트릭 추적 — meta_streak 아이템 보유와 무관하게 항상 카운트 (UI 표시만 buff에 따라)
  updateStreak();

  // 히스토리 기록 — 기본 earn + 드롭 보너스 한번에 기록
  _recordHistory('earn', delta);

  // 성취 체크
  var newAch = checkAchievements();

  // 레벨업 체크
  var prevLv = pointsData._lastLevel || calcLevel((pointsData.lifetime || 0) - delta);
  var newLv = calcLevel(pointsData.lifetime || 0);
  var levelUp = null;
  if (newLv > prevLv) {
    // 레벨업 보상: 매 레벨 Lv x 5P, 10의 배수면 Lv x 10P
    var lvBonus = (newLv % 10 === 0) ? newLv * 10 : newLv * 5;
    pointsData.total += lvBonus;
    pointsData.lifetime += lvBonus;
    _recordHistory('earn', lvBonus);
    levelUp = { level: newLv, title: levelTitle(newLv), bonus: lvBonus, prevTitle: levelTitle(prevLv) };
  }
  pointsData._lastLevel = newLv;

  savePoints();
  var sseData = {
    event: 'points_updated',
    total: pointsData.total,
    lifetime: pointsData.lifetime,
    inventory: pointsData.inventory,
    streak: pointsData.streak || 0,
    delta: delta,
    reason: event,
  };
  if (dropBonus > 0) sseData.drop = dropBonus;
  if (newAch.length > 0) sseData.achievements = newAch;
  if (levelUp) sseData.levelUp = levelUp;
  // 항상 레벨 정보 포함
  sseData.level = newLv;
  sseData.levelTitle = levelTitle(newLv);
  var xpRange = levelXpRange(newLv);
  sseData.levelXp = { current: pointsData.lifetime, min: xpRange.current, max: xpRange.next };
  sse.broadcastEvent(sseData);
}

// 스트릭 갱신 로직
// - 오늘 날짜와 lastStreakDay 비교
// - 같은 날 = 변화 없음
// - 어제 = streak + 1
// - 그보다 이전 = streak 1로 reset (오늘이 새 시작일)
function updateStreak() {
  var today = utils._ymd(new Date());
  var last = pointsData.lastStreakDay;
  if (last === today) return;
  if (!last) {
    pointsData.streak = 1;
  } else {
    var lastD = new Date(last);
    var diffMs = new Date(today) - lastD;
    var diffDays = Math.floor(diffMs / (24 * 3600 * 1000));
    if (diffDays === 1) pointsData.streak = (pointsData.streak || 0) + 1;
    else pointsData.streak = 1;
  }
  pointsData.lastStreakDay = today;
}

// 구매 처리 — 포인트 차감 + 인벤토리 증가
// 반환: { ok, error?, total?, inventory? }
function purchaseItem(itemId) {
  var def = GAME_ITEMS[itemId];
  if (!def) return { ok: false, error: 'invalid item' };
  var currentStack = (pointsData.inventory || {})[itemId] || 0;
  if (currentStack >= def.maxStack) return { ok: false, error: 'max stack reached' };
  if ((pointsData.total || 0) < def.price) {
    return { ok: false, error: 'insufficient points', required: def.price, have: pointsData.total };
  }
  pointsData.total -= def.price;
  if (!pointsData.inventory) pointsData.inventory = {};
  pointsData.inventory[itemId] = currentStack + 1;
  _recordHistory('spend', def.price);
  checkAchievements();
  savePoints();
  sse.broadcastEvent({
    event: 'points_updated',
    total: pointsData.total,
    lifetime: pointsData.lifetime,
    inventory: pointsData.inventory,
    streak: pointsData.streak || 0,
    purchasedItem: itemId,
  });
  return { ok: true, total: pointsData.total, inventory: pointsData.inventory };
}

// 초기화 — mode: 'refund' (아이템 환불, lifetime 유지) | 'full' (완전 초기화)
function resetPoints(mode) {
  if (mode === 'refund') {
    var refundAmount = 0;
    Object.keys(pointsData.inventory || {}).forEach(function(id) {
      // DEPRECATED_ITEMS 포함 — 삭제된 레거시 아이템도 과거 가격으로 정당하게 환불
      refundAmount += itemPrice(id) * (pointsData.inventory[id] || 0);
    });
    pointsData.total = (pointsData.total || 0) + refundAmount;
    pointsData.inventory = {};
    savePoints();
    sse.broadcastEvent({
      event: 'points_updated',
      total: pointsData.total,
      lifetime: pointsData.lifetime,
      streak: pointsData.streak || 0,
      inventory: {},
      refunded: refundAmount,
    });
    return { ok: true, refunded: refundAmount, total: pointsData.total };
  }
  if (mode === 'full') {
    // 완전 초기화 = 신규 사용자 시뮬레이션 -> 환영 보너스 STARTER_BONUS도 함께 지급
    // (loadPoints fallback과 동일한 동작 보장 — lifetime/streak/lastStreakDay 모두 0/null)
    pointsData = {
      version: 1,
      total: STARTER_BONUS,
      lifetime: 0,
      inventory: {},
      streak: 0,
      lastStreakDay: null,
      achievements: {},
      pointsHistory: [],
      nightCount: 0,
      promptCount: 0,
      toolCount: 0,
      agentCount: 0,
      earlyCount: 0,
      dropCount: 0,
      lastDailyBonus: null,
      _lastLevel: 1,
      createdAt: new Date().toISOString(),
    };
    state.pointsData = pointsData;
    savePoints();
    sse.broadcastEvent({
      event: 'points_updated',
      total: STARTER_BONUS,
      lifetime: 0,
      streak: 0,
      inventory: {},
      fullReset: true,
    });
    return { ok: true, total: STARTER_BONUS };
  }
  return { ok: false, error: 'invalid mode' };
}

// 모듈 초기화 — 로드 + state 등록
// pointsData는 이 모듈만 직접 mutate. state.pointsData는 외부 읽기 전용 참조용.
// resetPoints(full)에서 전체 교체 시 pointsData + state.pointsData 양쪽 갱신 필수.
var pointsData = loadPoints();
state.pointsData = pointsData;

module.exports = {
  loadPoints: loadPoints,
  savePoints: savePoints,
  flushPoints: flushPoints,
  recordPoints: recordPoints,
  purchaseItem: purchaseItem,
  resetPoints: resetPoints,
  checkAchievements: checkAchievements,
  ACHIEVEMENTS: ACHIEVEMENTS,
  ACH_CATEGORIES: ACH_CATEGORIES,
  LEVEL_TITLES_I18N: LEVEL_TITLES_I18N,
  calcLevel: calcLevel,
  levelXpRange: levelXpRange,
  levelTitle: levelTitle,
  levelTitleI18n: levelTitleI18n,
  STARTER_BONUS: STARTER_BONUS,
  POINTS_FILE: POINTS_FILE,
  GAME_ITEMS: GAME_ITEMS,
  POINTS_RULES: POINTS_RULES,
  computeBuffs: computeBuffs,
  itemPrice: itemPrice,
};
