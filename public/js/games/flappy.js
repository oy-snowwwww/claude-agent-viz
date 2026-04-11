// ============================================================
// FLAPPY BIRD
// ============================================================
var _flappyRaf = null;
var _flappyState = null;

function _startFlappy() {
  _currentGame = 'flappy';
  document.getElementById('gamesTitle').innerHTML = '🐦 Flappy Bird <button class="games-back" onclick="_showGameMenu()">' + t('game_back') + '</button>';
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
    pipeGap: 130,
    pipeWidth: 36,
    gravity: 0.18,
    jump: -4.5,
    pipeSpeed: 1.6,
  };
}

function _flappyKey(e) {
  if (_currentGame !== 'flappy') return;
  if (_flappyState.dead && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); _flappyReset(); _flappyRender(); return; }
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
  if (s.frame % 110 === 0) {
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
  var html = '<div class="game-score">' + t('game_score') + ': ' + s.score + ' | ' + t('game_best') + ': ' + (localStorage.getItem('flappy_high') || 0) + '</div>';
  html += '<div class="flappy-area" onclick="_flappyClick()" style="width:'+s.w+'px;height:'+s.h+'px">';
  // 새
  html += '<div class="flappy-bird" style="top:'+Math.round(s.bird.y)+'px">🐦</div>';
  // 파이프
  s.pipes.forEach(function(p) {
    html += '<div class="flappy-pipe-top" style="left:'+Math.round(p.x)+'px;height:'+Math.round(p.gapY)+'px;width:'+s.pipeWidth+'px"></div>';
    html += '<div class="flappy-pipe-bot" style="left:'+Math.round(p.x)+'px;top:'+Math.round(p.gapY+s.pipeGap)+'px;width:'+s.pipeWidth+'px;height:'+Math.round(s.h-p.gapY-s.pipeGap)+'px"></div>';
  });
  html += '</div>';
  if (!s.started) html += '<div class="game-hint">' + t('game_hint_flappy') + '</div>';
  if (s.dead) html += '<div class="game-over">' + t('game_over') + '<br><span class=\"game-hint\">' + t('game_restart_hint') + '</span><br><button class="game-btn" onclick="_flappyReset();_flappyRender()">' + t('game_retry') + '</button></div>';
  body.innerHTML = html;
}
