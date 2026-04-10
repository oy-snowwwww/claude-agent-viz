// 게임화 상점 모달 — 아이템 그리드 + 구매 + 환불/완전 초기화
// 로드 순서: points.js 이후, main 이전
// 의존: constants.js(ITEMS), state.js(API), points.js(pointsData), utils.js(esc)
//       server-control.js(toast)
//
// 동작:
// - openShop() / closeShop() — 모달 DOM은 최초 1회만 생성 (lazy)
// - 카테고리 탭 전환 → 해당 카테고리 아이템 그리드 렌더
// - 구매: POST /api/points/purchase → SSE 'points_updated'로 자동 반영
// - Epic/Legendary는 2단계 확인 구매 (실수 방지)
// - 하단 환불/완전 초기화 2버튼 (2단계 확인)

// 카테고리 메타 — 탭 순서/라벨
var SHOP_CATEGORIES = [
  { id: 'unlock',    label: '🔓 해금' },
  { id: 'stars',     label: '⭐ 별' },
  { id: 'pulse',     label: '💫 큰별' },
  { id: 'blue',      label: '🔵 푸른별' },
  { id: 'orange',    label: '🟠 주황별' },
  { id: 'rainbow',   label: '💎 무지개' },
  { id: 'galaxy',    label: '🌌 은하수' },
  { id: 'nebula',    label: '☁️ 성운' },
  { id: 'meteor',    label: '🌠 유성' },
  { id: 'celestial', label: '🌙 천체' },
  { id: 'character', label: '👤 캐릭터' },
  { id: 'event',     label: '🎆 이벤트' },
  { id: 'meta',      label: '📈 메타' },
  { id: 'legendary', label: '👑 Legendary' },
];

// 카테고리 해금 조건 — 미해금 시 아이템 전체 "잠금" 표시
var CATEGORY_UNLOCK_ITEM = {
  pulse:   'unlock_pulse',
  nebula:  'unlock_nebula',
  galaxy:  'unlock_galaxy',
  meteor:  'unlock_meteor',
  rainbow: 'unlock_rainbow',
};

var _shopModalBuilt = false;
var _shopCurrentCategory = 'unlock';
var _shopConfirmTimers = {};  // itemId → setTimeout (2단계 확인용)
var _shopResetConfirm = { refund: null };  // 환불 2단계 확인

// 모달 DOM 최초 생성 (lazy)
function ensureShopModal() {
  if (_shopModalBuilt) return;
  _shopModalBuilt = true;

  var overlay = document.createElement('div');
  overlay.className = 'shop-overlay';
  overlay.id = 'shopOverlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeShop(); };

  overlay.innerHTML =
    '<div class="shop-modal">' +
      '<div class="shop-header">' +
        '<h2>🛒 ' + t('shop_title') + '</h2>' +
        '<div class="shop-wallet" id="shopWallet"></div>' +
        '<button class="shop-close" onclick="closeShop()">&times;</button>' +
      '</div>' +
      '<div class="shop-tabs" id="shopTabs"></div>' +
      '<div class="shop-grid" id="shopGrid"></div>' +
      '<div class="shop-footer">' +
        '<button class="shop-refund-btn" onclick="refundShop()" data-tip="구매한 아이템을 포인트로 환불 (누적 획득은 유지)">🔄 ' + t('shop_refund') + '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // 탭 버튼 렌더
  var tabsEl = overlay.querySelector('#shopTabs');
  SHOP_CATEGORIES.forEach(function(cat) {
    var btn = document.createElement('button');
    btn.className = 'shop-tab' + (cat.id === _shopCurrentCategory ? ' active' : '');
    btn.textContent = cat.label;
    btn.dataset.cat = cat.id;
    (function(catId) {
      btn.onclick = function() { switchShopTab(catId); };
    })(cat.id);
    tabsEl.appendChild(btn);
  });
}

function openShop() {
  ensureShopModal();
  var overlay = document.getElementById('shopOverlay');
  if (!overlay) return;
  overlay.classList.add('show');
  // 프리뷰 모드면 경고 배너 먼저 표시
  updateShopWallet();
  renderShopGrid(_shopCurrentCategory);
}

function closeShop() {
  var overlay = document.getElementById('shopOverlay');
  if (overlay) overlay.classList.remove('show');
  // 진행 중 2단계 확인 모두 취소
  Object.keys(_shopConfirmTimers).forEach(function(k) {
    if (_shopConfirmTimers[k]) clearTimeout(_shopConfirmTimers[k]);
  });
  _shopConfirmTimers = {};
  _shopResetConfirm = { refund: null };
}

