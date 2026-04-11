// ============================================================
// 2048
// ============================================================
var _2048State = null;

function _start2048() {
  _currentGame = '2048';
  document.getElementById('gamesTitle').innerHTML = '🔢 2048 <button class="games-back" onclick="_showGameMenu()">' + t('game_back') + '</button>';
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
  // 죽었으면 스페이스/엔터로 다시하기
  if (_2048State && _2048State.dead && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); localStorage.removeItem('game_2048'); _2048State = null; _start2048(); return; }
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
  var html = '<div class="game-score">' + t('game_score') + ': ' + s.score + ' | ' + t('game_best') + ': ' + (localStorage.getItem('2048_high') || 0) + '</div>';
  html += '<div class="g2048-grid">';
  for (var r=0;r<4;r++) for (var c=0;c<4;c++) {
    var v = s.grid[r][c];
    var bg = bgs[v] || '#3c3a32';
    var fg = colors[v] || '#f9f6f2';
    var fs = v >= 1024 ? '.7rem' : v >= 128 ? '.8rem' : '.9rem';
    html += '<div class="g2048-cell" style="background:'+bg+';color:'+fg+';font-size:'+fs+'">'+(v||'')+'</div>';
  }
  html += '</div>';
  if (s.won && !s.dead) html += '<div class="game-win">' + t('game_2048_win') + '</div>';
  if (s.dead) {
    localStorage.removeItem('game_2048');
    html += '<div class="game-over">' + t('game_over') + '<br><span class=\"game-hint\">' + t('game_restart_hint') + '</span><br><button class="game-btn" onclick="_2048State=null;_start2048()">' + t('game_retry') + '</button></div>';
  }
  html += '<div class="game-actions"><button class="game-btn-sm" onclick="localStorage.removeItem(\'game_2048\');_2048State=null;_start2048()">' + t('game_new') + '</button></div>';
  html += '<div class="game-hint">' + t('game_hint_arrow') + '</div>';
  body.innerHTML = html;
}
