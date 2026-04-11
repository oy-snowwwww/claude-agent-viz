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
          '<h2 id="gamesTitle">🎮 미니게임</h2>' +
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
  document.getElementById('gamesTitle').textContent = '🎮 미니게임';
  var body = document.getElementById('gamesBody');
  var snakeSaved = localStorage.getItem('game_snake') ? ' (이어하기)' : '';
  var g2048Saved = localStorage.getItem('game_2048') ? ' (이어하기)' : '';
  var snakeHi = localStorage.getItem('snake_high') || 0;
  var g2048Hi = localStorage.getItem('2048_high') || 0;
  var flappyHi = localStorage.getItem('flappy_high') || 0;
  body.innerHTML =
    '<div class="game-cards">' +
      '<div class="game-card" onclick="_startSnake()"><div class="game-icon">🐍</div><div class="game-name">Snake' + snakeSaved + '</div><div class="game-hi">최고: ' + snakeHi + '</div><div class="game-key">← ↑ ↓ →</div><div class="game-rule">먹이를 먹고 길어져라! 벽과 몸에 부딪히면 끝</div></div>' +
      '<div class="game-card" onclick="_start2048()"><div class="game-icon">🔢</div><div class="game-name">2048' + g2048Saved + '</div><div class="game-hi">최고: ' + g2048Hi + '</div><div class="game-key">← ↑ ↓ →</div><div class="game-rule">같은 숫자를 밀어서 합쳐라! 2048 만들면 승리</div></div>' +
      '<div class="game-card" onclick="_startFlappy()"><div class="game-icon">🐦</div><div class="game-name">Flappy Bird</div><div class="game-hi">최고: ' + flappyHi + '</div><div class="game-key">Space / Click</div><div class="game-rule">장애물 사이를 통과하라! 바닥에 떨어지면 끝</div></div>' +
    '</div>';
}

// ============================================================
// SNAKE
// ============================================================
var _snakeTimer = null;
var _snakeState = null;

function _startSnake() {
  _currentGame = 'snake';
  document.getElementById('gamesTitle').innerHTML = '🐍 Snake <button class="games-back" onclick="_showGameMenu()">← 목록</button>';
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
  var d = s.dir;
  var changed = false;
  if (e.key === 'ArrowUp' && d.y !== 1) { s.nextDir = {x:0,y:-1}; changed = true; }
  else if (e.key === 'ArrowDown' && d.y !== -1) { s.nextDir = {x:0,y:1}; changed = true; }
  else if (e.key === 'ArrowLeft' && d.x !== 1) { s.nextDir = {x:-1,y:0}; changed = true; }
  else if (e.key === 'ArrowRight' && d.x !== -1) { s.nextDir = {x:1,y:0}; changed = true; }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key) >= 0) e.preventDefault();
  // 키 입력 즉시 이동 (틱 대기 없이)
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
  var html = '<div class="game-score">점수: ' + s.score + ' | 최고: ' + (localStorage.getItem('snake_high') || 0) + '</div>';
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
  if (s.dead) html += '<div class="game-over">Game Over!<br><button class="game-btn" onclick="localStorage.removeItem(\'game_snake\');_snakeState=null;_startSnake()">다시하기</button></div>';
  if (!s.dead) html += '<div class="game-actions"><button class="game-btn-sm" onclick="localStorage.removeItem(\'game_snake\');_snakeState=null;_startSnake()">새로하기</button></div>';
  html += '<div class="game-hint">방향키로 조작</div>';
  body.innerHTML = html;
}

// ============================================================
// 2048
// ============================================================
var _2048State = null;

function _start2048() {
  _currentGame = '2048';
  document.getElementById('gamesTitle').innerHTML = '🔢 2048 <button class="games-back" onclick="_showGameMenu()">← 목록</button>';
  var saved = localStorage.getItem('game_2048');
  if (saved) {
    try { _2048State = JSON.parse(saved); } catch(e) { _2048State = null; }
  }
  if (!_2048State || _2048State.dead) { _2048State = null; _2048Reset(); }
  _2048Render();
}

function _2048Reset() {
  _2048State = { grid: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], score: 0, dead: false, won: false };
  _2048AddTile(); _2048AddTile();
}

function _2048AddTile() {
  var s = _2048State;
  var empty = [];
  for (var r=0;r<4;r++) for (var c=0;c<4;c++) if (s.grid[r][c]===0) empty.push({r:r,c:c});
  if (empty.length === 0) return;
  var pos = empty[Math.floor(Math.random()*empty.length)];
  s.grid[pos.r][pos.c] = Math.random() < 0.9 ? 2 : 4;
}

