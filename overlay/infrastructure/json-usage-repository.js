const fs = require('fs/promises');
const path = require('path');
const { app } = require('electron');

const MAX_DAYS = 180;
let queue = Promise.resolve();

function usagePath() {
  return path.join(app.getPath('userData'), 'usage.json');
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readUsage() {
  try {
    const data = JSON.parse(await fs.readFile(usagePath(), 'utf8'));
    return data && Array.isArray(data.ai) && Array.isArray(data.ides) ? data : { ai: [], ides: [] };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Não foi possível ler o histórico de uso do Pip:', error.message);
    return { ai: [], ides: [] };
  }
}

async function writeUsage(data) {
  const file = usagePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, file);
}

function enqueue(change) {
  queue = queue.catch(() => {}).then(async () => {
    const data = await readUsage();
    change(data);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    data.ai = data.ai.filter((entry) => entry.date >= cutoffDate);
    data.ides = data.ides.filter((entry) => entry.date >= cutoffDate);
    await writeUsage(data);
  });
  return queue;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function recordAi({ provider, model, usage }) {
  const inputTokens = safeCount(usage?.inputTokens);
  const outputTokens = safeCount(usage?.outputTokens);
  const totalTokens = safeCount(usage?.totalTokens) ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  return enqueue((data) => data.ai.push({
    date: localDate(),
    provider: String(provider || 'desconhecido').slice(0, 40),
    model: String(model || '').slice(0, 80),
    inputTokens,
    outputTokens,
    totalTokens,
    requests: 1,
  }));
}

function recordIde(ide) {
  return enqueue((data) => data.ides.push({ date: localDate(), ide, prompts: 1 }));
}

async function getSummary() {
  const data = await queue.catch(() => {}).then(readUsage);
  const aiByDate = new Map();
  const aiByProvider = new Map();
  const ideByDate = new Map();
  const ideTotals = new Map();
  for (const entry of data.ai) {
    const key = `${entry.date}|${entry.provider}`;
    const row = aiByDate.get(key) || { date: entry.date, provider: entry.provider, tokens: 0, tokenDataAvailable: true, requests: 0 };
    if (entry.totalTokens === null) row.tokenDataAvailable = false;
    else row.tokens += entry.totalTokens;
    row.requests += 1;
    aiByDate.set(key, row);
    const providerRow = aiByProvider.get(entry.provider) || { provider: entry.provider, tokens: 0, tokenDataAvailable: true, requests: 0, inputTokens: 0, outputTokens: 0 };
    if (entry.totalTokens === null) providerRow.tokenDataAvailable = false;
    else providerRow.tokens += entry.totalTokens;
    providerRow.inputTokens += entry.inputTokens || 0;
    providerRow.outputTokens += entry.outputTokens || 0;
    providerRow.requests += 1;
    aiByProvider.set(entry.provider, providerRow);
  }
  for (const entry of data.ides) {
    const row = ideByDate.get(entry.date) || { date: entry.date };
    row[entry.ide] = (row[entry.ide] || 0) + 1;
    ideByDate.set(entry.date, row);
    ideTotals.set(entry.ide, (ideTotals.get(entry.ide) || 0) + 1);
  }
  const now = new Date();
  const timezone = 'America/Los_Angeles';
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const nextDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 12));
  const targetParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(nextDay);
  const target = Object.fromEntries(targetParts.map(({ type, value }) => [type, value]));
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' }).formatToParts(nextDay)
    .find(({ type }) => type === 'timeZoneName')?.value?.replace('GMT', '') || '+00';
  const offsetParts = offset.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  const offsetText = offsetParts
    ? `${offsetParts[1]}${offsetParts[2].padStart(2, '0')}:${offsetParts[3] || '00'}`
    : '+00:00';
  const reset = new Date(`${target.year}-${target.month}-${target.day}T00:00:00${offsetText}`);
  return {
    aiByDate: [...aiByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    aiByProvider: [...aiByProvider.values()],
    ideByDate: [...ideByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    ideTotals: [...ideTotals.entries()].map(([ide, prompts]) => ({ ide, prompts })),
    retentionDays: MAX_DAYS,
    reset: { provider: 'Gemini API', at: reset.toISOString(), timezone, basis: 'limite diário de requisições (RPD)' },
    note: 'Tokens medidos: chamadas Gemini feitas pelo Pip e, no Alfred, somente se a resposta incluir uso. Para outras IAs, o Pip não acessa automaticamente o painel da conta. Editores observados: VS Code e Claude Code com os hooks do Pip ativos.'
  };
}

module.exports = { recordAi, recordIde, getSummary };
