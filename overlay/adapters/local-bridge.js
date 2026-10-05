const http = require('http');
const net = require('net');

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_HOOK_BYTES = 512 * 1024;
const ROUTES = new Set(['/event', '/ask', '/claude-hook']);

function createLocalBridge({ dispatch, abortQuestion, emit, port, pipeName, logger = console }) {
  let httpServer;
  let pipeServer;

  function start() {
    httpServer = createHttpServer();
    pipeServer = createNamedPipeServer();
    httpServer.listen(port, '127.0.0.1');
    pipeServer.listen(pipeName);
    return { httpServer, pipeServer };
  }

  function close() {
    if (httpServer?.listening) httpServer.close();
    if (pipeServer?.listening) pipeServer.close();
  }

  function createHttpServer() {
    const server = http.createServer(handleHttpRequest);
    server.maxConnections = 16;
    server.headersTimeout = 10_000;
    server.requestTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.on('error', handleHttpServerError);
    return server;
  }

  function handleHttpRequest(request, response) {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      return respond(response, 405, { error: 'method not allowed' });
    }
    if (!ROUTES.has(request.url)) return respond(response, 404, { error: 'not found' });
    if (request.headers.origin) return respond(response, 403, { error: 'browser origins are not allowed' });

    readJsonRequest(request, request.url === '/claude-hook' ? MAX_HOOK_BYTES : MAX_REQUEST_BYTES)
      .then((data) => dispatch(request.url, data))
      .then(({ status, body }) => respond(response, status, body))
      .catch((error) => {
        const status = error.status || 500;
        if (status >= 500) logger.error('Pip local bridge request failed:', error);
        respond(response, status, { error: status < 500 ? error.message : String(error) });
      });
    response.on('close', () => {
      if (!response.writableEnded && request.url === '/ask') {
        abortQuestion(request.requestData?.requestId);
      }
    });
  }

  function handleHttpServerError(error) {
    logger.error('Pip local server error:', error.message);
    if (error.code === 'EADDRINUSE') emit({ type: 'sad', text: `A porta local ${port} já está em uso. Feche a outra instância do Pip.` });
  }

  function createNamedPipeServer() {
    const server = net.createServer(handlePipeConnection);
    server.maxConnections = 16;
    server.on('error', (error) => {
      logger.error('Pip named pipe error:', error.message);
      if (error.code === 'EADDRINUSE') emit({ type: 'sad', text: 'O canal local do Pip já está em uso.' });
    });
    return server;
  }

  function handlePipeConnection(socket) {
    socket.setEncoding('utf8');
    let input = '';
    let replied = false;
    let requestId = null;
    let requestMethod;
    let requestPayload;

    const reply = (message) => {
      if (replied) return;
      replied = true;
      clearTimeout(requestTimer);
      socket.end(`${JSON.stringify({ id: requestId, ...message })}\n`);
    };

    const requestTimer = setTimeout(() => reply({ ok: false, error: 'request timeout' }), 10_000);
    socket.on('error', () => {});
    socket.on('close', () => {
      if (!replied && requestMethod === '/ask') abortQuestion(requestPayload?.requestId);
    });
    socket.on('data', async (chunk) => {
      if (replied) return;
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > MAX_REQUEST_BYTES) {
        reply({ ok: false, status: 413, error: 'request body too large' });
        return;
      }
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(requestTimer);
      await handlePipeMessage(input.slice(0, newline), reply, (request) => {
        requestId = request.id;
        requestMethod = request.method;
        requestPayload = request.payload;
      });
    });
  }

  async function handlePipeMessage(serialized, reply, setRequest) {
    try {
      const request = JSON.parse(serialized);
      if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.method !== 'string') {
        reply({ ok: false, status: 400, error: 'invalid request envelope' });
        return;
      }
      setRequest(request);
      const result = await dispatch(request.method, request.payload);
      reply({ ok: result.status >= 200 && result.status < 300, status: result.status, result: result.body });
    } catch (error) {
      reply({ ok: false, status: 400, error: error instanceof SyntaxError ? 'invalid JSON' : String(error) });
    }
  }

  return { start, close };
}

async function readJsonRequest(request, maxBytes) {
  let body = '';
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw Object.assign(new Error('request body too large'), { status: 413 });
    body += chunk;
  }
  try {
    const data = JSON.parse(body || '{}');
    request.requestData = data;
    return data;
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

function respond(response, status, body) {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

module.exports = { createLocalBridge };
