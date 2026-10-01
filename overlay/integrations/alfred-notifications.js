const { loopbackUrl } = require('../providers/shared');

function startAlfredNotifications(onAlert, settings = {}) {
  let stopped = false;
  let socket;
  let retryTimer;
  let pingTimer;
  let retryDelay = 1000;

  function connect() {
    if (stopped || typeof WebSocket === 'undefined') return;

    const url = loopbackUrl(settings.alfredUrl || process.env.PIP_ALFRED_URL, 'http://127.0.0.1:8000');
    url.protocol = 'ws:';
    url.pathname = '/ws/notifications';
    url.search = '';
    url.hash = '';

    const current = new WebSocket(url);
    socket = current;
    current.onopen = () => {
      if (socket !== current || stopped) return;
      retryDelay = 1000;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (current.readyState === WebSocket.OPEN) current.send('ping');
      }, 25_000);
    };
    current.onmessage = (event) => {
      if (socket !== current || stopped || typeof event.data !== 'string') return;
      try {
        const alert = JSON.parse(event.data);
        if (alert.category !== 'stream_token' && typeof alert.type === 'string') onAlert(alert);
      } catch {
        // Ignora mensagens que não sigam o formato de notificação do Alfred.
      }
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (socket === current) socket = undefined;
      clearInterval(pingTimer);
      if (stopped || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };
  }

  connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (typeof WebSocket !== 'undefined' && socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Pip encerrando');
    socket = undefined;
  };
}

module.exports = { startAlfredNotifications };
