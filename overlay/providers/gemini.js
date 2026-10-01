const { buildPrompt, providerSuccess, providerFailure } = require('./shared');

const conversation = [];
const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_CHARS = 16_000;
const MAX_HISTORY_ITEM_CHARS = MAX_HISTORY_CHARS / 2;
let conversationQueue = Promise.resolve();

function rememberTurn(userText, modelText) {
  conversation.push(
    { role: 'user', parts: [{ text: userText.slice(0, MAX_HISTORY_ITEM_CHARS) }] },
    { role: 'model', parts: [{ text: modelText.slice(0, MAX_HISTORY_ITEM_CHARS) }] },
  );
  while (conversation.length > MAX_HISTORY_MESSAGES) conversation.splice(0, 2);
  while (conversation.length > 2 && conversation.reduce((sum, turn) => sum + turn.parts[0].text.length, 0) > MAX_HISTORY_CHARS) {
    conversation.splice(0, 2);
  }
}

function askGemini(payload, savedKey = '', externalSignal) {
  const currentTurn = conversationQueue.catch(() => {}).then(() => performGeminiAsk(payload, savedKey, externalSignal));
  conversationQueue = currentTurn.then(() => undefined, () => undefined);
  return currentTurn;
}

async function performGeminiAsk(payload, savedKey, externalSignal) {
  if (externalSignal?.aborted) throw externalSignal.reason || Object.assign(new Error('solicitação cancelada'), { name: 'AbortError' });
  const key = process.env.GEMINI_API_KEY || savedKey;
  if (!key) return providerFailure('Adicione sua chave do Gemini nas configurações do Pip.');

  const model = process.env.PIP_MODEL || 'gemini-3.5-flash';
  let prompt;
  try {
    prompt = buildPrompt(payload);
  } catch (error) {
    return providerFailure(error.message || 'Não consegui preparar essa pergunta.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let externallyCancelled = false;
  const cancel = () => {
    externallyCancelled = true;
    controller.abort(externalSignal.reason);
  };
  if (externalSignal?.aborted) cancel();
  else externalSignal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Você é Pip, um mascote de código simpático. Responda em português, de forma clara e direta.' }] },
        contents: [...conversation, { role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    const result = await response.json();
    if (!response.ok) return providerFailure(result.error?.message || `A API do Gemini respondeu com erro ${response.status}.`);
    const answer = result.candidates?.[0]?.content?.parts?.map((part) => part.text).join('');
    if (!answer) return providerFailure(result.error?.message || 'Não recebi uma resposta do Gemini.');
    rememberTurn(prompt, answer);
    return providerSuccess(answer);
  } catch (error) {
    if (externallyCancelled) throw error;
    return providerFailure(error.name === 'AbortError'
      ? 'A resposta demorou demais. Tente novamente.'
      : 'Não consegui conectar à API do Gemini. Verifique sua conexão e a chave de API.');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

module.exports = { askGemini };
