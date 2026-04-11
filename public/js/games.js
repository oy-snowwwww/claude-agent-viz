// 미니게임 모달 — Snake, 2048, Flappy Bird
// 로드 순서: shop.js 이후, main.js 이전

var _gamesModalBuilt = false;
var _currentGame = null;

// 게임 키보드 통합 핸들러
document.addEventListener('keydown', function(e) {
  if (!_currentGame) return;
  if (_currentGame === 'snake') _snakeKey(e);
  else if (_currentGame === '2048') _2048Key(e);
  else if (_currentGame === 'flappy') _flappyKey(e);
});

// === 게임 모달 ===
function openGames() {
  if (!_gamesModalBuilt) {
    _gamesModalBuilt = true;
    var ov = document.createElement('div');
    ov.className = 'games-overlay'; ov.id = 'gamesOverlay';
    ov.onclick = function(e) { if (e.target === ov) closeGames(); };
    ov.innerHTML =
      '<div class="games-modal">' +
        '<div class="games-header">' +
          '<h2 id="gamesTitle">' + t('game_title') + '</h2>' +
          '<button class="games-close" onclick="closeGames()">&times;</button>' +
        '</div>' +
        '<div class="games-body" id="gamesBody"></div>' +
      '</div>';
    document.body.appendChild(ov);
  }
  document.getElementById('gamesOverlay').classList.add('show');
  if (!_currentGame) _showGameMenu();
}

function closeGames() {
  // 진행 중 게임 저장
  if (_currentGame === 'snake') _snakeSave();
  if (_currentGame === '2048') _2048Save();
  _stopCurrentGame();
  document.getElementById('gamesOverlay').classList.remove('show');
}

function _stopCurrentGame() {
  if (_snakeTimer) { clearInterval(_snakeTimer); _snakeTimer = null; }
  if (_flappyRaf) { cancelAnimationFrame(_flappyRaf); _flappyRaf = null; }
  _currentGame = null;
}

function _showGameMenu() {
  _stopCurrentGame();
  document.getElementById('gamesTitle').textContent = t('game_title');
  var body = document.getElementById('gamesBody');
  var snakeSaved = localStorage.getItem('game_snake') ? ' (' + t('game_continue') + ')' : '';
  var g2048Saved = localStorage.getItem('game_2048') ? ' (' + t('game_continue') + ')' : '';
  var snakeHi = localStorage.getItem('snake_high') || 0;
  var g2048Hi = localStorage.getItem('2048_high') || 0;
  var flappyHi = localStorage.getItem('flappy_high') || 0;
  body.innerHTML =
    '<div class="game-cards">' +
      '<div class="game-card" onclick="_startSnake()"><div class="game-icon">🐍</div><div class="game-name">Snake' + snakeSaved + '</div><div class="game-hi">' + t('game_best') + ': ' + snakeHi + '</div><div class="game-key">← ↑ ↓ →</div><div class="game-rule">' + t('game_snake_rule') + '</div></div>' +
      '<div class="game-card" onclick="_start2048()"><div class="game-icon">🔢</div><div class="game-name">2048' + g2048Saved + '</div><div class="game-hi">' + t('game_best') + ': ' + g2048Hi + '</div><div class="game-key">← ↑ ↓ →</div><div class="game-rule">' + t('game_2048_rule') + '</div></div>' +
      '<div class="game-card" onclick="_startFlappy()"><div class="game-icon">🐦</div><div class="game-name">Flappy Bird</div><div class="game-hi">' + t('game_best') + ': ' + flappyHi + '</div><div class="game-key">Space / Click</div><div class="game-rule">' + t('game_flappy_rule') + '</div></div>' +
    '</div>';
}
