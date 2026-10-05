const vscode = require('vscode');
const { randomUUID } = require('crypto');
const { post: bridgePost } = require('./bridge');

const DEFAULT_ENDPOINT = 'http://127.0.0.1:7777';
const IDLE_MS = 3 * 60 * 1000;
const CHAT_CONTEXT_CHAR_LIMIT = 12_000;
const CHAT_REFERENCE_LIMIT = 3;

async function collectChatContext(request, vscode) {
  const references = Array.isArray(request.references) ? request.references : [];
  const files = [];
  const seen = new Set();
  for (const reference of references) {
    const value = reference?.value;
    const uri = value?.scheme ? value : value?.uri?.scheme ? value.uri : null;
    if (!uri) continue;
    const key = typeof uri.toString === 'function' ? uri.toString() : `${uri.scheme}:${uri.fsPath || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({ uri, range: value?.uri ? value.range : undefined });
    if (files.length >= CHAT_REFERENCE_LIMIT) break;
  }

  if (files.length) {
    const sections = [];
    let usedChars = 0;
    const loadedPaths = [];
    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file.uri);
        const relativePath = vscode.workspace.asRelativePath(file.uri).replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 180);
        const header = `--- ${relativePath} ---\n`;
        const remaining = CHAT_CONTEXT_CHAR_LIMIT - usedChars;
        if (remaining <= header.length) break;
        const text = document.getText(file.range);
        const content = text.slice(0, remaining - header.length);
        sections.push(`${header}${content}`);
        loadedPaths.push(relativePath);
        usedChars += header.length + content.length;
        if (content.length < text.length) {
          sections.push('[Contexto limitado a 12.000 caracteres.]');
          break;
        }
      } catch {
        // Uma referência inacessível não deve impedir as demais perguntas do chat.
      }
    }
    if (sections.length) {
      return {
        code: sections.join('\n\n').slice(0, CHAT_CONTEXT_CHAR_LIMIT),
        lang: 'text',
        file: loadedPaths.length === 1 ? loadedPaths[0] : `${loadedPaths.length} arquivos do chat`,
      };
    }
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};
  const selection = editor.selection;
  return {
    code: (selection.isEmpty ? editor.document.getText() : editor.document.getText(selection)).slice(0, CHAT_CONTEXT_CHAR_LIMIT),
    lang: editor.document.languageId,
    file: vscode.workspace.asRelativePath(editor.document.uri),
  };
}

function activate(ctx) {
  const output = vscode.window.createOutputChannel('Pip');
  ctx.subscriptions.push(output);
  output.appendLine('Pip ativo.');

  let idleTimer;
  let diagnosticsTimer;
  let lastWakeAt = 0;
  let isSleepy = false;
  let workspaceHasErrors = false;
  let lastTaskNotice = { text: '', at: 0 };
  let connectionWarningShown = false;

  function endpoint() {
    const configured = vscode.workspace.getConfiguration('pip').get('endpoint', DEFAULT_ENDPOINT);
    try {
      const url = new URL(configured);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return DEFAULT_ENDPOINT;
      return url.origin;
    } catch {
      return DEFAULT_ENDPOINT;
    }
  }

  function transport() {
    const configured = vscode.workspace.getConfiguration('pip').get('transport', 'auto');
    if (configured === 'namedPipe') return process.platform === 'win32' ? 'namedPipe' : 'http';
    if (configured === 'http') return 'http';
    return 'auto';
  }

  async function post(path, payload, signal) {
    try {
      return await bridgePost({
        transport: transport(),
        endpoint: endpoint(),
        method: path,
        payload,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) return null;
      if (path === '/ask') output.appendLine(`Falha ao comunicar com o overlay: ${error.message}`);
      return null;
    }
  }

  const event = (type, extra = {}) => post('/event', { type, ...extra });

  function touch() {
    clearTimeout(idleTimer);
    const now = Date.now();
    if (isSleepy || now - lastWakeAt >= 30_000) {
      event('wake');
      lastWakeAt = now;
    }
    isSleepy = false;
    idleTimer = setTimeout(() => {
      isSleepy = true;
      event('sleepy');
    }, IDLE_MS);
  }

  function reportDiagnostics() {
    clearTimeout(diagnosticsTimer);
    diagnosticsTimer = setTimeout(() => {
      let errorCount = 0;
      let firstErrorFile;
      for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
        const count = diagnostics.filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error).length;
        errorCount += count;
        if (count > 0 && !firstErrorFile) firstErrorFile = vscode.workspace.asRelativePath(uri);
      }

      const hasErrors = errorCount > 0;
      if (hasErrors && !workspaceHasErrors) {
        event('worried', { count: errorCount, file: firstErrorFile });
      } else if (!hasErrors && workspaceHasErrors) {
        event('relieved');
      }
      workspaceHasErrors = hasErrors;
    }, 900);
  }

  function reportTaskResult(ok, text) {
    const now = Date.now();
    if (lastTaskNotice.text === text && now - lastTaskNotice.at < 1200) return;
    lastTaskNotice = { text, at: now };
    event(ok ? 'happy' : 'sad', { text });
  }

  async function ask(question) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await vscode.window.showInformationMessage('Abra um arquivo para conversar com o Pip.');
      return;
    }

    const selection = editor.selection;
    const code = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    const file = vscode.workspace.asRelativePath(editor.document.uri);
    const requestId = randomUUID();
    const controller = new AbortController();
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Pip está pensando…',
      cancellable: true,
    }, (_progress, token) => {
      const cancellation = token.onCancellationRequested(() => controller.abort());
      return post('/ask', {
        question,
        requestId,
        source: 'VS Code',
        code: code.slice(0, 12_000),
        lang: editor.document.languageId,
        file,
      }, controller.signal).finally(() => cancellation.dispose());
    });

    if (controller.signal.aborted) return;
    if (!result) {
      if (!connectionWarningShown) {
        connectionWarningShown = true;
        await vscode.window.showWarningMessage('Não consegui alcançar o Pip. Confira se o overlay está aberto.');
      }
      return;
    }
    connectionWarningShown = false;
    if (typeof result.text !== 'string' || !result.text.trim()) {
      await vscode.window.showWarningMessage('O Pip não retornou uma resposta. Tente novamente.');
      return;
    }

    output.appendLine('');
    output.appendLine(`Pip · ${new Date().toLocaleTimeString()} · ${file}`);
    output.appendLine(`Pergunta: ${question}`);
    output.appendLine('');
    output.appendLine(result.text.trim());
    output.show(true);
  }

  async function answerChatRequest(request, _chatContext, response, token) {
    let question = typeof request.prompt === 'string' ? request.prompt.trim() : '';
    if (request.command === 'review') {
      question = ['Revise este código: aponte bugs e melhorias mais importantes.', question]
        .filter(Boolean).join('\n\n');
    }
    if (!question) {
      response.markdown('Escreva uma pergunta para o Pip.');
      return;
    }
    if (question.length > 2000) {
      response.markdown('Use até 2.000 caracteres para a pergunta.');
      return;
    }

    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());

    try {
      response.progress('O Pip está preparando o contexto…');
      const context = await collectChatContext(request, vscode);
      if (token.isCancellationRequested) return;
      const result = await post('/ask', { question, requestId: randomUUID(), source: 'VS Code', ...context }, controller.signal);
      if (token.isCancellationRequested) return;
      if (typeof result?.text !== 'string' || !result.text.trim()) {
        response.markdown('Não consegui receber uma resposta do Pip. Confira se o mascote está aberto e tente novamente.');
        return;
      }
      response.markdown(result.text.trim());
    } finally {
      cancellation.dispose();
    }
  }

  ctx.subscriptions.push(
    new vscode.Disposable(() => {
      clearTimeout(idleTimer);
      clearTimeout(diagnosticsTimer);
    }),
    vscode.workspace.onDidChangeTextDocument((change) => {
      if (change.document === vscode.window.activeTextEditor?.document) {
        touch();
        reportDiagnostics();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      touch();
      reportDiagnostics(editor);
    }),
    vscode.workspace.onDidCloseTextDocument(() => reportDiagnostics()),
    vscode.workspace.onDidSaveTextDocument((document) => {
      event('saved', { file: vscode.workspace.asRelativePath(document.uri) });
      if (document === vscode.window.activeTextEditor?.document) reportDiagnostics();
    }),
    vscode.languages.onDidChangeDiagnostics(() => reportDiagnostics()),
    vscode.tasks.onDidEndTaskProcess((task) => {
      if (task.exitCode == null) return;
      reportTaskResult(task.exitCode === 0, task.exitCode === 0 ? 'Tarefa concluída!' : `A tarefa falhou (código ${task.exitCode}).`);
    }),
    vscode.commands.registerCommand('pip.ask', async () => {
      const question = await vscode.window.showInputBox({
        prompt: 'O que você quer saber sobre este código?',
        ignoreFocusOut: true,
        validateInput: (value) => value.length > 2000 ? 'Use até 2.000 caracteres para a pergunta.' : undefined,
      });
      if (question?.trim()) await ask(question.trim());
    }),
    vscode.commands.registerCommand('pip.review', () => ask('Revise este código: aponte bugs e melhorias mais importantes.')),
  );

  if (typeof vscode.chat?.createChatParticipant === 'function') {
    const participant = vscode.chat.createChatParticipant('pip.chat', answerChatRequest);
    ctx.subscriptions.push(participant);
  }

  if (vscode.window.onDidEndTerminalShellExecution) {
    ctx.subscriptions.push(vscode.window.onDidEndTerminalShellExecution((execution) => {
      if (execution.exitCode == null) return;
      reportTaskResult(
        execution.exitCode === 0,
        execution.exitCode === 0 ? 'Comando concluído!' : `O comando falhou (código ${execution.exitCode}).`,
      );
    }));
  }

  touch();
  reportDiagnostics();
}

function deactivate() {}

exports.activate = activate;
exports.deactivate = deactivate;
exports.collectChatContext = collectChatContext;
