function registerSettingsIpc({
  ipcMain,
  app,
  platform,
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
  environment,
}) {
  ipcMain.handle('settings:get', async (event) => {
    assertSettingsSender(event, isSettingsSender);
    const settings = await settingsRepository.getPublicSettings();
    const claudeHooks = platform === 'win32'
      ? await claudeCodeSettings.getStatus(app.getPath('home'))
      : { enabled: false, warning: '' };
    return {
      ...settings,
      startWithWindows: platform === 'win32'
        ? app.getLoginItemSettings(loginItemSettings()).openAtLogin
        : false,
      claudeCodeHooksEnabled: claudeHooks.enabled,
      claudeCodeHooksWarning: claudeHooks.warning,
    };
  });

  ipcMain.handle('usage:get', async (event) => {
    assertSettingsSender(event, isSettingsSender);
    return usageRepository.getSummary();
  });

  ipcMain.on('settings-open', openSettings);

  ipcMain.handle('settings:save', async (event, settings) => {
    assertSettingsSender(event, isSettingsSender);
    const result = await settingsRepository.saveSettings(settings);
    await updateWindowsStartup(settings, result, { app, platform, loginItemSettings });
    await updateClaudeHooks(settings, result, { app, platform, claudeCodeSettings });
    await syncAlfredNotifications();
    return result;
  });

  ipcMain.handle('alfred:test-connection', async (event, requestedUrl) => {
    assertSettingsSender(event, isSettingsSender);
    const configuration = await getProviderConfiguration();
    const url = resolveAlfredHealthUrl(requestedUrl, configuration, {
      settingsRepository,
      loopbackUrl,
      overrideUrl: environment.PIP_ALFRED_URL,
    });
    return checkAlfredHealth(url);
  });
}

function assertSettingsSender(event, isSettingsSender) {
  if (!isSettingsSender(event)) throw new Error('Origem da solicitação inválida.');
}

async function updateWindowsStartup(settings, result, { app, platform, loginItemSettings }) {
  if (platform !== 'win32' || typeof settings?.startWithWindows !== 'boolean') return;
  try {
    app.setLoginItemSettings({ ...loginItemSettings(), name: 'Pip', openAtLogin: settings.startWithWindows, enabled: true });
    result.startWithWindows = app.getLoginItemSettings(loginItemSettings()).openAtLogin;
  } catch (error) {
    result.startupWarning = `As configurações foram salvas, mas não consegui atualizar a inicialização do Windows: ${error.message}`;
  }
}

async function updateClaudeHooks(settings, result, { app, platform, claudeCodeSettings }) {
  if (platform !== 'win32' || typeof settings?.claudeCodeHooks !== 'boolean') return;
  const home = app.getPath('home');
  const currentHooks = await claudeCodeSettings.getStatus(home);
  result.claudeCodeHooksEnabled = currentHooks.enabled;
  result.claudeCodeHooksWarning = currentHooks.warning;
  if (settings.claudeCodeHooks === currentHooks.enabled || (currentHooks.warning && !settings.claudeCodeHooks)) return;

  try {
    const hookResult = await claudeCodeSettings.setEnabled(home, settings.claudeCodeHooks);
    result.claudeCodeHooksEnabled = hookResult.enabled;
    result.claudeCodeHooksBackupCreated = hookResult.backupCreated;
    result.claudeCodeHooksWarning = '';
  } catch (error) {
    result.claudeCodeHooksWarning = error.message;
  }
}

function resolveAlfredHealthUrl(requestedUrl, configuration, { settingsRepository, loopbackUrl, overrideUrl }) {
  if (overrideUrl) return loopbackUrl(overrideUrl, 'http://127.0.0.1:8000').origin;
  const url = typeof requestedUrl === 'string' && requestedUrl.trim() ? requestedUrl.trim() : configuration.alfredUrl;
  return settingsRepository.validateAlfredUrl(url);
}

module.exports = { registerSettingsIpc };
