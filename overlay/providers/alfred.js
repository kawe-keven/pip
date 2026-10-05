const { buildPrompt, loopbackUrl, providerSuccess, providerFailure } = require('./shared');

const ALFRED_MAX_MESSAGE_CHARS = 4096;

async function askAlfred(payload, settings = {}, externalSignal) {
  const base = loopbackUrl(settings.alfredUrl || process.env.PIP_ALFRED_URL, 'http://127.0.0.1:8000');
  base.pathname = '/chat';
  base.search = '';
  base.hash = '';
  const configuredSession = settings.alfredSession || process.env.PIP_ALFRED_SESSION || 'pip-editor';
  const conversationId = typeof payload.conversationId === 'string' && /^[\w-]{1,80}$/.test(payload.conversationId)
    ? payload.conversationId
    : '';
  const sessionId = conversationId
    ? `${configuredSession.slice(0, 104)}-${conversationId.slice(-15)}`
    : configuredSession;

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
        session_id: sessionId,
        message: buildPrompt(payload, { maxChars: ALFRED_MAX_MESSAGE_CHARS }),
        audio_response: false,
      }),
    });
    const result = await response.json();
    if (!response.ok) return providerFailure(result.detail || `Alfred respondeu com erro ${response.status}.`);
    if (!result.response) return providerFailure('Alfred não retornou uma resposta.');
    const usage = result.usage || result.usage_metadata || result.token_usage;
    return providerSuccess(result.response, usage ? {
      inputTokens: usage.inputTokens ?? usage.prompt_tokens ?? usage.prompt_token_count,
      outputTokens: usage.outputTokens ?? usage.completion_tokens ?? usage.candidates_token_count,
      totalTokens: usage.totalTokens ?? usage.total_tokens ?? usage.total_token_count,
    } : null);
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
