function registerChatIpc({ ipcMain, dialog, getWindow, isOverlaySender, fileAttachments, conversationService, dispatchBridgeRequest }) {
  let pendingAttachments = [];

  ipcMain.handle('files:attach', async (event, filePaths) => {
    assertOverlaySender(event, isOverlaySender);
    pendingAttachments = await fileAttachments.readDroppedFiles(filePaths);
    return describeAttachments(pendingAttachments);
  });

  ipcMain.handle('files:choose', async (event) => {
    assertOverlaySender(event, isOverlaySender);
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Anexar arquivos ao Pip',
      buttonLabel: 'Anexar',
      properties: ['openFile', 'multiSelections', 'showHiddenFiles'],
      filters: [{ name: 'Texto e código', extensions: fileAttachments.FILE_DIALOG_EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    if (result.filePaths.length > fileAttachments.MAX_FILES) {
      throw new Error(`Escolha até ${fileAttachments.MAX_FILES} arquivos por vez.`);
    }
    pendingAttachments = await fileAttachments.readDroppedFiles(result.filePaths);
    return describeAttachments(pendingAttachments);
  });

  ipcMain.handle('files:clear', (event) => {
    assertOverlaySender(event, isOverlaySender);
    pendingAttachments = [];
  });

  ipcMain.handle('chat-ask', async (event, question, requestId, conversationId) => {
    assertOverlaySender(event, isOverlaySender);
    validateQuestion(question);
    validateChatIdentifiers(requestId, conversationId);
    const conversationHistory = await conversationService.getProviderHistory(conversationId);
    const result = await dispatchBridgeRequest('/ask', {
      question,
      requestId,
      conversationId,
      conversationHistory,
      attachments: pendingAttachments,
    }, {
      notify: false,
      localChat: true,
      onProgress: (chunk) => {
        const window = getWindow();
        if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send('ev', { type: 'chat-progress', requestId, chunk });
        }
      },
    });
    if (result.status === 499) return { ok: false, cancelled: true, text: 'Parei por aqui.' };
    if (result.status < 200 || result.status >= 300) {
      throw new Error(result.body.error || 'Não consegui enviar a pergunta.');
    }
    return result.body;
  });

  ipcMain.handle('conversations:list', (event) => {
    assertOverlaySender(event, isOverlaySender);
    return conversationService.listRecent();
  });

  ipcMain.handle('conversations:save', async (event, conversation) => {
    assertOverlaySender(event, isOverlaySender);
    await conversationService.save(conversation);
  });

  ipcMain.handle('conversations:delete', (event, conversationId) => {
    assertOverlaySender(event, isOverlaySender);
    if (typeof conversationId !== 'string' || !/^[\w-]{1,80}$/.test(conversationId)) {
      throw new Error('Identificador da conversa inválido.');
    }
    return conversationService.remove(conversationId);
  });
}

function assertOverlaySender(event, isOverlaySender) {
  if (!isOverlaySender(event)) throw new Error('Origem da solicitação inválida.');
}

function validateQuestion(question) {
  if (typeof question !== 'string' || question.length > 2000) throw new Error('Use até 2.000 caracteres para a pergunta.');
}

function validateChatIdentifiers(requestId, conversationId) {
  if (typeof requestId !== 'string' || !/^pip-overlay-chat-\d+-\d+$/.test(requestId) || requestId.length > 80) {
    throw new Error('Identificador da pergunta inválido.');
  }
  if (typeof conversationId !== 'string' || !/^[\w-]{1,80}$/.test(conversationId)) {
    throw new Error('Identificador da conversa inválido.');
  }
}

function describeAttachments(attachments) {
  return attachments.map(({ name, size }) => ({ name, size }));
}

module.exports = { registerChatIpc };
