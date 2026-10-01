const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const HOOK_URL = 'http://127.0.0.1:7777/claude-hook';
const OWNER_HEADER = 'X-Pip-Integration';
const OWNER_VALUE = 'pip-desktop';
const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'Notification',
  'PostToolUseFailure',
  'Stop',
  'StopFailure',
];

function settingsPath(home) {
  return path.join(home, '.claude', 'settings.json');
}

function isPipHook(handler) {
  if (handler?.type !== 'http' || handler.url !== HOOK_URL) return false;
  const headers = handler.headers;
  return !headers || headers[OWNER_HEADER] === OWNER_VALUE;
}

async function readSettings(home) {
  const file = settingsPath(home);
  let contents;
  try {
    contents = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { file, contents: null, settings: {} };
    throw new Error(`Não consegui ler as configurações do Claude Code: ${error.message}`);
  }

  let settings;
  try {
    settings = JSON.parse(contents.replace(/^\uFEFF/, ''));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('formato JSON inválido');
  } catch (error) {
    throw new Error(`As configurações do Claude Code não são um JSON válido; preservei o arquivo sem alterações (${error.message}).`);
  }
  return { file, contents, settings };
}

function hasPipHooks(settings) {
  return HOOK_EVENTS.some((eventName) => (settings.hooks?.[eventName] || [])
    .some((group) => Array.isArray(group?.hooks) && group.hooks.some(isPipHook)));
}

async function getStatus(home) {
  try {
    const { settings } = await readSettings(home);
    return { enabled: hasPipHooks(settings), warning: '' };
  } catch (error) {
    return { enabled: false, warning: error.message };
  }
}

async function assertSettingsUnchanged(file, originalContents) {
  let currentContents;
  try {
    currentContents = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    currentContents = null;
  }
  if (currentContents !== originalContents) {
    throw new Error('O arquivo de configurações do Claude Code mudou durante a operação. Nenhuma alteração foi aplicada; tente salvar novamente.');
  }
}

function mergePipHooks(settings, enabled) {
  if (settings.hooks !== undefined
    && (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))) {
    throw new Error('A configuração de hooks do Claude Code é inválida; não alterei o arquivo.');
  }
  const next = { ...settings };
  const hooks = { ...(settings.hooks || {}) };
  let settingsChanged = false;

  for (const eventName of HOOK_EVENTS) {
    const groups = hooks[eventName];
    if (groups !== undefined && !Array.isArray(groups)) {
      throw new Error(`A configuração de hooks do Claude Code para ${eventName} não é uma lista; não alterei o arquivo.`);
    }
    const updatedGroups = [];
    let found = false;
    let eventChanged = false;
    for (const group of groups || []) {
      if (!Array.isArray(group?.hooks)) {
        updatedGroups.push(group);
        continue;
      }
      const handlers = [];
      let groupChanged = false;
      for (const handler of group.hooks) {
        if (!isPipHook(handler)) {
          handlers.push(handler);
          continue;
        }
        if (!enabled) {
          groupChanged = true;
          eventChanged = true;
          continue;
        }
        found = true;
        const upgraded = { ...handler, headers: { ...(handler.headers || {}), [OWNER_HEADER]: OWNER_VALUE } };
        if (JSON.stringify(upgraded) !== JSON.stringify(handler)) {
          groupChanged = true;
          eventChanged = true;
        }
        handlers.push(upgraded);
      }
      if (groupChanged) {
        if (handlers.length) updatedGroups.push({ ...group, hooks: handlers });
      } else updatedGroups.push(group);
    }
    if (enabled && !found) {
      eventChanged = true;
      updatedGroups.push({
        hooks: [{
          type: 'http',
          url: HOOK_URL,
          timeout: 2,
          headers: { [OWNER_HEADER]: OWNER_VALUE },
        }],
      });
    }
    if (!eventChanged) continue;
    settingsChanged = true;
    hooks[eventName] = updatedGroups;
  }

  if (settingsChanged) {
    if (Object.keys(hooks).length) next.hooks = hooks;
    else delete next.hooks;
  }
  return next;
}

async function saveSettingsFile(file, originalContents, settings) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await assertSettingsUnchanged(file, originalContents);
    if (originalContents !== null) {
      const backup = `${file}.pip-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      await fs.copyFile(file, backup, fs.constants.COPYFILE_EXCL);
      await assertSettingsUnchanged(file, originalContents);
    }
    await fs.rename(temporaryFile, file);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    throw new Error(`Não consegui atualizar as configurações do Claude Code; o backup foi preservado quando criado (${error.message}).`);
  }
}

async function setEnabled(home, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Estado da integração com Claude Code inválido.');
  const { file, contents, settings } = await readSettings(home);
  const next = mergePipHooks(settings, enabled);
  if (JSON.stringify(settings) === JSON.stringify(next)) return { enabled: hasPipHooks(settings), backupCreated: false };
  await saveSettingsFile(file, contents, next);
  return { enabled: hasPipHooks(next), backupCreated: contents !== null };
}

module.exports = { getStatus, setEnabled, HOOK_URL, OWNER_HEADER, OWNER_VALUE };