function switchShopTab(category) {
  _shopCurrentCategory = category;
  document.querySelectorAll('.shop-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.cat === category);
  });
  renderShopGrid(category);
}

// 지갑 영역 갱신 (현재 포인트 + 누적)
function updateShopWallet() {
  var el = document.getElementById('shopWallet');
  if (!el) return;
  if (window.gamePreviewMode) {
    el.innerHTML = '<span class="shop-preview-warning">⚠ ' + t('shop_wallet_preview') + ' (' + esc(window.gamePreviewMode) + ')</span>';
    return;
  }
  var total = pointsData.total || 0;
  var lifetime = pointsData.lifetime || 0;
  el.innerHTML = '💰 <strong>' + total + '</strong> P <span class="shop-lifetime">' + t('shop_lifetime') + ' ' + lifetime + ' P</span>';
}

// 카테고리가 해금되었는지 체크
function isShopCategoryUnlocked(category) {
  var unlockId = CATEGORY_UNLOCK_ITEM[category];
  if (!unlockId) return true;  // unlock/stars/blue/orange/event/legendary는 조건 없음
  return ((pointsData.inventory || {})[unlockId] || 0) > 0;
}

// 그리드 렌더 — 해당 카테고리 아이템들
function renderShopGrid(category) {
  var gridEl = document.getElementById('shopGrid');
  if (!gridEl) return;
  gridEl.innerHTML = '';

  var items = Object.keys(ITEMS).filter(function(id) {
    return ITEMS[id].category === category;
  });

  var categoryLocked = !isShopCategoryUnlocked(category);
  var unlockItemId = CATEGORY_UNLOCK_ITEM[category];
  var unlockItemName = unlockItemId && ITEMS[unlockItemId] ? ITEMS[unlockItemId].name : '';

  // 카테고리 잠금 상태 배너
  if (categoryLocked) {
    var banner = document.createElement('div');
    banner.className = 'shop-category-locked';
    banner.innerHTML = '🔒 ' + t('shop_locked') + ' <strong>' + esc(unlockItemName) + '</strong>' + t('shop_locked_suffix') + ' (🔓 ' + t('shop_locked_tab') + ')';
    gridEl.appendChild(banner);
  }

  if (items.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = t('shop_empty');
    gridEl.appendChild(empty);
    return;
  }

  items.forEach(function(id) {
    var def = ITEMS[id];
    var currentStack = (pointsData.inventory || {})[id] || 0;
    var maxedOut = currentStack >= def.maxStack;
    var insufficientPoints = (pointsData.total || 0) < def.price;
    var disabled = categoryLocked || maxedOut || insufficientPoints || !!window.gamePreviewMode;

    var card = document.createElement('div');
    card.className = 'shop-item rarity-' + def.rarity + (maxedOut ? ' maxed' : '') + (categoryLocked ? ' locked' : '');

    // 헤더: 이름 + 희귀도
    var header = document.createElement('div');
    header.className = 'shop-item-header';
    header.innerHTML =
      '<span class="shop-item-name">' + esc(def.name) + '</span>' +
      '<span class="shop-item-rarity ' + def.rarity + '">' + def.rarity + '</span>';
    card.appendChild(header);

    // 설명
    var desc = document.createElement('div');
    desc.className = 'shop-item-desc';
    desc.textContent = def.desc;
    card.appendChild(desc);

    // 스택 (1회 아이템은 "1/1" 대신 "보유 중"/"미보유" 표시)
    var stackEl = document.createElement('div');
    stackEl.className = 'shop-item-stack';
    if (def.maxStack === 1) {
      stackEl.textContent = currentStack > 0 ? '✓ ' + t('shop_owned') : t('shop_not_owned');
    } else {
      stackEl.textContent = currentStack + ' / ' + def.maxStack;
    }
    card.appendChild(stackEl);

    // 구매 버튼
    var buyBtn = document.createElement('button');
    buyBtn.className = 'shop-buy-btn';
    if (maxedOut) {
      buyBtn.textContent = def.maxStack === 1 ? '✓' : t('shop_max');
      buyBtn.disabled = true;
    } else if (insufficientPoints && !categoryLocked) {
      buyBtn.textContent = def.price + ' P';
      buyBtn.classList.add('insufficient');
      buyBtn.disabled = true;
    } else if (categoryLocked) {
      buyBtn.textContent = '🔒';
      buyBtn.disabled = true;
    } else {
      buyBtn.textContent = def.price + ' P';
      (function(itemId, needConfirm) {
        buyBtn.onclick = function(e) {
          e.stopPropagation();
          buyItem(itemId, needConfirm);
        };
      })(id, def.rarity === 'epic' || def.rarity === 'legendary');
    }
    if (window.gamePreviewMode) buyBtn.disabled = true;
    card.appendChild(buyBtn);

    gridEl.appendChild(card);
  });
}

