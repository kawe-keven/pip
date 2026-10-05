const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  onEvent: (cb) => ipcRenderer.on('ev', (_, e) => cb(e)),
  setInteractive: (v) => ipcRenderer.send('interactive', v),
  openChat: () => ipcRenderer.send('chat-open'),
  closeChat: () => ipcRenderer.send('chat-close'),
  cancelAsk: (requestId) => ipcRenderer.send('chat-cancel', requestId),
  openSettings: () => ipcRenderer.send('settings-open'),
  ask: (question, requestId, conversationId) => ipcRenderer.invoke('chat-ask', question, requestId, conversationId),
  listConversations: () => ipcRenderer.invoke('conversations:list'),
  saveConversation: (conversation) => ipcRenderer.invoke('conversations:save', conversation),
  deleteConversation: (conversationId) => ipcRenderer.invoke('conversations:delete', conversationId),
  attachFiles: (files) => {
    const paths = Array.from(files).map((file) => webUtils.getPathForFile(file));
    return ipcRenderer.invoke('files:attach', paths);
  },
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  clearAttachments: () => ipcRenderer.invoke('files:clear'),
});
