// 브라우저 알림 (Notification API)
// 로드 순서: history 이후, animations 이전
// 주의: toggleNotif는 onclick 핸들러에서 호출됨. initNotifBtn()은 DOM 로드 후 호출 필요

// === 전역 상태 ===
var _notifEnabled = localStorage.getItem('agviz-notif') === 'on';

// === 버튼 상태 동기화 ===
function initNotifBtn() {
  var btn = document.getElementById('notifBtn');
  if (btn) btn.classList.toggle('on', _notifEnabled);
}

// === 알림 켜기 (권한 확인 후 toggleNotif에서 호출) ===
function enableNotif() {
  _notifEnabled = true;
  localStorage.setItem('agviz-notif', 'on');
  initNotifBtn();
  toast(t('notif_on'));
  new Notification('Claude Agent Viz', {
    body: t('notif_enabled')
  });
}

// === 토글 (onclick 핸들러) ===
function toggleNotif() {
  if (!_notifEnabled) {
    if (!('Notification' in window)) {
      toast(t('notif_no_support'), 'err');
      return;
    }
    if (Notification.permission === 'granted') {
      enableNotif();
      return;
    }
    // default/denied 모두 한번 요청 시도 (일부 환경에서 denied도 재요청 가능)
    Notification.requestPermission().then(function(p) {
      if (p === 'granted') {
        enableNotif();
      } else {
        toast(t('notif_permission'), 'err');
      }
    });
  } else {
    _notifEnabled = false;
    localStorage.setItem('agviz-notif', 'off');
    initNotifBtn();
    toast(t('notif_off'));
  }
}

// === 알림 발송 (탭 비활성 상태에서만) ===
function sendNotif(title, body) {
  if (!_notifEnabled || !document.hidden) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  var n = new Notification(title, {body: body, tag: 'agviz'});
  n.onclick = function() { window.focus(); n.close(); };
  setTimeout(function() { n.close(); }, 8000);
}
