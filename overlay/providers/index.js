const { askGemini } = require('./gemini');
const { askAlfred } = require('./alfred');
const settingsStore = require('../settings-store');
const { providerFailure } = require('./shared');

async function ask(payload, { signal } = {}) {
  const settings = await settingsStore.getProviderSettings();
  const provider = settings.provider.toLowerCase();
  if (provider === 'gemini') return askGemini(payload, await settingsStore.getGeminiApiKey(), signal);
  if (provider === 'alfred') return askAlfred(payload, settings, signal);
  return providerFailure(`Provedor "${provider}" não reconhecido. Use "gemini" ou "alfred".`);
}

async function getProviderConfiguration() {
  return settingsStore.getProviderSettings();
}

module.exports = { ask, getProviderConfiguration };
