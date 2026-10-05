const { buildPrompt, providerSuccess, providerFailure } = require('./shared');

const conversations = new Map();
const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_CHARS = 16_000;
const MAX_HISTORY_ITEM_CHARS = MAX_HISTORY_CHARS / 2;
const conversationQueues = new Map();

function rememberTurn(conversationId, conversation, userText, modelText) {
  conversation.push(
    { role: 'user', parts: [{ text: userText.slice(0, MAX_HISTORY_ITEM_CHARS) }] },
    { role: 'model', parts: [{ text: modelText.slice(0, MAX_HISTORY_ITEM_CHARS) }] },
  );
  while (conversation.length > MAX_HISTORY_MESSAGES) conversation.splice(0, 2);
  while (conversation.length > 2 && conversation.reduce((sum, turn) => sum + turn.parts[0].text.length, 0) > MAX_HISTORY_CHARS) {
    conversation.splice(0, 2);
  }
  conversations.delete(conversationId);
  conversations.set(conversationId, conversation);
  while (conversations.size > 30) conversations.delete(conversations.keys().next().value);
}

function askGemini(payload, savedKey = '', externalSignal, onProgress) {
  const conversationId = getConversationId(payload);
  const previous = conversationQueues.get(conversationId) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => performGeminiAsk(payload, savedKey, externalSignal, onProgress));
  let queued;
  queued = current.finally(() => {
    if (conversationQueues.get(conversationId) === queued) conversationQueues.delete(conversationId);
  });
  conversationQueues.set(conversationId, queued);
  return queued;
}

function getConversationId(payload) {
  return typeof payload.conversationId === 'string' && /^[\w-]{1,80}$/.test(payload.conversationId)
    ? payload.conversationId
    : 'pip-default';
}

async function performGeminiAsk(payload, savedKey, externalSignal, onProgress) {
  if (externalSignal?.aborted) throw externalSignal.reason || Object.assign(new Error('solicitação cancelada'), { name: 'AbortError' });
  const key = process.env.GEMINI_API_KEY || savedKey;
  if (!key) return providerFailure('Adicione sua chave do Gemini nas configurações do Pip.');

  const model = process.env.PIP_MODEL || 'gemini-3.5-flash-lite';
  const conversationId = getConversationId(payload);
  const savedTurns = Array.isArray(payload.conversationHistory)
    ? payload.conversationHistory.slice(-24).filter((turn) =>
      turn && ['user', 'model'].includes(turn.role) && typeof turn.text === 'string')
      .map((turn) => ({ role: turn.role, parts: [{ text: turn.text.slice(0, MAX_HISTORY_ITEM_CHARS) }] }))
    : [];
  const conversation = conversations.get(conversationId) || savedTurns;
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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Você é Pip, um mascote de código simpático. Responda em português, de forma clara e direta.' }] },
        contents: [...conversation, { role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return providerFailure(result.error?.message || `A API do Gemini respondeu com erro ${response.status}.`);
    }
    const { answer, usage } = await readGeminiStream(response, onProgress);
    if (!answer) return providerFailure('Não recebi uma resposta do Gemini.');
    rememberTurn(conversationId, conversation, prompt, answer);
    const metadata = usage || {};
    return providerSuccess(answer, {
      inputTokens: metadata.promptTokenCount,
      outputTokens: metadata.candidatesTokenCount,
      totalTokens: metadata.totalTokenCount,
    });
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

async function readGeminiStream(response, onProgress) {
  if (!response.body?.getReader) throw new Error('O navegador não suporta respostas em fluxo.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let usage;

  function consumeLine(line) {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk;
    try { chunk = JSON.parse(data); } catch { return; }
    const text = chunk.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    if (text) {
      answer += text;
      if (typeof onProgress === 'function') {
        try { onProgress(text); } catch {}
      }
    }
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
    if (!chunk.candidates?.length && chunk.error) throw new Error(chunk.error.message || 'Erro no fluxo do Gemini.');
  }

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      consumeLine(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
    }
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer.replace(/\r$/, ''));
  return { answer, usage };
}

module.exports = { askGemini };