function _2048Key(e) {
  if (_currentGame !== '2048') return;
  var dirs = {ArrowUp:0,ArrowDown:1,ArrowLeft:2,ArrowRight:3};
  if (dirs[e.key] === undefined) return;
  e.preventDefault();
  if (_2048State.dead) return;
  var moved = _2048Move(dirs[e.key]);
  if (moved) {
    _2048AddTile();
    if (_2048CheckDead()) _2048State.dead = true;
    _2048Render();
    _2048Save();
  }
}

function _2048Move(dir) {
  var s = _2048State;
  var moved = false;
  // 0=up,1=down,2=left,3=right
  for (var i=0;i<4;i++) {
    var line = [];
    for (var j=0;j<4;j++) {
      var r = dir===0?j:dir===1?3-j:i;
      var c = dir===2?j:dir===3?3-j:i;
      line.push({r:r,c:c,v:s.grid[r][c]});
    }
    var vals = line.filter(function(x){return x.v>0}).map(function(x){return x.v});
    var merged = [];
    for (var k=0;k<vals.length;k++) {
      if (k+1<vals.length && vals[k]===vals[k+1]) {
        merged.push(vals[k]*2);
        s.score += vals[k]*2;
        if (vals[k]*2 === 2048) s.won = true;
        k++;
      } else merged.push(vals[k]);
    }
    while (merged.length<4) merged.push(0);
    for (var j2=0;j2<4;j2++) {
      if (s.grid[line[j2].r][line[j2].c] !== merged[j2]) moved = true;
      s.grid[line[j2].r][line[j2].c] = merged[j2];
    }
  }
  return moved;
}

function _2048CheckDead() {
  var s = _2048State;
  for (var r=0;r<4;r++) for (var c=0;c<4;c++) {
    if (s.grid[r][c]===0) return false;
    if (c<3 && s.grid[r][c]===s.grid[r][c+1]) return false;
    if (r<3 && s.grid[r][c]===s.grid[r+1][c]) return false;
  }
  return true;
}

function _2048Save() {
  if (_2048State && !_2048State.dead) localStorage.setItem('game_2048', JSON.stringify(_2048State));
  var hi = parseInt(localStorage.getItem('2048_high') || '0');
  if (_2048State.score > hi) localStorage.setItem('2048_high', _2048State.score);
}

function _2048Render() {
  var s = _2048State; if (!s) return;
  var body = document.getElementById('gamesBody');
  var colors = {0:'',2:'#776e65',4:'#776e65',8:'#f9f6f2',16:'#f9f6f2',32:'#f9f6f2',64:'#f9f6f2',128:'#f9f6f2',256:'#f9f6f2',512:'#f9f6f2',1024:'#f9f6f2',2048:'#f9f6f2'};
  var bgs = {0:'rgba(255,255,255,.05)',2:'#eee4da',4:'#ede0c8',8:'#f2b179',16:'#f59563',32:'#f67c5f',64:'#f65e3b',128:'#edcf72',256:'#edcc61',512:'#edc850',1024:'#edc53f',2048:'#edc22e'};
  var html = '<div class="game-score">점수: ' + s.score + ' | 최고: ' + (localStorage.getItem('2048_high') || 0) + '</div>';
  html += '<div class="g2048-grid">';
  for (var r=0;r<4;r++) for (var c=0;c<4;c++) {
    var v = s.grid[r][c];
    var bg = bgs[v] || '#3c3a32';
    var fg = colors[v] || '#f9f6f2';
    var fs = v >= 1024 ? '.7rem' : v >= 128 ? '.8rem' : '.9rem';
    html += '<div class="g2048-cell" style="background:'+bg+';color:'+fg+';font-size:'+fs+'">'+(v||'')+'</div>';
  }
  html += '</div>';
  if (s.won && !s.dead) html += '<div class="game-win">🎉 2048 달성! 계속 플레이 가능</div>';
  if (s.dead) {
    localStorage.removeItem('game_2048');
    html += '<div class="game-over">Game Over!<br><button class="game-btn" onclick="_2048State=null;_start2048()">다시하기</button></div>';
  }
  html += '<div class="game-actions"><button class="game-btn-sm" onclick="localStorage.removeItem(\'game_2048\');_2048State=null;_start2048()">새로하기</button></div>';
  html += '<div class="game-hint">방향키로 조작</div>';
  body.innerHTML = html;
}

