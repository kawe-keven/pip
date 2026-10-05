const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { ask, getProviderConfiguration } = require('./providers');
const { createBridgeRouter } = require('./application/bridge-router');
const { createLocalBridge } = require('./adapters/local-bridge');
const { registerChatIpc } = require('./adapters/electron/chat-ipc');
const { registerSettingsIpc } = require('./adapters/electron/settings-ipc');
const { createConversationService } = require('./application/conversation-service');
const { loopbackUrl } = require('./providers/shared');
const fileAttachments = require('./file-attachments');
const settingsRepository = require('./infrastructure/settings-repository');
const conversationRepository = require('./infrastructure/json-conversation-repository');
const conversationService = createConversationService({ repository: conversationRepository });
const { startAlfredNotifications } = require('./integrations/alfred-notifications');
const { startWindowsMediaSession } = require('./integrations/windows-media-session');
const { checkAlfredHealth } = require('./integrations/alfred-health');
const { eventForClaudeHook } = require('./integrations/claude-code-hook-event');
const claudeCodeSettings = require('./integrations/claude-code-settings');
const usageRepository = require('./infrastructure/json-usage-repository');
const PORT = 7777;
const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 250;
const CHAT_WINDOW_HEIGHT = 440;
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
const send = (e) => {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('ev', e);
};
const bridgeRouter = createBridgeRouter({
  ask,
  emit: send,
  revealForEvent: (type) => {
    reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    hideLater(type === 'thinking' ? 30000 : 6000);
  },
  beforeQuestion: () => reveal(screen.getDisplayNearestPoint(screen.getCursorScreenPoint())),
  hideLater,
  recordAiUsage: (entry) => usageRepository.recordAi(entry),
  recordIdeUsage: (ide) => usageRepository.recordIde(ide),
  eventForClaudeHook,
  onPendingChange: (change) => { pendingQuestions = Math.max(0, pendingQuestions + change); },
});
const dispatchBridgeRequest = bridgeRouter.dispatch;
const localBridge = createLocalBridge({
  dispatch: dispatchBridgeRequest,
  abortQuestion: bridgeRouter.abortQuestion,
  emit: send,
  port: PORT,
  pipeName: PIPE_NAME,
});

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  abortLocalChatQuestions();
  if (win && !win.isDestroyed()) {
    chatOpen = false;
    placeOnDisplay(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
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
  const height = chatOpen ? Math.min(CHAT_WINDOW_HEIGHT, display.workAreaSize.height) : WINDOW_HEIGHT;
  win.setBounds({ x: Math.round(x + (width - WINDOW_WIDTH) / 2), y, width: WINDOW_WIDTH, height });
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

function abortLocalChatQuestions() {
  bridgeRouter.abortLocalQuestions();
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
    transparent: true, backgroundColor: '#00000000', frame: false, alwaysOnTop: true, skipTaskbar: true,
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
    placeOnDisplay(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
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
    bridgeRouter.abortQuestion(requestId);
  });
  ipcMain.on('chat-close', () => {
    chatOpen = false;
    pointerInteracting = false;
    if (!win || win.isDestroyed()) return;
    placeOnDisplay(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    win.blur();
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
    hideLater(5000);
  });
  registerChatIpc({
    ipcMain,
    dialog,
    getWindow: () => win,
    isOverlaySender,
    fileAttachments,
    conversationService,
    dispatchBridgeRequest,
  });
  registerSettingsIpc({
    ipcMain,
    app,
    platform: process.platform,
    isSettingsSender,
    openSettings,
    settingsRepository,
    usageRepository,
    claudeCodeSettings,
    syncAlfredNotifications,
    loginItemSettings,
    getProviderConfiguration,
    loopbackUrl,
    checkAlfredHealth,
    environment: process.env,
  });
  pollPointer();

  localBridge.start();
});
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(pointerPollTimer);
  bridgeRouter.abortAllQuestions();
  localBridge.close();
  stopAlfredNotifications?.();
  stopWindowsMediaSession?.();
});
}
