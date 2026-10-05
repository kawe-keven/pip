const ACTIVE_EVENT_TYPES = new Set(['worried', 'relieved', 'happy', 'sad', 'thinking', 'answer']);

function invalidRequest() {
  return { status: 400, body: { error: 'request must be a JSON object' } };
}

function createBridgeRouter({ ask, emit, revealForEvent, beforeQuestion, hideLater, recordAiUsage, recordIdeUsage, eventForClaudeHook, onPendingChange }) {
  const activeQuestions = new Map();
  const localChatQuestions = new Map();

  function abortQuestion(requestId) {
    if (typeof requestId !== 'string' || requestId.length > 80) return;
    activeQuestions.get(requestId)?.abort();
  }

  function abortLocalQuestions() {
    for (const controller of localChatQuestions.values()) controller.abort();
  }

  function abortAllQuestions() {
    for (const controller of activeQuestions.values()) controller.abort();
  }

  async function dispatch(route, data, options = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return invalidRequest();

    if (route === '/claude-hook') {
      if (data.hook_event_name === 'UserPromptSubmit') ignoreUsageError(recordIdeUsage('Claude Code'));
      const event = eventForClaudeHook(data);
      if (event) await dispatch('/event', event);
      return { status: 200, body: {} };
    }

    if (route === '/event') {
      if (typeof data.type !== 'string' || data.type.length > 40) {
        return { status: 400, body: { error: 'invalid event type' } };
      }
      if (ACTIVE_EVENT_TYPES.has(data.type)) revealForEvent(data.type);
      emit(data);
      return { status: 200, body: {} };
    }

    if (route !== '/ask') return { status: 404, body: { error: 'not found' } };

    return answerQuestion(data, options);
  }

  async function answerQuestion(data, options) {
    const requestId = typeof data.requestId === 'string' && data.requestId.length <= 80 ? data.requestId : null;
    if (requestId && activeQuestions.has(requestId)) {
      return { status: 409, body: { error: 'duplicate request id' } };
    }

    const controller = new AbortController();
    if (requestId) activeQuestions.set(requestId, controller);
    if (options.localChat && requestId) localChatQuestions.set(requestId, controller);
    beforeQuestion();
    onPendingChange(1);
    emit({ type: 'thinking' });

    try {
      const response = await ask(data, { signal: controller.signal });
      if (controller.signal.aborted) {
        throw controller.signal.reason || Object.assign(new Error('solicitação cancelada'), { name: 'AbortError' });
      }
      const result = typeof response === 'string' ? { ok: true, text: response } : response;
      if (result.ok) {
        recordSuccessfulUsage(data, options, result);
        if (options.notify !== false) emit({ type: 'answer', text: result.text });
      } else {
        emit({ type: 'sad', text: result.text });
      }
      return { status: 200, body: result };
    } catch (error) {
      if (error.name === 'AbortError') {
        emit({ type: 'cancelled' });
        return { status: 499, body: { error: 'solicitação cancelada' } };
      }
      emit({ type: 'sad', text: 'Não consegui concluir essa pergunta.' });
      throw error;
    } finally {
      removeQuestion(activeQuestions, requestId, controller);
      removeQuestion(localChatQuestions, requestId, controller);
      onPendingChange(-1);
      hideLater(12000);
    }
  }

  function recordSuccessfulUsage(data, options, result) {
    const source = data.source === 'VS Code' ? 'VS Code' : options.localChat ? 'Pip' : '';
    if (source === 'VS Code') ignoreUsageError(recordIdeUsage(source));
    if (result.provider) ignoreUsageError(recordAiUsage({ provider: result.provider, model: result.model, usage: result.usage }));
  }

  function ignoreUsageError(operation) {
    Promise.resolve(operation).catch(() => {});
  }

  return { dispatch, abortQuestion, abortLocalQuestions, abortAllQuestions };
}

function removeQuestion(questions, requestId, controller) {
  if (requestId && questions.get(requestId) === controller) questions.delete(requestId);
}

module.exports = { createBridgeRouter };