// ============================================================
// FLAPPY BIRD
// ============================================================
var _flappyRaf = null;
var _flappyState = null;

function _startFlappy() {
  _currentGame = 'flappy';
  document.getElementById('gamesTitle').innerHTML = '🐦 Flappy Bird <button class="games-back" onclick="_showGameMenu()">← 목록</button>';
  _flappyReset();
  _flappyRender();
}

function _flappyReset() {
  _flappyState = {
    bird: { y: 150, vy: 0 },
    pipes: [],
    frame: 0,
    score: 0,
    dead: false,
    started: false,
    w: 300, h: 400,
    pipeGap: 100,
    pipeWidth: 40,
    gravity: 0.4,
    jump: -6,
    pipeSpeed: 2,
  };
}

function _flappyKey(e) {
  if (_currentGame !== 'flappy') return;
  if (e.key === ' ' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (_flappyState.dead) return;
    if (!_flappyState.started) {
      _flappyState.started = true;
      _flappyLoop();
    }
    _flappyState.bird.vy = _flappyState.jump;
  }
}

function _flappyClick() {
  if (_currentGame !== 'flappy') return;
  if (_flappyState.dead) return;
  if (!_flappyState.started) {
    _flappyState.started = true;
    _flappyLoop();
  }
  _flappyState.bird.vy = _flappyState.jump;
}

function _flappyLoop() {
  if (_currentGame !== 'flappy' || _flappyState.dead) return;
  var s = _flappyState;
  s.frame++;
  // 새 움직임
  s.bird.vy += s.gravity;
  s.bird.y += s.bird.vy;
  // 바닥/천장
  if (s.bird.y < 0) s.bird.y = 0;
  if (s.bird.y > s.h - 20) { s.dead = true; _flappyDie(); return; }
  // 파이프 생성
  if (s.frame % 90 === 0) {
    var gapY = 60 + Math.random() * (s.h - 160);
    s.pipes.push({ x: s.w, gapY: gapY, scored: false });
  }
  // 파이프 이동 + 충돌
  var birdL = 30, birdR = 50, birdT = s.bird.y, birdB = s.bird.y + 20;
  for (var i = s.pipes.length - 1; i >= 0; i--) {
    s.pipes[i].x -= s.pipeSpeed;
    if (s.pipes[i].x < -s.pipeWidth) { s.pipes.splice(i, 1); continue; }
    var p = s.pipes[i];
    // 점수
    if (!p.scored && p.x + s.pipeWidth < birdL) { s.score++; p.scored = true; }
    // 충돌
    if (birdR > p.x && birdL < p.x + s.pipeWidth) {
      if (birdT < p.gapY || birdB > p.gapY + s.pipeGap) { s.dead = true; _flappyDie(); return; }
    }
  }
  _flappyRender();
  _flappyRaf = requestAnimationFrame(_flappyLoop);
}

function _flappyDie() {
  if (_flappyRaf) { cancelAnimationFrame(_flappyRaf); _flappyRaf = null; }
  var hi = parseInt(localStorage.getItem('flappy_high') || '0');
  if (_flappyState.score > hi) localStorage.setItem('flappy_high', _flappyState.score);
  _flappyRender();
}

function _flappyRender() {
  var s = _flappyState; if (!s) return;
  var body = document.getElementById('gamesBody');
  var html = '<div class="game-score">점수: ' + s.score + ' | 최고: ' + (localStorage.getItem('flappy_high') || 0) + '</div>';
  html += '<div class="flappy-area" onclick="_flappyClick()" style="width:'+s.w+'px;height:'+s.h+'px">';
  // 새
  html += '<div class="flappy-bird" style="top:'+Math.round(s.bird.y)+'px">🐦</div>';
  // 파이프
  s.pipes.forEach(function(p) {
    html += '<div class="flappy-pipe-top" style="left:'+Math.round(p.x)+'px;height:'+Math.round(p.gapY)+'px;width:'+s.pipeWidth+'px"></div>';
    html += '<div class="flappy-pipe-bot" style="left:'+Math.round(p.x)+'px;top:'+Math.round(p.gapY+s.pipeGap)+'px;width:'+s.pipeWidth+'px;height:'+Math.round(s.h-p.gapY-s.pipeGap)+'px"></div>';
  });
  html += '</div>';
  if (!s.started) html += '<div class="game-hint">스페이스바 또는 클릭으로 시작</div>';
  if (s.dead) html += '<div class="game-over">Game Over!<br><button class="game-btn" onclick="_flappyReset();_flappyRender()">다시하기</button></div>';
  body.innerHTML = html;
}
