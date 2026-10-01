const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const http = require('http');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');
const { ask, getProviderConfiguration } = require('./providers');
const { loopbackUrl } = require('./providers/shared');
const { readDroppedFiles, FILE_DIALOG_EXTENSIONS, MAX_FILES } = require('./file-attachments');
const settingsStore = require('./settings-store');
const { startAlfredNotifications } = require('./integrations/alfred-notifications');
const { startWindowsMediaSession } = require('./integrations/windows-media-session');
const { checkAlfredHealth } = require('./integrations/alfred-health');
const { eventForClaudeHook } = require('./integrations/claude-code-hook-event');
const claudeCodeSettings = require('./integrations/claude-code-settings');
const PORT = 7777;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLAUDE_HOOK_BODY_BYTES = 512 * 1024;
const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 250;
const PIPE_NAME = '\\\\.\\pipe\\pip-desktop-v1';
const gotSingleInstanceLock = app.requestSingleInstanceLock();
let win;
let tray;
let settingsWindow;
let paused = false;
let autoHideTimer;
let pointerPollTimer;
let lastDisplayId;
let pendingQuestions = 0;
let wasInTopZone = false;
let pointerInteracting = false;
let chatOpen = false;
let isQuitting = false;
let stopAlfredNotifications;
let stopWindowsMediaSession;
let alfredNotificationsUrl;
let pendingAttachments = [];
const activeQuestions = new Map();
const localChatQuestions = new Map();
const send = (e) => {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('ev', e);
};

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  abortLocalChatQuestions();
  if (win && !win.isDestroyed()) {
    chatOpen = false;
    pointerInteracting = false;
    win.blur();
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
    win.hide();
    send({ type: 'chat-dismissed' });
  }
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const settingsWidth = Math.min(440, workArea.width);
  const settingsHeight = Math.min(650, workArea.height);
  settingsWindow = new BrowserWindow({
    width: settingsWidth,
    height: settingsHeight,
    minWidth: Math.min(320, settingsWidth),
    minHeight: Math.min(420, settingsHeight),
    maxWidth: Math.min(640, workArea.width),
    maxHeight: workArea.height,
    title: 'Configurações do Pip',
    autoHideMenuBar: true,
    backgroundColor: '#211d2f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => {
    settingsWindow = undefined;
    if (isQuitting || paused || !win || win.isDestroyed()) return;
    reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    hideLater(5000);
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}

function handleAlfredAlert(alert) {
  const category = typeof alert.category === 'string' ? alert.category : '';
  const mood = alert.type === 'error' ? 'sad'
    : alert.type === 'warning' ? 'worried'
      : alert.type === 'success' ? 'happy'
        : ['research', 'briefing_ready', 'cpu', 'ram', 'battery', 'file'].includes(category) ? 'thinking'
          : null;
  if (!mood) return;
  const title = typeof alert.title === 'string' ? alert.title.trim() : '';
  const message = typeof alert.message === 'string' ? alert.message.trim() : '';
  const text = [title, message].filter(Boolean).join('\n').slice(0, 500);
  if (text) dispatchBridgeRequest('/event', { type: mood, text }).catch((error) => console.error('Alfred alert:', error));
}

async function syncAlfredNotifications() {
  const configuration = await getProviderConfiguration();
  if (configuration.provider !== 'alfred') {
    if (stopAlfredNotifications) stopAlfredNotifications();
    stopAlfredNotifications = undefined;
    alfredNotificationsUrl = undefined;
    return;
  }

  const url = configuration.alfredUrl;
  if (stopAlfredNotifications && alfredNotificationsUrl === url) return;
  if (stopAlfredNotifications) {
    stopAlfredNotifications();
  }
  alfredNotificationsUrl = url;
  stopAlfredNotifications = startAlfredNotifications(handleAlfredAlert, configuration);
}

function placeOnDisplay(display) {
  if (!win || win.isDestroyed()) return;
  const { x, y, width } = display.bounds;
  win.setBounds({ x: Math.round(x + (width - WINDOW_WIDTH) / 2), y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
  lastDisplayId = display.id;
}

function hideLater(delay = 7000) {
  clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || paused) return;
    if (pendingQuestions > 0 || chatOpen) {
      hideLater(3000);
      return;
    }
    const p = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(p);
    const atTopTrigger = Math.abs(p.y - display.bounds.y) <= 2
      && Math.abs(p.x - (display.bounds.x + display.bounds.width / 2)) <= 130;
    if (pointerInteracting || atTopTrigger) hideLater(2500);
    else {
      pointerInteracting = false;
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  }, delay);
}

function reveal(display = screen.getPrimaryDisplay()) {
  if (!win || win.isDestroyed() || paused) return;
  if (lastDisplayId !== display.id) placeOnDisplay(display);
  if (!win.isVisible()) win.showInactive();
}

function pollPointer() {
  if (isQuitting || paused || !win || win.isDestroyed()) return;
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const bounds = display.bounds;
  const topZone = Math.abs(point.y - bounds.y) <= 2
    && Math.abs(point.x - (bounds.x + bounds.width / 2)) <= 130;
  if (topZone && !wasInTopZone) {
    reveal(display);
    hideLater(7000);
  }
  wasInTopZone = topZone;
  if (win.isVisible()) {
    const windowBounds = win.getBounds();
    send({ type: 'cursor', x: point.x - windowBounds.x, y: point.y - windowBounds.y });
  }
  pointerPollTimer = setTimeout(pollPointer, win.isVisible() ? 33 : 250);
}

function isOverlaySender(event) {
  if (!win || event.sender !== win.webContents || !event.senderFrame) return false;
  return event.senderFrame.url === pathToFileURL(path.join(__dirname, 'index.html')).href;
}

function isSettingsSender(event) {
  if (!settingsWindow || settingsWindow.isDestroyed() || event.sender !== settingsWindow.webContents || !event.senderFrame) return false;
  return event.senderFrame.url === pathToFileURL(path.join(__dirname, 'settings.html')).href;
}

function loginItemSettings() {
  return {
    path: process.execPath,
    args: app.isPackaged ? [] : [`"${app.getAppPath()}"`],
  };
}

function abortBridgeQuestion(requestId) {
  if (typeof requestId !== 'string' || requestId.length > 80) return;
  activeQuestions.get(requestId)?.abort();
}

function abortLocalChatQuestions() {
  for (const controller of localChatQuestions.values()) controller.abort();
}

function createTray() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="3" y="5" width="26" height="22" rx="9" fill="#b9a6f0"/><circle cx="11" cy="14" r="2" fill="#2b2540"/><circle cx="21" cy="14" r="2" fill="#2b2540"/><path d="M12 20h8" stroke="#2b2540" stroke-width="2" stroke-linecap="round"/></svg>';
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
  tray.setToolTip('Pip');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Mostrar Pip', click: () => { reveal(); hideLater(); } },
    { label: 'Pausar aparições', type: 'checkbox', checked: paused, click: (item) => {
      paused = item.checked;
      wasInTopZone = false;
      if (paused && win) {
        clearTimeout(pointerPollTimer);
        pointerPollTimer = undefined;
        abortLocalChatQuestions();
        chatOpen = false;
        pointerInteracting = false;
        win.blur();
        win.setFocusable(false);
        win.setIgnoreMouseEvents(true, { forward: true });
        win.hide();
        send({ type: 'chat-dismissed' });
      } else if (!paused) {
        reveal();
        pollPointer();
      }
    } },
    { label: 'Configurações…', click: openSettings },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    reveal(display);
    hideLater();
  });
}

