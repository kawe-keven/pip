const { app, safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const outfitCatalog = require('../outfit-catalog');
const OUTFIT_IDS = new Set(outfitCatalog.map((outfit) => outfit.id));

const DEFAULTS = {
  version: 1,
  provider: 'gemini',
  geminiApiKey: null,
  alfredUrl: 'http://127.0.0.1:8000',
  alfredSession: 'pip-editor',
  appearance: { color: '#d4d7d4', outfit: 'none', hair: 'none', accessory: 'none' },
};

let cachedSettings;
let pendingWrite = Promise.resolve();
let settingsWarning = '';

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function readSettings() {
  if (cachedSettings) return cachedSettings;
  const file = settingsPath();
  let serialized;
  try {
    serialized = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Não foi possível ler as configurações do Pip: ${error.message}`);
    cachedSettings = { ...DEFAULTS };
    return cachedSettings;
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('formato inválido');
  } catch {
    const backup = `${file}.corrupt-${Date.now()}.json`;
    try {
      await fs.rename(file, backup);
    } catch (error) {
      throw new Error(`As configurações do Pip estão inválidas e não puderam ser preservadas: ${error.message}`);
    }
    settingsWarning = `O arquivo de configurações estava inválido. Uma cópia foi preservada como ${path.basename(backup)}; o Pip iniciou com valores padrão.`;
    cachedSettings = { ...DEFAULTS };
    return cachedSettings;
  }

  let alfredUrl = DEFAULTS.alfredUrl;
  try {
    alfredUrl = validateAlfredUrl(parsed.alfredUrl || DEFAULTS.alfredUrl);
  } catch {
    settingsWarning = 'O endereço salvo do Alfred era inválido; o Pip voltou ao endereço local padrão.';
  }
  cachedSettings = {
    ...DEFAULTS,
    ...parsed,
    provider: parsed.provider === 'alfred' ? 'alfred' : 'gemini',
    alfredUrl,
    alfredSession: typeof parsed.alfredSession === 'string' ? parsed.alfredSession.slice(0, 120) : DEFAULTS.alfredSession,
    geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : null,
    appearance: sanitizeAppearance(parsed.appearance),
  };
  return cachedSettings;
}

function validateAlfredUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Informe um endereço válido para o Alfred.');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Por segurança, o Alfred precisa usar um endereço HTTP local (loopback).');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.origin;
}

async function getPublicSettings() {
  const settings = await readSettings();
  const providerOverride = (process.env.PIP_AI_PROVIDER || '').toLowerCase();
  return {
    appearance: settings.appearance,
    provider: providerOverride === 'alfred' || providerOverride === 'gemini'
      ? providerOverride
      : settings.provider,
    providerOverridden: providerOverride === 'alfred' || providerOverride === 'gemini',
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY || settings.geminiApiKey),
    hasSavedGeminiApiKey: Boolean(settings.geminiApiKey),
    geminiApiKeyOverridden: Boolean(process.env.GEMINI_API_KEY),
    alfredUrl: process.env.PIP_ALFRED_URL || settings.alfredUrl,
    alfredUrlOverridden: Boolean(process.env.PIP_ALFRED_URL),
    alfredSession: process.env.PIP_ALFRED_SESSION || settings.alfredSession,
    alfredSessionOverridden: Boolean(process.env.PIP_ALFRED_SESSION),
    settingsWarning,
  };
}

async function getProviderSettings() {
  const settings = await readSettings();
  const providerOverride = (process.env.PIP_AI_PROVIDER || '').toLowerCase();
  return {
    provider: providerOverride === 'alfred' || providerOverride === 'gemini'
      ? providerOverride
      : settings.provider,
    alfredUrl: process.env.PIP_ALFRED_URL || settings.alfredUrl,
    alfredSession: process.env.PIP_ALFRED_SESSION || settings.alfredSession,
  };
}

async function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const settings = await readSettings();
  if (!settings.geminiApiKey) return '';
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('O armazenamento seguro do Windows está indisponível.');
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(settings.geminiApiKey, 'base64'));
  return decrypted.result;
}

async function writeSettings(settings) {
  const file = settingsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryFile, file);
  cachedSettings = settings;
}

async function saveSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configurações inválidas.');
  const current = await readSettings();
  const providerOverride = (process.env.PIP_AI_PROVIDER || '').toLowerCase();
  const next = {
    ...current,
    provider: providerOverride === 'alfred' || providerOverride === 'gemini'
      ? current.provider
      : input.provider === 'alfred' ? 'alfred' : input.provider === 'gemini' ? 'gemini' : current.provider,
    alfredUrl: process.env.PIP_ALFRED_URL ? current.alfredUrl : validateAlfredUrl(input.alfredUrl || current.alfredUrl),
    alfredSession: process.env.PIP_ALFRED_SESSION
      ? current.alfredSession
      : typeof input.alfredSession === 'string' && input.alfredSession.trim()
        ? input.alfredSession.trim().slice(0, 120)
        : DEFAULTS.alfredSession,
    appearance: sanitizeAppearance(input.appearance || current.appearance),
  };

  if (input.removeGeminiApiKey === true) {
    next.geminiApiKey = null;
  } else if (typeof input.geminiApiKey === 'string' && input.geminiApiKey.trim()) {
    const apiKey = input.geminiApiKey.trim();
    if (apiKey.length > 1024) throw new Error('A chave do Gemini excede o tamanho permitido.');
    if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('O armazenamento seguro do Windows está indisponível.');
    next.geminiApiKey = (await safeStorage.encryptStringAsync(apiKey)).toString('base64');
  }

  pendingWrite = pendingWrite.catch(() => {}).then(() => writeSettings(next));
  await pendingWrite;
  settingsWarning = '';
  return getPublicSettings();
}

function sanitizeAppearance(value) {
  const appearance = value && typeof value === 'object' ? value : {};
  const color = /^#[0-9a-f]{6}$/i.test(appearance.color) ? appearance.color : DEFAULTS.appearance.color;
  return {
    color,
    outfit: OUTFIT_IDS.has(appearance.outfit) ? appearance.outfit : 'none',
    hair: ['none', 'tuft', 'fringe', 'curly', 'afro'].includes(appearance.hair) ? appearance.hair : 'none',
    accessory: ['none', 'glasses', 'sunglasses', 'crown', 'headphones', 'beanie', 'santa-hat', 'party-hat', 'witch-hat', 'bow', 'pumpkin', 'scarf'].includes(appearance.accessory) ? appearance.accessory : 'none',
  };
}

async function getAppearance() { return (await readSettings()).appearance; }

module.exports = { getPublicSettings, getProviderSettings, getGeminiApiKey, saveSettings, validateAlfredUrl, getAppearance };
