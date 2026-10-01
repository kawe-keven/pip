function buildPrompt(payload, { maxChars = 512_000 } = {}) {
  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  const code = typeof payload.code === 'string' ? payload.code.slice(0, 12_000) : '';
  const file = typeof payload.file === 'string' ? payload.file : '';
  const language = typeof payload.lang === 'string' ? payload.lang : '';
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 3) : [];
  if (!question) throw new Error('Escreva uma pergunta para o Pip.');
  const limit = Number.isSafeInteger(maxChars) && maxChars > 0 ? maxChars : 512_000;
  if (question.length > limit) throw new Error(`A pergunta excede o limite de ${limit} caracteres do provedor.`);

  const sections = attachments.map((attachment) => {
    const name = typeof attachment?.name === 'string'
      ? attachment.name.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 180)
      : 'arquivo';
    const content = typeof attachment?.content === 'string' ? attachment.content.slice(0, 96_000) : '';
    return { label: `Arquivo anexado: ${name}`, language: 'text', content };
  }).filter((section) => section.content);

  if (code || file) {
    const safeFile = file.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 180);
    const safeLanguage = /^[\w.+-]{0,40}$/.test(language) ? language : 'text';
    sections.push({
      label: safeFile ? `Contexto do editor: ${safeFile}` : 'Contexto do editor',
      language: safeLanguage,
      content: code,
    });
  }

  let prompt = question;
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const remaining = limit - prompt.length;
    const sectionsLeft = sections.length - index;
    const budget = Math.floor(remaining / sectionsLeft);
    const prefix = `\n\n${section.label}\n\`\`\`${section.language}\n`;
    const suffix = '\n\`\`\`';
    const contentBudget = budget - prefix.length - suffix.length;
    if (contentBudget <= 0) break;

    const truncationNote = '\n[… contexto truncado pelo limite do provedor]';
    const content = section.content.length > contentBudget
      ? contentBudget > truncationNote.length
        ? `${section.content.slice(0, contentBudget - truncationNote.length)}${truncationNote}`
        : section.content.slice(0, contentBudget)
      : section.content;
    prompt += `${prefix}${content}${suffix}`;
  }
  return prompt;
}

function loopbackUrl(value, fallback) {
  try {
    const url = new URL(value || fallback);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
      return new URL(fallback);
    }
    return url;
  } catch {
    return new URL(fallback);
  }
}

function providerSuccess(text) {
  return { ok: true, text };
}

function providerFailure(text) {
  return { ok: false, text };
}

module.exports = { buildPrompt, loopbackUrl, providerSuccess, providerFailure };