async function dispatchBridgeRequest(route, data, options = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 400, body: { error: 'request must be a JSON object' } };
  }

  if (route === '/claude-hook') {
    const event = eventForClaudeHook(data);
    if (event) await dispatchBridgeRequest('/event', event);
    return { status: 200, body: {} };
  }

  if (route === '/event') {
    if (typeof data.type !== 'string' || data.type.length > 40) {
      return { status: 400, body: { error: 'invalid event type' } };
    }
    if (['worried', 'relieved', 'happy', 'sad', 'thinking', 'answer'].includes(data.type)) {
      reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
      hideLater(data.type === 'thinking' ? 30000 : 6000);
    }
    send(data);
    return { status: 200, body: {} };
  }

  if (route === '/ask') {
    const requestId = typeof data.requestId === 'string' && data.requestId.length <= 80 ? data.requestId : null;
    if (requestId && activeQuestions.has(requestId)) {
      return { status: 409, body: { error: 'duplicate request id' } };
    }
    const controller = new AbortController();
    if (requestId) activeQuestions.set(requestId, controller);
    if (options.localChat && requestId) localChatQuestions.set(requestId, controller);
    reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    pendingQuestions += 1;
    try {
      send({ type: 'thinking' });
      const response = await ask(data, { signal: controller.signal });
      if (controller.signal.aborted) throw controller.signal.reason || Object.assign(new Error('solicitação cancelada'), { name: 'AbortError' });
      const result = typeof response === 'string' ? { ok: true, text: response } : response;
      if (result.ok) {
        if (options.notify !== false) send({ type: 'answer', text: result.text });
      } else {
        send({ type: 'sad', text: result.text });
      }
      return { status: 200, body: result };
    } catch (error) {
      if (error.name === 'AbortError') {
        send({ type: 'cancelled' });
        return { status: 499, body: { error: 'solicitação cancelada' } };
      }
      send({ type: 'sad', text: 'Não consegui concluir essa pergunta.' });
      throw error;
    } finally {
      if (requestId && activeQuestions.get(requestId) === controller) activeQuestions.delete(requestId);
      if (requestId && localChatQuestions.get(requestId) === controller) localChatQuestions.delete(requestId);
      pendingQuestions = Math.max(0, pendingQuestions - 1);
      hideLater(12000);
    }
  }

  return { status: 404, body: { error: 'not found' } };
}

