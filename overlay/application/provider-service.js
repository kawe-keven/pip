const { failure } = require('./provider-result');

function createProviderService({ settingsRepository, getGeminiApiKey, providers, environment = {} }) {
  async function ask(payload, { signal } = {}) {
    const settings = await settingsRepository.getProviderSettings();
    const providerName = settings.provider.toLowerCase();
    const provider = providers[providerName];
    if (!provider) return failure(`Provedor "${providerName}" não reconhecido. Use "gemini" ou "alfred".`);

    const result = providerName === 'gemini'
      ? await provider.ask(payload, await getGeminiApiKey(), signal)
      : await provider.ask(payload, settings, signal);
    return {
      ...result,
      provider: providerName,
      model: providerName === 'gemini' ? environment.PIP_MODEL || 'gemini-3.5-flash' : 'Alfred local',
    };
  }

  function getProviderConfiguration() {
    return settingsRepository.getProviderSettings();
  }

  return { ask, getProviderConfiguration };
}

module.exports = { createProviderService };
