const { app } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 20_000;
let pendingWrite = Promise.resolve();

function conversationsPath() {
  return path.join(app.getPath('userData'), 'conversations.json');
}

async function readConversations() {
  try {
    const value = JSON.parse(await fs.readFile(conversationsPath(), 'utf8'));
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.id === 'string' && Array.isArray(item.messages))
      .slice(0, MAX_CONVERSATIONS);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Não foi possível ler as conversas salvas: ${error.message}`);
  }
}

async function listConversations() {
  const conversations = await readConversations();
  return conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

async function getConversation(id) {
  if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) return null;
  const conversations = await readConversations();
  return conversations.find((conversation) => conversation.id === id) || null;
}

async function saveConversation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Conversa inválida.');
  if (typeof input.id !== 'string' || !/^[\w-]{1,80}$/.test(input.id)) throw new Error('Identificador da conversa inválido.');
  if (!Array.isArray(input.messages)) throw new Error('Mensagens da conversa inválidas.');

  const messages = input.messages.slice(-MAX_MESSAGES).map((message) => {
    if (!message || !['user', 'pip'].includes(message.role) || typeof message.text !== 'string') {
      throw new Error('Uma mensagem da conversa é inválida.');
    }
    return { role: message.role, text: message.text.slice(0, MAX_MESSAGE_CHARS) };
  });
  if (!messages.length) return;

  const firstQuestion = messages.find((message) => message.role === 'user')?.text || '';
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim().slice(0, 80)
    : firstQuestion.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Conversa com o Pip';
  const conversation = { id: input.id, title, updatedAt: new Date().toISOString(), messages };

  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const conversations = await readConversations();
    const next = [conversation, ...conversations.filter((item) => item.id !== conversation.id)]
      .slice(0, MAX_CONVERSATIONS);
    await writeConversations(next);
  });
  await pendingWrite;
}

async function deleteConversation(id) {
  if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('Identificador da conversa inválido.');
  let removed = false;
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const conversations = await readConversations();
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    removed = remaining.length !== conversations.length;
    if (removed) await writeConversations(remaining);
  });
  await pendingWrite;
  return removed;
}

async function writeConversations(conversations) {
  const file = conversationsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(conversations, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryFile, file);
}

module.exports = { listConversations, getConversation, saveConversation, deleteConversation };