function startNamedPipeServer() {
  const server = net.createServer((socket) => {
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
      if (!replied && requestMethod === '/ask') abortBridgeQuestion(requestPayload?.requestId);
    });
    socket.on('data', async (chunk) => {
      if (replied) return;
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > MAX_BODY_BYTES) {
        reply({ ok: false, status: 413, error: 'request body too large' });
        return;
      }
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(requestTimer);
      try {
        const request = JSON.parse(input.slice(0, newline));
        if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.method !== 'string') {
          reply({ ok: false, status: 400, error: 'invalid request envelope' });
          return;
        }
        requestId = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : null;
        requestMethod = request.method;
        requestPayload = request.payload;
        const result = await dispatchBridgeRequest(requestMethod, requestPayload);
        reply({ ok: result.status >= 200 && result.status < 300, status: result.status, result: result.body });
      } catch (error) {
        reply({ ok: false, status: 400, error: error instanceof SyntaxError ? 'invalid JSON' : String(error) });
      }
    });
  });
  server.maxConnections = 16;
  server.on('error', (error) => {
    console.error('Pip named pipe error:', error.message);
    if (error.code === 'EADDRINUSE') send({ type: 'sad', text: 'O canal local do Pip já está em uso.' });
  });
  server.listen(PIPE_NAME);
  return server;
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    hideLater();
  });

