const net = require('net');
const crypto = require('crypto');

const DEFAULT_PIPE = '\\\\.\\pipe\\pip-desktop-v1';
const MAX_RESPONSE_BYTES = 1024 * 1024;

function pipeRequest(method, payload, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let socket;
    let response = '';
    let requestId;
    let attempts = 0;
    let timeout;
    let retryTimer;
    let settled = false;
    let onAbort;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(retryTimer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      if (socket && !socket.destroyed) socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };

    const connect = () => {
      if (settled) return;
      response = '';
      requestId = crypto.randomUUID();
      let sent = false;
      socket = net.createConnection(process.env.PIP_PIPE_NAME || DEFAULT_PIPE);
      const currentSocket = socket;
      socket.setEncoding('utf8');
      socket.setNoDelay(true);
      timeout = setTimeout(() => finish(new Error('tempo limite do Pip excedido')), timeoutMs);

      socket.once('connect', () => {
        sent = true;
        socket.write(`${JSON.stringify({ id: requestId, method, payload })}\n`);
      });

      socket.on('data', (chunk) => {
        if (socket !== currentSocket || settled) return;
        response += chunk;
        if (Buffer.byteLength(response, 'utf8') > MAX_RESPONSE_BYTES) {
          finish(new Error('resposta do Pip excedeu o limite permitido'));
          return;
        }
        const newline = response.indexOf('\n');
        if (newline < 0) return;
        try {
          const message = JSON.parse(response.slice(0, newline));
          if (message.id !== requestId || !message.ok) {
            finish(new Error(message.error || message.result?.error || `Pip respondeu com erro ${message.status || ''}`));
            return;
          }
          finish(null, message.result);
        } catch (error) {
          finish(new Error(`resposta inválida do Pip: ${error.message}`));
        }
      });

      socket.once('error', (error) => {
        if (socket !== currentSocket || settled) return;
        clearTimeout(timeout);
        if (!sent && attempts < 2 && ['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(error.code)) {
          attempts += 1;
          retryTimer = setTimeout(connect, 150 * attempts);
        } else finish(error);
      });

      socket.once('close', () => {
        if (socket === currentSocket && !settled && !retryTimer) finish(new Error('conexão com o Pip foi encerrada'));
      });
    };

    if (signal?.aborted) {
      const error = new Error('solicitação cancelada');
      error.name = 'AbortError';
      finish(error);
      return;
    }
    onAbort = () => {
      const error = new Error('solicitação cancelada');
      error.name = 'AbortError';
      finish(error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    connect();
  });
}

async function httpRequest(endpoint, method, payload, timeoutMs, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(`${endpoint}${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function post({ transport, endpoint, method, payload, signal }) {
  const timeoutMs = method === '/ask' ? 130_000 : 10_000;
  if (transport === 'namedPipe') return pipeRequest(method, payload, timeoutMs, signal);
  if (transport === 'auto' && process.platform === 'win32') {
    try {
      return await pipeRequest(method, payload, timeoutMs, signal);
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      if (!['EACCES', 'EPERM', 'ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error;
    }
  }
  return httpRequest(endpoint, method, payload, timeoutMs, signal);
}

module.exports = { post };
