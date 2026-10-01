const { buildPrompt, loopbackUrl, providerSuccess, providerFailure } = require('./shared');

const ALFRED_MAX_MESSAGE_CHARS = 4096;

async function askAlfred(payload, settings = {}, externalSignal) {
  const base = loopbackUrl(settings.alfredUrl || process.env.PIP_ALFRED_URL, 'http://127.0.0.1:8000');
  base.pathname = '/chat';
  base.search = '';
  base.hash = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let externallyCancelled = false;
  const cancel = () => {
    externallyCancelled = true;
    controller.abort(externalSignal.reason);
  };
  if (externalSignal?.aborted) cancel();
  else externalSignal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        session_id: settings.alfredSession || process.env.PIP_ALFRED_SESSION || 'pip-editor',
        message: buildPrompt(payload, { maxChars: ALFRED_MAX_MESSAGE_CHARS }),
        audio_response: false,
      }),
    });
    const result = await response.json();
    if (!response.ok) return providerFailure(result.detail || `Alfred respondeu com erro ${response.status}.`);
    if (!result.response) return providerFailure('Alfred não retornou uma resposta.');
    return providerSuccess(result.response);
  } catch (error) {
    if (externallyCancelled) throw error;
    return providerFailure(error.name === 'AbortError'
      ? 'Alfred está demorando para responder. Tente novamente.'
      : 'Não consegui conectar ao Alfred. Confira se o backend está aberto em 127.0.0.1:8000.');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

module.exports = { askAlfred };
