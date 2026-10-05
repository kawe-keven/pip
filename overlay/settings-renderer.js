const provider = document.getElementById('provider');
const geminiSection = document.getElementById('gemini-section');
const alfredSection = document.getElementById('alfred-section');
const apiKey = document.getElementById('api-key');
const removeKey = document.getElementById('remove-key');
const saveButton = document.getElementById('save');
const alfredCheckButton = document.getElementById('alfred-check');
const alfredConnectionStatus = document.getElementById('alfred-connection-status');
const windowsStartupSection = document.getElementById('windows-startup-section');
const startWithWindows = document.getElementById('start-with-windows');
const claudeCodeSection = document.getElementById('claude-code-section');
const claudeCodeHooks = document.getElementById('claude-code-hooks');
const claudeCodeNote = document.getElementById('claude-code-note');
const status = document.getElementById('status');
const usageStatus = document.getElementById('usage-status');
let loadedSettings;

function updateSections() {
      const gemini = provider.value === 'gemini';
      geminiSection.hidden = !gemini;
      alfredSection.hidden = gemini;
}

function updateKeyState(settings) {
      const keyState = document.getElementById('key-state');
      if (settings.geminiApiKeyOverridden) {
        keyState.textContent = 'A variável GEMINI_API_KEY está ativa e substitui a chave salva.';
      } else if (settings.hasSavedGeminiApiKey) {
        keyState.textContent = 'Chave salva com proteção do Windows. Deixe em branco para mantê-la.';
      } else {
        keyState.textContent = 'A chave será criptografada pelo Windows e não voltará a ser exibida aqui.';
      }
      removeKey.disabled = !settings.hasSavedGeminiApiKey;
}

function drawUsageChart({ svg, data, valueFor, className, suffix }) {
      const ns = 'http://www.w3.org/2000/svg';
      svg.replaceChildren();
      const width = 500;
      const top = 12;
      const bottom = 140;
      const max = Math.max(1, ...data.map(valueFor));
      for (let line = 0; line <= 3; line += 1) {
        const y = top + (bottom - top) * line / 3;
        const grid = document.createElementNS(ns, 'line');
        grid.setAttribute('x1', '32'); grid.setAttribute('x2', '495'); grid.setAttribute('y1', y); grid.setAttribute('y2', y); grid.setAttribute('class', 'grid');
        svg.append(grid);
      }
      const slot = 463 / Math.max(1, data.length);
      data.forEach((item, index) => {
        const value = valueFor(item);
        const height = value ? Math.max(2, (bottom - top - 8) * value / max) : 0;
        const bar = document.createElementNS(ns, 'rect');
        bar.setAttribute('x', 35 + index * slot + slot * 0.2);
        bar.setAttribute('y', bottom - height);
        bar.setAttribute('width', Math.max(2, slot * 0.6));
        bar.setAttribute('height', height);
        bar.setAttribute('rx', '3'); bar.setAttribute('class', className);
        bar.setAttribute('aria-label', `${item.label}: ${value.toLocaleString('pt-BR')} ${suffix}`);
        const title = document.createElementNS(ns, 'title'); title.textContent = `${item.label}: ${value.toLocaleString('pt-BR')} ${suffix}`; bar.append(title);
        svg.append(bar);
        if (index % 2 === 0 || index === data.length - 1) {
          const label = document.createElementNS(ns, 'text');
          label.setAttribute('x', 35 + index * slot); label.setAttribute('y', '158');
          label.textContent = item.label.slice(0, 5); svg.append(label);
        }
      });
      const valueLabel = document.createElementNS(ns, 'text');
      valueLabel.setAttribute('x', '0'); valueLabel.setAttribute('y', '15'); valueLabel.textContent = max.toLocaleString('pt-BR'); svg.append(valueLabel);
}

async function loadUsage() {
      try {
        const summary = await window.settingsApi.getUsage();
        const days = [];
        for (let offset = 13; offset >= 0; offset -= 1) {
          const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - offset);
          const key = date.toISOString().slice(0, 10);
          days.push({ key, label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date) });
        }
        const aiRows = new Map(summary.aiByDate.map((row) => [`${row.date}|${row.provider}`, row]));
        const dailyAi = days.map((day) => ({ label: day.label, total: [...aiRows.values()].filter((row) => row.date === day.key).reduce((sum, row) => sum + row.tokens, 0) }));
    drawUsageChart({ svg: document.getElementById('ai-usage-chart'), data: dailyAi, valueFor: (row) => row.total, className: 'bar-ai', suffix: 'tokens' });
        const ideRows = new Map(summary.ideByDate.map((row) => [row.date, row]));
        const dailyIde = days.map((day) => ({ label: day.label, total: Object.entries(ideRows.get(day.key) || {}).filter(([key]) => key !== 'date').reduce((sum, [, value]) => sum + value, 0) }));
    drawUsageChart({ svg: document.getElementById('ide-usage-chart'), data: dailyIde, valueFor: (row) => row.total, className: 'bar-ide', suffix: 'perguntas' });
        const editors = document.getElementById('usage-ides'); editors.replaceChildren();
        for (const item of summary.ideTotals) {
          const row = document.createElement('div'); row.className = 'usage-provider';
          const name = document.createElement('span'); name.textContent = item.ide;
          const value = document.createElement('strong'); value.textContent = `${item.prompts.toLocaleString('pt-BR')} perguntas`;
          row.append(name, value); editors.append(row);
        }
        const providers = document.getElementById('usage-providers'); providers.replaceChildren();
        if (!summary.aiByProvider.length) {
          const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Ainda não há chamadas registradas pelo Pip.'; providers.append(empty);
        }
        for (const item of summary.aiByProvider) {
          const row = document.createElement('div'); row.className = 'usage-provider';
          const name = document.createElement('span'); name.textContent = `${item.provider}${item.model ? ` · ${item.model}` : ''}`;
          const value = document.createElement('strong'); value.textContent = item.tokenDataAvailable ? `${item.tokens.toLocaleString('pt-BR')} tokens · ${item.requests} chamadas` : `tokens não informados · ${item.requests} chamadas`;
          row.append(name, value); providers.append(row);
        }
        const reset = new Date(summary.reset.at);
        document.getElementById('usage-reset').textContent = `Gemini: a cota diária de requisições (RPD) reinicia por volta de ${reset.toLocaleString('pt-BR')} (horário do Pacífico). Os limites por minuto e os valores de cota variam por modelo e projeto.`;
        usageStatus.textContent = `${summary.note} Perguntas por IDE são contagens de solicitações, não tokens.`;
      } catch (error) {
        usageStatus.textContent = error.message || 'Não foi possível carregar o histórico de uso.';
      }
}

