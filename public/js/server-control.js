// 서버 제어 버튼 (재시작/종료) + 도움말 토글 + 토스트
// 로드 순서: modal 이후, events 이전
// 의존: state.js(API)
//       api.js(setConn) — hoisting

function toggleHelp() {
  document.getElementById('helpOverlay').classList.toggle('show');
}

var restartConfirmTimer = null;

function restartServer() {
  var btn = document.querySelector('.restart-btn');
  if (btn.classList.contains('confirm')) {
    clearTimeout(restartConfirmTimer);
    btn.classList.remove('confirm'); btn.innerHTML = '&#8635;';
    toast(t('srv_restart_confirm'));
    fetch(API + '/api/restart', { method: 'POST' }).then(function() {
      // 서버 종료 후 재시작 대기 → 연결 확인 후 reload
      var attempts = 0;
      var check = setInterval(function() {
        attempts++;
        fetch(API + '/api/sessions').then(function() { clearInterval(check); location.reload() }).catch(function() {});
        if (attempts > 15) { clearInterval(check); toast('\uC7AC\uC2DC\uC791 \uC2E4\uD328', 'err') }
      }, 1000);
    }).catch(function() { toast('\uC2E4\uD328', 'err') });
  } else {
    btn.classList.add('confirm'); btn.textContent = '\uC7AC\uC2DC\uC791?';
    restartConfirmTimer = setTimeout(function() { btn.classList.remove('confirm'); btn.innerHTML = '&#8635;' }, 3000);
  }
}

var stopConfirmTimer = null;

function shutdownServer() {
  var btn = document.querySelector('.stop-btn');
  if (btn.classList.contains('confirm')) {
    clearTimeout(stopConfirmTimer);
    btn.classList.remove('confirm'); btn.innerHTML = '&#9632;';
    fetch(API + '/api/shutdown', { method: 'POST' }).then(function() { toast(t('srv_shutdown_confirm')); setConn(false) }).catch(function() { toast('\uC774\uBBF8 \uC885\uB8CC\uB428', 'err') });
  } else {
    btn.classList.add('confirm'); btn.textContent = '\uC885\uB8CC?';
    stopConfirmTimer = setTimeout(function() { btn.classList.remove('confirm'); btn.innerHTML = '&#9632;' }, 3000);
  }
}

function toast(m, t) {
  var el = document.getElementById('toast');
  el.textContent = m;
  el.style.background = t === 'err' ? 'var(--negative)' : 'var(--positive)';
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show') }, 1800);
}