app.whenReady().then(() => {
  const display = screen.getPrimaryDisplay();
  const { x, y, width } = display.bounds;
  win = new BrowserWindow({
    width: WINDOW_WIDTH, height: WINDOW_HEIGHT, x: Math.round(x + (width - WINDOW_WIDTH) / 2), y,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, hasShadow: false, resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  lastDisplayId = display.id;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    createTray();
    win.showInactive();
    send({ type: 'hello' });
    hideLater(6500);
    syncAlfredNotifications().catch((error) => console.error('Alfred notifications:', error));
    if (process.platform === 'win32') {
      stopWindowsMediaSession = startWindowsMediaSession((media) => send({ type: 'media', media }));
    }
  });
  ipcMain.on('interactive', (_, v) => {
    pointerInteracting = !!v;
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!pointerInteracting, { forward: true });
  });
  ipcMain.on('chat-open', () => {
    if (paused || !win || win.isDestroyed()) return;
    chatOpen = true;
    pointerInteracting = true;
    reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    win.setFocusable(true);
    win.setIgnoreMouseEvents(false);
    win.show();
    win.focus();
    send({ type: 'chat-opened' });
    hideLater();
  });
  ipcMain.on('chat-cancel', (event, requestId) => {
    if (!isOverlaySender(event)) return;
    if (typeof requestId !== 'string' || !requestId.startsWith('pip-overlay-chat-') || requestId.length > 80) return;
    localChatQuestions.get(requestId)?.abort();
  });
  ipcMain.on('chat-close', () => {
    abortLocalChatQuestions();
    chatOpen = false;
    pointerInteracting = false;
    if (!win || win.isDestroyed()) return;
    win.blur();
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
    hideLater(5000);
  });
  ipcMain.handle('files:attach', async (event, filePaths) => {
    if (!isOverlaySender(event)) throw new Error('Origem da solicitação inválida.');
    pendingAttachments = await readDroppedFiles(filePaths);
    return pendingAttachments.map(({ name, size }) => ({ name, size }));
  });
  ipcMain.handle('files:choose', async (event) => {
    if (!isOverlaySender(event)) throw new Error('Origem da solicitação inválida.');
    const result = await dialog.showOpenDialog(win, {
      title: 'Anexar arquivos ao Pip',
      buttonLabel: 'Anexar',
      properties: ['openFile', 'multiSelections', 'showHiddenFiles'],
      filters: [{ name: 'Texto e código', extensions: FILE_DIALOG_EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    if (result.filePaths.length > MAX_FILES) throw new Error(`Escolha até ${MAX_FILES} arquivos por vez.`);
    pendingAttachments = await readDroppedFiles(result.filePaths);
    return pendingAttachments.map(({ name, size }) => ({ name, size }));
  });
  ipcMain.handle('files:clear', (event) => {
    if (!isOverlaySender(event)) throw new Error('Origem da solicitação inválida.');
    pendingAttachments = [];
  });
  ipcMain.handle('chat-ask', async (event, question, requestId) => {
    if (!isOverlaySender(event)) throw new Error('Origem da solicitação inválida.');
    if (typeof question !== 'string' || question.length > 2000) throw new Error('Use até 2.000 caracteres para a pergunta.');
    if (typeof requestId !== 'string' || !/^pip-overlay-chat-\d+-\d+$/.test(requestId) || requestId.length > 80) {
      throw new Error('Identificador da pergunta inválido.');
    }
    const result = await dispatchBridgeRequest('/ask', { question, requestId, attachments: pendingAttachments }, { notify: false, localChat: true });
    if (result.status === 499) return { ok: false, cancelled: true, text: 'Parei por aqui.' };
    if (result.status < 200 || result.status >= 300) throw new Error(result.body.error || 'Não consegui enviar a pergunta.');
    return result.body;
  });
  ipcMain.handle('settings:get', async (event) => {
    if (!isSettingsSender(event)) throw new Error('Origem da solicitação inválida.');
    const settings = await settingsStore.getPublicSettings();
    const claudeHooks = process.platform === 'win32'
      ? await claudeCodeSettings.getStatus(app.getPath('home'))
      : { enabled: false, warning: '' };
    return {
      ...settings,
      startWithWindows: process.platform === 'win32'
        ? app.getLoginItemSettings(loginItemSettings()).openAtLogin
        : false,
      claudeCodeHooksEnabled: claudeHooks.enabled,
      claudeCodeHooksWarning: claudeHooks.warning,
    };
  });
  ipcMain.on('settings-open', openSettings);
  ipcMain.handle('settings:save', async (event, settings) => {
    if (!isSettingsSender(event)) throw new Error('Origem da solicitação inválida.');
    const result = await settingsStore.saveSettings(settings);
    if (process.platform === 'win32' && typeof settings?.startWithWindows === 'boolean') {
      try {
        app.setLoginItemSettings({
          ...loginItemSettings(),
          name: 'Pip',
          openAtLogin: settings.startWithWindows,
          enabled: true,
        });
        result.startWithWindows = app.getLoginItemSettings(loginItemSettings()).openAtLogin;
      } catch (error) {
        result.startupWarning = `As configurações foram salvas, mas não consegui atualizar a inicialização do Windows: ${error.message}`;
      }
    }
    if (process.platform === 'win32' && typeof settings?.claudeCodeHooks === 'boolean') {
      const currentHooks = await claudeCodeSettings.getStatus(app.getPath('home'));
      result.claudeCodeHooksEnabled = currentHooks.enabled;
      result.claudeCodeHooksWarning = currentHooks.warning;
      if (settings.claudeCodeHooks !== currentHooks.enabled && (!currentHooks.warning || settings.claudeCodeHooks)) {
        try {
          const hookResult = await claudeCodeSettings.setEnabled(app.getPath('home'), settings.claudeCodeHooks);
          result.claudeCodeHooksEnabled = hookResult.enabled;
          result.claudeCodeHooksBackupCreated = hookResult.backupCreated;
          result.claudeCodeHooksWarning = '';
        } catch (error) {
          result.claudeCodeHooksWarning = error.message;
        }
      }
    }
    await syncAlfredNotifications();
    return result;
  });
  ipcMain.handle('alfred:test-connection', async (event, requestedUrl) => {
    if (!isSettingsSender(event)) throw new Error('Origem da solicitação inválida.');
    const configuration = await getProviderConfiguration();
    const overrideUrl = process.env.PIP_ALFRED_URL;
    const url = overrideUrl
      ? loopbackUrl(overrideUrl, 'http://127.0.0.1:8000').origin
      : settingsStore.validateAlfredUrl(typeof requestedUrl === 'string' && requestedUrl.trim()
        ? requestedUrl.trim()
        : configuration.alfredUrl);
    return checkAlfredHealth(url);
  });
  pollPointer();

  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!['/event', '/ask', '/claude-hook'].includes(req.url)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if (req.headers.origin) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'browser origins are not allowed' }));
      return;
    }

    let body = '';
    let bodyBytes = 0;
    let tooLarge = false;
    let requestData;
    const bodyLimit = req.url === '/claude-hook' ? MAX_CLAUDE_HOOK_BODY_BYTES : MAX_BODY_BYTES;
    res.on('close', () => {
      if (!res.writableEnded && req.url === '/ask') abortBridgeQuestion(requestData?.requestId);
    });
    req.on('data', (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > bodyLimit) tooLarge = true;
      else body += chunk;
    });
    req.on('end', async () => {
      if (tooLarge) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: 'request body too large' }));
        return;
      }
      let data;
      try {
        data = JSON.parse(body || '{}');
        requestData = data;
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }
      try {
        const result = await dispatchBridgeRequest(req.url, data);
        res.statusCode = result.status;
        res.end(JSON.stringify(result.body));
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  server.on('error', (error) => {
    console.error('Pip local server error:', error.message);
    if (error.code === 'EADDRINUSE') {
      send({ type: 'sad', text: `A porta local ${PORT} já está em uso. Feche a outra instância do Pip.` });
    }
  });
  server.maxConnections = 16;
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.listen(PORT, '127.0.0.1');
  startNamedPipeServer();
});
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(pointerPollTimer);
  for (const controller of activeQuestions.values()) controller.abort();
  stopAlfredNotifications?.();
  stopWindowsMediaSession?.();
});
}
