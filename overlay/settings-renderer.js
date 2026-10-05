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
const appearanceFields = {
      color: document.getElementById('pip-color'), outfit: document.getElementById('pip-outfit'),
      hair: document.getElementById('pip-hair'), accessory: document.getElementById('pip-accessory'),
};
const outfitCatalog = window.PipOutfitCatalog;
const outfitCategoryList = document.getElementById('outfit-categories');
const outfitGrid = document.getElementById('outfit-grid');
const hairGrid = document.getElementById('hair-grid');
const accessoryGrid = document.getElementById('accessory-grid');
const hairOptions = [{ value: 'none', name: 'Sem cabelo' }, { value: 'tuft', name: 'Topete' }, { value: 'fringe', name: 'Franja' }, { value: 'curly', name: 'Cachos' }, { value: 'afro', name: 'Cabelo afro' }];
const accessoryOptions = [
      { value: 'none', name: 'Sem acessório' }, { value: 'beanie', name: 'Gorro' }, { value: 'santa-hat', name: 'Gorro de Natal' },
      { value: 'party-hat', name: 'Chapéu de festa' }, { value: 'witch-hat', name: 'Chapéu de bruxa' }, { value: 'crown', name: 'Coroa' },
      { value: 'sunglasses', name: 'Óculos escuros' }, { value: 'glasses', name: 'Óculos' }, { value: 'headphones', name: 'Fones de ouvido' },
      { value: 'scarf', name: 'Cachecol' }, { value: 'pumpkin', name: 'Abóbora' }, { value: 'bow', name: 'Laço' },
];
let activeOutfitCategory = 'Todas';
for (const outfit of outfitCatalog) {
      const option = document.createElement('option'); option.value = outfit.id; option.textContent = outfit.name;
      appearanceFields.outfit.append(option);
}
function readAppearance() { return Object.fromEntries(Object.entries(appearanceFields).map(([key, field]) => [key, field.value])); }
function showTab(appearance) {
      document.getElementById('general-panel').hidden = appearance;
      document.getElementById('appearance-panel').hidden = !appearance;
      document.getElementById('tab-general').classList.toggle('active', !appearance);
      document.getElementById('tab-appearance').classList.toggle('active', appearance);
      document.getElementById('tab-general').setAttribute('aria-selected', String(!appearance));
      document.getElementById('tab-appearance').setAttribute('aria-selected', String(appearance));
}
document.getElementById('tab-general').addEventListener('click', () => showTab(false));
document.getElementById('tab-appearance').addEventListener('click', () => showTab(true));
function drawChoiceThumbnail(canvas, key, value) {
      const ctx = canvas.getContext('2d');
      const graphics = window.PipPetGraphics.createPetGraphics(ctx, { happy: '#d7e4d8', joy: '#f0dfae', angry: '#e62424' });
      graphics.setBaseColor(appearanceFields.color.value || '#d4d7d4');
      const scale = Math.min(canvas.width / 140, canvas.height / 90);
      ctx.setTransform(scale, 0, 0, scale, 0, 5); ctx.clearRect(0, 0, 140, 90);
      const cx = 70, cy = 46, w = 64, h = 42, top = cy - h / 2;
      const colors = graphics.getShellGradientColors({});
      const shell = ctx.createLinearGradient(cx, top, cx, cy + h / 2);
      shell.addColorStop(0, colors[0]); shell.addColorStop(0.16, colors[1]); shell.addColorStop(0.55, colors[2]); shell.addColorStop(1, colors[3]);
      ctx.fillStyle = shell; ctx.shadowColor = '#0009'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
      ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, h * 0.34); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      const selectedOutfit = key === 'outfit' ? value : appearanceFields.outfit.value;
      graphics.drawOutfit(cx, cy, w, h, selectedOutfit);
      if (key === 'outfit' || key === 'hair' || key === 'accessory') {
        if (key === 'hair') graphics.drawHair(cx, top, value);
        if (key === 'accessory' && value !== 'none' && value !== 'headphones') graphics.drawAccessory(cx, cy, top, w, value);
        if (key === 'accessory' && value === 'headphones') graphics.drawHeadsetBand(cx, top, w, 1);
      }
      ctx.fillStyle = '#111312';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * 14, cy - 3, 4, 7, 0, 0, Math.PI * 2); ctx.fill(); }
      graphics.drawOutfitFace(cx, cy, w, h, selectedOutfit);
      if (key === 'outfit' && selectedOutfit === 'none') graphics.drawSpark(cx + 26, top - 1, 2.4, 0.8, -0.3);
      if (key === 'accessory' && value === 'headphones') graphics.drawHeadsetCups(cx, cy, w, 1);
}
function renderOutfitCategories() {
      outfitCategoryList.replaceChildren();
      const categories = ['Todas', ...new Set(outfitCatalog.map((outfit) => outfit.category))];
      for (const category of categories) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-category';
        button.textContent = category; button.setAttribute('aria-pressed', String(category === activeOutfitCategory));
        button.addEventListener('click', () => { activeOutfitCategory = category; renderOutfitCategories(); renderAppearanceGrids(); });
        outfitCategoryList.append(button);
      }
}
function renderChoiceGrid(grid, key, options) {
      grid.replaceChildren();
      for (const option of options) {
        const value = key === 'outfit' ? option.id : option.value;
        const name = option.name;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-card';
        button.setAttribute('aria-pressed', String(appearanceFields[key].value === value));
        button.setAttribute('aria-label', name); button.title = name;
        const thumbnail = document.createElement('canvas'); thumbnail.width = 84; thumbnail.height = 68;
        thumbnail.className = 'outfit-thumbnail'; drawChoiceThumbnail(thumbnail, key, value);
        button.append(thumbnail);
        button.addEventListener('click', () => {
          appearanceFields[key].value = value;
          renderAppearanceGrids(); reactToAppearanceChange();
        });
        grid.append(button);
      }
}
function renderAppearanceGrids() {
      const visibleOutfits = activeOutfitCategory === 'Todas'
        ? outfitCatalog
        : outfitCatalog.filter((outfit) => outfit.category === activeOutfitCategory);
      renderChoiceGrid(outfitGrid, 'outfit', visibleOutfits);
      renderChoiceGrid(hairGrid, 'hair', hairOptions);
      renderChoiceGrid(accessoryGrid, 'accessory', accessoryOptions);
}
try {
      renderOutfitCategories();
      renderAppearanceGrids();
} catch (error) {
      console.error('Não foi possível montar as miniaturas de aparência do Pip.', error);
      status.textContent = 'As miniaturas não carregaram. A aba visual continua disponível; reinicie as configurações para tentar novamente.';
}
const previewCanvas = document.getElementById('pip-preview');
const previewContext = previewCanvas.getContext('2d');
const previewGraphics = window.PipPetGraphics.createPetGraphics(previewContext, {
      happy: '#d7e4d8', joy: '#f0dfae', angry: '#e62424',
});
let previewReactionUntil = 0;
let previewBlinkAt = performance.now() + 2400;
let previewBlinkStart = 0;
let previewFrameAt = 0;
function drawAppearancePreview(timestamp = performance.now()) {
      previewGraphics.setBaseColor(appearanceFields.color.value);
      const { outfit, hair, accessory } = readAppearance();
      previewFrameAt = timestamp;
      const t = timestamp / 1000;
      const joy = timestamp < previewReactionUntil ? Math.min(1, (previewReactionUntil - timestamp) / 320) : 0;
      if (timestamp >= previewBlinkAt && !previewBlinkStart) previewBlinkStart = timestamp;
      let blink = 0;
      if (previewBlinkStart) {
        const blinkProgress = (timestamp - previewBlinkStart) / 130;
        blink = blinkProgress < 1 ? Math.sin(blinkProgress * Math.PI) : 0;
        if (blinkProgress >= 1) { previewBlinkStart = 0; previewBlinkAt = timestamp + 2500 + Math.random() * 2200; }
      }
      previewContext.setTransform(2, 0, 0, 2, 0, 0);
      previewContext.clearRect(0, 0, 140, 90);
      const cx = 70, cy = 44 + Math.sin(t * 2.5) * 1.2;
      const squash = joy > 0 ? -Math.sin((1 - joy) * Math.PI) * 0.045 : 0;
      const w = 64 * (1 + squash), h = 42 * (1 - squash);
      const top = cy - h / 2, bottom = cy + h / 2, left = cx - w / 2, right = cx + w / 2;
      const radius = h * 0.34;
      previewContext.save(); previewContext.translate(cx, cy); previewContext.rotate(Math.sin(t * 1.2) * 0.012); previewContext.translate(-cx, -cy);
      if (accessory === 'headphones') previewGraphics.drawHeadsetBand(cx, top, w, 1);
      const shell = previewContext.createLinearGradient(cx, top, cx, bottom);
      const shellColors = previewGraphics.getShellGradientColors({});
      shell.addColorStop(0, shellColors[0]); shell.addColorStop(0.16, shellColors[1]);
      shell.addColorStop(0.55, shellColors[2]); shell.addColorStop(1, shellColors[3]);
      previewContext.fillStyle = shell;
      previewContext.shadowColor = '#00000055'; previewContext.shadowBlur = 8; previewContext.shadowOffsetY = 3;
      previewContext.beginPath(); previewContext.roundRect(left, top, w, h, radius); previewContext.fill();
      previewContext.shadowColor = 'transparent'; previewContext.shadowBlur = 0; previewContext.shadowOffsetY = 0;
      previewGraphics.drawOutfit(cx, cy, w, h, outfit);
      previewContext.save(); previewContext.beginPath(); previewContext.roundRect(left, top, w, h, radius); previewContext.clip();
      const highlight = previewContext.createRadialGradient(cx - w * 0.28, top + h * 0.18, 1, cx - w * 0.28, top + h * 0.18, w * 0.72);
      highlight.addColorStop(0, '#ffffffa8'); highlight.addColorStop(0.42, '#ffffff38'); highlight.addColorStop(1, '#ffffff00');
      previewContext.globalAlpha = previewGraphics.getBaseHighlightAlpha(); previewContext.fillStyle = highlight; previewContext.fillRect(left, top, w, h); previewContext.restore();
      previewContext.globalAlpha = 0.5; previewContext.strokeStyle = previewGraphics.getShellOutlineColor({}); previewContext.lineWidth = 1;
      previewContext.beginPath(); previewContext.roundRect(left, top, w, h, radius); previewContext.stroke(); previewContext.globalAlpha = 1;
      if (accessory === 'headphones') previewGraphics.drawHeadsetCups(cx, cy, w, 1);
      previewGraphics.drawHair(cx, top, hair);
      if (accessory !== 'none' && accessory !== 'headphones') previewGraphics.drawAccessory(cx, cy, top, w, accessory);
      const eyeOpen = Math.max(0.06, 1 - blink);
      previewContext.fillStyle = '#111312';
      for (const side of [-1, 1]) {
        const ex = cx + side * 14 + Math.sin(t * 0.7) * 0.5;
        if (eyeOpen < 0.12) { previewContext.strokeStyle = '#111312'; previewContext.lineWidth = 2; previewContext.beginPath(); previewContext.moveTo(ex - 4, cy - 3); previewContext.lineTo(ex + 4, cy - 3); previewContext.stroke(); }
        else { previewContext.beginPath(); previewContext.ellipse(ex, cy - 3, 4.2, 7.2 * eyeOpen, 0, 0, Math.PI * 2); previewContext.fill(); previewContext.fillStyle = '#ffffffb0'; previewContext.beginPath(); previewContext.arc(ex - 1.1, cy - 5.5, 1.15, 0, Math.PI * 2); previewContext.fill(); previewContext.fillStyle = '#111312'; }
      }
      previewGraphics.drawOutfitFace(cx, cy, w, h, outfit);
      if (joy > 0.2) {
        previewGraphics.drawSpark(cx - 25, cy - 22 + Math.sin(t * 3) * 2, 4, joy * 0.8, t * 0.3);
        previewGraphics.drawSpark(cx + 25, cy + 14 + Math.sin(t * 4) * 2, 3, joy * 0.65, -t * 0.25);
      }
      previewContext.restore();
      if (!document.hidden) requestAnimationFrame(drawAppearancePreview);
}
function reactToAppearanceChange() {
      previewReactionUntil = performance.now() + 1000;
}
Object.values(appearanceFields).forEach((field) => field.addEventListener('change', reactToAppearanceChange));
appearanceFields.color.addEventListener('input', renderAppearanceGrids);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { previewFrameAt = 0; requestAnimationFrame(drawAppearancePreview); } });
requestAnimationFrame(drawAppearancePreview);
document.getElementById('appearance-save').addEventListener('click', () => {
      document.getElementById('appearance-status').textContent = 'Salvando aparência…';
      saveButton.click();
});

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
          appearance: readAppearance(),
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
        document.getElementById('appearance-status').textContent = 'A aparência do Pip foi salva.';
      } catch (error) {
        status.textContent = error.message || 'Não foi possível salvar as configurações.';
        document.getElementById('appearance-status').textContent = error.message || 'Não foi possível salvar a aparência.';
      } finally {
        saveButton.disabled = false;
      }
});

window.settingsApi.load().then((settings) => {
      loadedSettings = settings;
      for (const [key, field] of Object.entries(appearanceFields)) field.value = settings.appearance?.[key] || ({ color: '#d4d7d4', outfit: 'none', hair: 'none', accessory: 'none' })[key];
      renderAppearanceGrids();
      reactToAppearanceChange();
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
