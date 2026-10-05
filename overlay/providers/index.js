const { askGemini } = require('./gemini');
const { askAlfred } = require('./alfred');
const settingsStore = require('../settings-store');
const { providerFailure } = require('./shared');

async function ask(payload, { signal } = {}) {
  const settings = await settingsStore.getProviderSettings();
  const provider = settings.provider.toLowerCase();
  if (provider === 'gemini') {
    const result = await askGemini(payload, await settingsStore.getGeminiApiKey(), signal);
    return { ...result, provider, model: process.env.PIP_MODEL || 'gemini-3.5-flash' };
  }
  if (provider === 'alfred') {
    const result = await askAlfred(payload, settings, signal);
    return { ...result, provider, model: 'Alfred local' };
  }
  return providerFailure(`Provedor "${provider}" não reconhecido. Use "gemini" ou "alfred".`);
}

async function getProviderConfiguration() {
  return settingsStore.getProviderSettings();
}

module.exports = { ask, getProviderConfiguration };
