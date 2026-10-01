const NOTIFICATIONS_NEEDING_ATTENTION = new Set([
  'permission_prompt',
  'elicitation_dialog',
  'elicitation_url_dialog',
  'agent_needs_input',
  'idle_prompt',
]);
const NOTIFICATIONS_COMPLETED = new Set(['agent_completed', 'auth_success', 'elicitation_complete']);

function eventForClaudeHook(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  switch (data.hook_event_name) {
    case 'SessionStart':
      return { type: 'happy', text: 'Claude Code iniciou uma sessão.' };
    case 'UserPromptSubmit':
    case 'PreToolUse':
      return { type: 'thinking', text: 'Claude Code está trabalhando.' };
    case 'PermissionRequest': {
      const toolName = typeof data.tool_name === 'string' && /^[\w.-]{1,40}$/.test(data.tool_name) ? ` (${data.tool_name})` : '';
      return { type: 'worried', text: `Claude Code aguarda sua permissão${toolName}.` };
    }
    case 'Notification':
      if (NOTIFICATIONS_NEEDING_ATTENTION.has(data.notification_type)) {
        return { type: 'worried', text: 'Claude Code precisa de você.' };
      }
      if (NOTIFICATIONS_COMPLETED.has(data.notification_type)) {
        return { type: 'happy', text: 'Claude Code concluiu uma etapa.' };
      }
      return null;
    case 'PostToolUseFailure':
    case 'StopFailure':
      return { type: 'sad', text: 'Claude Code encontrou um erro.' };
    case 'Stop':
      return { type: 'happy', text: 'Claude Code concluiu a resposta.' };
    default:
      return null;
  }
}

module.exports = { eventForClaudeHook };
