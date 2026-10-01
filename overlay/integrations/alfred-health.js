const { loopbackUrl } = require('../providers/shared');

async function checkAlfredHealth(value, fetcher = fetch) {
  const url = loopbackUrl(value, 'http://127.0.0.1:8000');
  url.pathname = '/health';
  url.search = '';
  url.hash = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, message: `Alfred respondeu com erro HTTP ${response.status}.` };

    let health;
    try {
      health = await response.json();
    } catch {
      return { ok: false, message: 'O Alfred respondeu com um status inválido.' };
    }
    if (health.status !== 'ok') return { ok: false, message: 'O Alfred respondeu, mas ainda não está pronto.' };
    const service = typeof health.service === 'string' ? health.service : 'Alfred';
    const version = typeof health.version === 'string' ? ` v${health.version}` : '';
    return { ok: true, message: `${service}${version} conectado.` };
  } catch (error) {
    return {
      ok: false,
      message: error.name === 'AbortError'
        ? 'O Alfred não respondeu em até 4 segundos.'
        : 'Não consegui alcançar o Alfred nesse endereço local.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { checkAlfredHealth };
