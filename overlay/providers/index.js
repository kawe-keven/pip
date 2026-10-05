const { createProviderService } = require('../application/provider-service');
const { askGemini } = require('./gemini');
const { askAlfred } = require('./alfred');
const settingsRepository = require('../infrastructure/settings-repository');

module.exports = createProviderService({
  settingsRepository,
  getGeminiApiKey: () => settingsRepository.getGeminiApiKey(),
  providers: {
    gemini: { ask: askGemini },
    alfred: { ask: askAlfred },
  },
  environment: process.env,
});
