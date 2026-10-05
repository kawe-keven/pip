function createConversationService({ repository }) {
  function listRecent() {
    return repository.listConversations();
  }

  function findById(conversationId) {
    return repository.getConversation(conversationId);
  }

  function save(conversation) {
    return repository.saveConversation(conversation);
  }

  function remove(conversationId) {
    return repository.deleteConversation(conversationId);
  }

  async function getProviderHistory(conversationId) {
    const conversation = await findById(conversationId);
    return (conversation?.messages || []).slice(-25, -1).map((message) => ({
      role: message.role === 'user' ? 'user' : 'model',
      text: message.text,
    }));
  }

  return { listRecent, findById, save, remove, getProviderHistory };
}

module.exports = { createConversationService };
