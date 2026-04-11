// ============================================================
// SNAKE
// ============================================================
var _snakeTimer = null;
var _snakeState = null;

function _startSnake() {
  _currentGame = 'snake';
  document.getElementById('gamesTitle').innerHTML = '🐍 Snake <button class="games-back" onclick="_showGameMenu()">' + t('game_back') + '</button>';
  var saved = localStorage.getItem('game_snake');
  if (saved) {
    try { _snakeState = JSON.parse(saved); } catch(e) { _snakeState = null; }
  }
  if (!_snakeState || _snakeState.dead) { _snakeState = null; _snakeReset(); }
  _snakeRender();
  _snakeTimer = setInterval(_snakeTick, _snakeState.speed);
}

function _snakeReset() {
  _snakeState = {
    w: 20, h: 20,
    snake: [{x:10,y:10},{x:9,y:10},{x:8,y:10}],
    dir: {x:1,y:0},
    nextDir: {x:1,y:0},
    food: null,
    score: 0,
    speed: 130,
    dead: false,
  };
  _snakePlaceFood();
}

function _snakePlaceFood() {
  var s = _snakeState;
  var occupied = {};
  s.snake.forEach(function(p) { occupied[p.x+','+p.y] = true; });
  var empty = [];
  for (var x=0;x<s.w;x++) for (var y=0;y<s.h;y++) if (!occupied[x+','+y]) empty.push({x:x,y:y});
  if (empty.length === 0) return;
  s.food = empty[Math.floor(Math.random() * empty.length)];
}

function _snakeKey(e) {
  if (_currentGame !== 'snake') return;
  var s = _snakeState; if (!s) return;
  // 죽었으면 스페이스/엔터로 다시하기
  if (s.dead && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); localStorage.removeItem('game_snake'); _snakeState = null; _startSnake(); return; }
  var d = s.dir;
  var k = e.key;
  var changed = false;
  if (k === 'ArrowUp' && d.y !== 1) { s.nextDir = {x:0,y:-1}; changed = true; }
  else if (k === 'ArrowDown' && d.y !== -1) { s.nextDir = {x:0,y:1}; changed = true; }
  else if (k === 'ArrowLeft' && d.x !== 1) { s.nextDir = {x:-1,y:0}; changed = true; }
  else if (k === 'ArrowRight' && d.x !== -1) { s.nextDir = {x:1,y:0}; changed = true; }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(k) >= 0) e.preventDefault();
  if (changed && _snakeTimer) { clearInterval(_snakeTimer); _snakeTick(); _snakeTimer = setInterval(_snakeTick, s.speed); }
}

function _snakeTick() {
  var s = _snakeState; if (!s || s.dead) return;
  s.dir = s.nextDir;
  var head = {x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y};
  // 벽 충돌
  if (head.x < 0 || head.x >= s.w || head.y < 0 || head.y >= s.h) { s.dead = true; _snakeDie(); return; }
  // 자기 몸 충돌
  for (var i=0; i<s.snake.length; i++) { if (s.snake[i].x === head.x && s.snake[i].y === head.y) { s.dead = true; _snakeDie(); return; } }
  s.snake.unshift(head);
  // 먹이
  if (s.food && head.x === s.food.x && head.y === s.food.y) {
    s.score += 10;
    _snakePlaceFood();
    // 10개마다 속도 증가
    if (s.score % 100 === 0 && s.speed > 80) {
      s.speed = Math.max(60, s.speed - 15);
      clearInterval(_snakeTimer);
      _snakeTimer = setInterval(_snakeTick, s.speed);
    }
  } else {
    s.snake.pop();
  }
  _snakeRender();
}

function _snakeDie() {
  clearInterval(_snakeTimer); _snakeTimer = null;
  localStorage.removeItem('game_snake');
  var hi = parseInt(localStorage.getItem('snake_high') || '0');
  if (_snakeState.score > hi) localStorage.setItem('snake_high', _snakeState.score);
  _snakeRender();
}

function _snakeSave() {
  if (_snakeState && !_snakeState.dead) localStorage.setItem('game_snake', JSON.stringify(_snakeState));
}

function _snakeRender() {
  var s = _snakeState; if (!s) return;
  var body = document.getElementById('gamesBody');
  var html = '<div class="game-score">' + t('game_score') + ': ' + s.score + ' | ' + t('game_best') + ': ' + (localStorage.getItem('snake_high') || 0) + '</div>';
  html += '<div class="snake-grid">';
  for (var y=0;y<s.h;y++) {
    for (var x=0;x<s.w;x++) {
      var cls = 'snake-cell';
      if (s.snake[0].x === x && s.snake[0].y === y) cls += ' snake-head';
      else if (s.snake.some(function(p){return p.x===x&&p.y===y})) cls += ' snake-body';
      else if (s.food && s.food.x === x && s.food.y === y) cls += ' snake-food';
      html += '<div class="'+cls+'"></div>';
    }
  }
  html += '</div>';
  if (s.dead) html += '<div class="game-over">' + t('game_over') + '<br><span class=\"game-hint\">' + t('game_restart_hint') + '</span><br><button class="game-btn" onclick="localStorage.removeItem(\'game_snake\');_snakeState=null;_startSnake()">' + t('game_retry') + '</button></div>';
  if (!s.dead) html += '<div class="game-actions"><button class="game-btn-sm" onclick="localStorage.removeItem(\'game_snake\');_snakeState=null;_startSnake()">' + t('game_new') + '</button></div>';
  html += '<div class="game-hint">' + t('game_hint_arrow') + '</div>';
  body.innerHTML = html;
}
