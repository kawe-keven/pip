# Pip — mascote de código para Windows

O Pip foi pensado como a camada de desktop para uma integração futura com o
Alfred. A separação entre a interface, a extensão dos editores e os provedores
está descrita em [ARCHITECTURE.md](ARCHITECTURE.md).

## Overlay (Electron)
No Windows, abra `pip.bat`. Na primeira execução ele instala as dependências
necessárias e inicia o overlay. É preciso ter Node.js (com npm) instalado.
O Pip aparece no topo central quando o cursor chega à borda superior e também
pode ser aberto pelo ícone na área de notificação. O menu do ícone permite
pausar as aparições, abrir **Configurações…** ou sair.
Em **Configurações…**, é possível escolher se o Pip deve iniciar junto com o Windows;
essa opção vem desligada e pode ser alterada a qualquer momento.
Passe o cursor sobre o Pip para ver os olhos crescerem suavemente; depois de dois
segundos, ele demonstra carinho. Clique no mascote para abrir a conversa. Pressione Enter para enviar, Shift+Enter para
quebrar a linha e Esc ou × para fechar o painel. Enquanto o Pip responde, o botão
**Cancelar** interrompe a pergunta sem esperar a resposta terminar.

Ao arrastar um arquivo aceito, o Pip abre uma caixinha e indica onde soltar. Arraste
até três arquivos de texto ou código para o mascote ou para a conversa aberta,
ou use o botão de clipe na conversa para escolher arquivos.
Cada arquivo pode ter até 256 KB, com limite combinado de 512 KB. O conteúdo fica
na memória do Pip e só é enviado ao provedor quando você fizer uma pergunta; use
× na etiqueta do arquivo para removê-lo.

Configure o provedor pelo menu da bandeja em **Configurações…**. A chave Gemini
fica criptografada com a proteção do Windows e não volta a ser exibida na tela.
`GEMINI_API_KEY` também pode ser definida no ambiente e substitui a chave salva.
No Gemini, o Pip mantém até 12 pares recentes de pergunta e resposta apenas na
memória enquanto está aberto, para dar continuidade à conversa. Esse histórico
não é salvo em disco e some quando o Pip é encerrado.

O provedor padrão é o Gemini. Para usar o Alfred local, selecione-o em
**Configurações…**. O Alfred precisa estar rodando em `127.0.0.1:8000`; a tela
permite escolher o endereço de loopback e a sessão, além de testar a conexão
com o endpoint `/health` sem iniciar uma conversa. As variáveis
`PIP_AI_PROVIDER`, `PIP_ALFRED_URL` e `PIP_ALFRED_SESSION` continuam disponíveis
como substituições para desenvolvimento. Com o Alfred selecionado, o Pip recebe
alertas de monitoramento e sinais de pesquisa/briefing pela conexão local de notificações.

Para iniciar manualmente: entre na pasta `overlay`, execute `npm install`,
configure o provedor em **Configurações…** ou use as variáveis de ambiente e execute `npm start`.

## Extensão VS Code
O pacote instalável está em [`extension/pip-vscode-0.2.9.vsix`](extension/pip-vscode-0.2.9.vsix).
No VS Code, abra a Paleta de Comandos (`Ctrl+Shift+P`), escolha **Extensions: Install
from VSIX...** e selecione esse arquivo. Depois, recarregue a janela do VS Code.
Comandos: `Ctrl+Alt+P` (perguntar; também pode cancelar enquanto o Pip responde)
e **Pip: Revisar seleção**. Ao selecionar
código, também é possível perguntar ou pedir revisão pelo menu de contexto do editor.
No painel de chat do VS Code, mencione `@pip` para conversar com o mascote; use
`@pip /review` para revisar o arquivo aberto ou a seleção. O painel mantém a
conversa e permite cancelar uma solicitação em andamento. Referências de arquivo
adicionadas explicitamente ao chat (por exemplo, `#arquivo`) são incluídas como
contexto, até três arquivos e 12.000 caracteres.

Para desenvolver a extensão, abra a pasta `extension` no VS Code e aperte F5
(Extension Development Host).

## Claude Code (opcional)
Em **Configurações…**, marque **Acompanhar sessões do Claude Code** e salve. O Pip
preserva as outras configurações e hooks, cria uma cópia de segurança de
`%USERPROFILE%\.claude\settings.json` antes de alterá-lo e remove apenas seus
próprios hooks quando a opção é desmarcada. Os hooks acompanham início de sessão,
chamadas de ferramenta, pedidos de permissão, falhas e conclusões por HTTP local.
O texto de prompts, comandos e arquivos não é mostrado nem enviado aos provedores.
Se preferir instalar manualmente, mescle o conteúdo de
[`overlay/integrations/claude-code-hooks.json`](overlay/integrations/claude-code-hooks.json)
às configurações existentes. A API usada está descrita na
[referência oficial de hooks](https://code.claude.com/docs/en/hooks).

No Windows, a extensão do VS Code usa o Named Pipe `\\.\pipe\pip-desktop-v1`.
O overlay também mantém uma ponte HTTP compatível em `127.0.0.1:7777` (`POST
/event`, `/ask` e `/claude-hook`) para outros editores e ferramentas locais. As duas interfaces
aceitam mensagens JSON de até 64 KB; o HTTP rejeita chamadas de páginas web.
O endpoint de hooks do Claude Code aceita até 512 KB para acomodar eventos de
ferramentas com entradas maiores.
Em `Pip › Transport`, escolha `auto`, `namedPipe` ou `http` se precisar mudar o
transporte.

Modelo padrão: gemini-3.5-flash. Para trocar: `set PIP_MODEL=nome-do-modelo`.