provider.addEventListener('change', updateSections);
document.getElementById('alfred-url').addEventListener('input', () => {
      alfredConnectionStatus.dataset.state = '';
      alfredConnectionStatus.textContent = '';
});
removeKey.addEventListener('change', () => { apiKey.disabled = removeKey.checked; });
apiKey.addEventListener('input', () => { removeKey.disabled = apiKey.value.length > 0; });
alfredCheckButton.addEventListener('click', async () => {
      alfredCheckButton.disabled = true;
      alfredConnectionStatus.dataset.state = '';
      alfredConnectionStatus.textContent = 'Verificando endereço local…';
      try {
        const result = await window.settingsApi.testAlfredConnection(document.getElementById('alfred-url').value);
        alfredConnectionStatus.dataset.state = result.ok ? 'connected' : 'offline';
        alfredConnectionStatus.textContent = result.message;
      } catch (error) {
        alfredConnectionStatus.dataset.state = 'offline';
        alfredConnectionStatus.textContent = error.message || 'Não foi possível verificar o Alfred.';
      } finally {
        alfredCheckButton.disabled = false;
      }
});

saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      status.textContent = 'Salvando…';
      try {
        loadedSettings = await window.settingsApi.save({
          provider: provider.value,
          geminiApiKey: apiKey.value,
          removeGeminiApiKey: removeKey.checked,
          alfredUrl: document.getElementById('alfred-url').value,
          alfredSession: document.getElementById('alfred-session').value,
          startWithWindows: startWithWindows.checked,
          claudeCodeHooks: claudeCodeHooks.checked,
        });
        apiKey.value = '';
        removeKey.checked = false;
        apiKey.disabled = false;
        updateKeyState(loadedSettings);
        claudeCodeHooks.checked = loadedSettings.claudeCodeHooksEnabled === true;
        claudeCodeNote.textContent = loadedSettings.claudeCodeHooksWarning
          || (loadedSettings.claudeCodeHooksBackupCreated
            ? 'Hooks ativados. Uma cópia das configurações anteriores foi preservada ao lado do arquivo do Claude Code.'
            : 'O Pip registra hooks locais no Claude Code e faz uma cópia de segurança das configurações existentes. Os hooks mostram estados; não enviam prompts, comandos ou arquivos ao Pip.');
        status.textContent = loadedSettings.startupWarning || loadedSettings.claudeCodeHooksWarning || 'Configurações salvas.';
      } catch (error) {
        status.textContent = error.message || 'Não foi possível salvar as configurações.';
      } finally {
        saveButton.disabled = false;
      }
});

window.settingsApi.load().then((settings) => {
      loadedSettings = settings;
      windowsStartupSection.hidden = window.settingsApi.platform !== 'win32';
      claudeCodeSection.hidden = window.settingsApi.platform !== 'win32';
      startWithWindows.checked = settings.startWithWindows === true;
      claudeCodeHooks.checked = settings.claudeCodeHooksEnabled === true;
      provider.value = settings.provider;
      provider.disabled = settings.providerOverridden;
      document.getElementById('override-note').hidden = !settings.providerOverridden;
      document.getElementById('alfred-url').value = settings.alfredUrl;
      document.getElementById('alfred-url').disabled = settings.alfredUrlOverridden;
      document.getElementById('url-note').textContent = settings.alfredUrlOverridden
        ? 'O endereço está definido por uma variável de ambiente.'
        : 'Por segurança, só aceito endereços locais.';
      document.getElementById('alfred-session').value = settings.alfredSession;
      document.getElementById('alfred-session').disabled = settings.alfredSessionOverridden;
      updateKeyState(settings);
      updateSections();
      if (settings.claudeCodeHooksWarning) claudeCodeNote.textContent = settings.claudeCodeHooksWarning;
      if (settings.settingsWarning) status.textContent = settings.settingsWarning;
      loadUsage();
}).catch((error) => { status.textContent = error.message || 'Não foi possível carregar as configurações.'; });