// 아이템 구매 — Epic/Legendary는 2단계 확인
function buyItem(itemId, needConfirm) {
  if (window.gamePreviewMode) { toast(t('shop_wallet_preview'), 'err'); return; }
  var def = ITEMS[itemId];
  if (!def) return;

  // Epic/Legendary → 2단계 확인
  if (needConfirm && !_shopConfirmTimers[itemId]) {
    // 1차 클릭 — 버튼 색상 변경, 3초 후 원복
    var btns = document.querySelectorAll('.shop-item .shop-buy-btn');
    btns.forEach(function(b) {
      if (b.textContent === def.price + ' P' && b.parentElement.querySelector('.shop-item-name').textContent === def.name) {
        b.classList.add('confirming');
        b.textContent = t('shop_confirm');
      }
    });
    _shopConfirmTimers[itemId] = setTimeout(function() {
      delete _shopConfirmTimers[itemId];
      renderShopGrid(_shopCurrentCategory);  // 원복
    }, 3000);
    return;
  }

  // 2차 클릭 — 확인 타이머 취소 후 실제 구매
  if (_shopConfirmTimers[itemId]) {
    clearTimeout(_shopConfirmTimers[itemId]);
    delete _shopConfirmTimers[itemId];
  }

  fetch(API + '/api/points/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: itemId }),
  }).then(function(r) { return r.json() }).then(function(res) {
    if (res.ok) {
      toast(def.name + ' ' + t('shop_buy_ok'));
      // SSE 'points_updated'가 자동으로 pointsData 갱신 + renderPointsBadge 호출
      // 상점 그리드도 재렌더 (즉시 반영)
      renderShopGrid(_shopCurrentCategory);
      updateShopWallet();
    } else {
      var msg = res.error || t('shop_buy_fail');
      if (res.required) msg += ' (필요 ' + res.required + 'P, 보유 ' + Math.floor(res.have || 0) + 'P)';
      toast(msg, 'err');
    }
  }).catch(function() { toast(t('shop_connect_fail'), 'err') });
}

// 환불 초기화 — 아이템 → 포인트 복원, lifetime 유지
function refundShop() {
  if (window.gamePreviewMode) { toast(t('shop_wallet_preview'), 'err'); return; }
  var inventoryCount = Object.keys(pointsData.inventory || {}).length;
  if (inventoryCount === 0) { toast(t('shop_no_items'), 'err'); return; }

  var btn = document.querySelector('.shop-refund-btn');
  if (!btn) return;
  if (_shopResetConfirm.refund) {
    // 2차 클릭 — 실행
    clearTimeout(_shopResetConfirm.refund);
    _shopResetConfirm.refund = null;
    btn.classList.remove('confirming');
    btn.innerHTML = '🔄 ' + t('shop_refund');
    fetch(API + '/api/points/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'refund' }),
    }).then(function(r) { return r.json() }).then(function(res) {
      if (res.ok) {
        toast('🔄 ' + inventoryCount + '종 ' + t('shop_refund_ok') + ' +' + res.refunded + ' ' + t('shop_refund_restore'));
        renderShopGrid(_shopCurrentCategory);
        updateShopWallet();
      } else {
        toast(res.error || t('shop_buy_fail'), 'err');
      }
    }).catch(function() { toast(t('shop_connect_fail'), 'err') });
    return;
  }
  // 1차 클릭
  btn.classList.add('confirming');
  btn.innerHTML = '⚠ ' + t('shop_refund_confirm');
  _shopResetConfirm.refund = setTimeout(function() {
    _shopResetConfirm.refund = null;
    btn.classList.remove('confirming');
    btn.innerHTML = '🔄 ' + t('shop_refund');
  }, 3000);
}

// SSE 'points_updated' 이벤트 수신 시 자동 갱신 (points.js에서 호출)
// 상점 열려있으면 그리드/지갑 재렌더
function onPointsChangedForShop() {
  var overlay = document.getElementById('shopOverlay');
  if (!overlay || !overlay.classList.contains('show')) return;
  renderShopGrid(_shopCurrentCategory);
  updateShopWallet();
}
