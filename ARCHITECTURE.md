# Arquitetura do Pip e integração com o Alfred

O Pip permanece responsável pela experiência de desktop no Windows e pelas
integrações com editores. O Alfred permanece responsável por conversa, memória
e agentes. A conexão entre eles passa por contratos locais explícitos.

```text
VS Code e futuros editores ── eventos e perguntas ─┐
Claude Code ──────────────── hooks de estado ──────┤
                                                   ▼
                                      Ponte local do Pip
                                         │           │
                                         ▼           ├── Gemini (padrão)
                                Mascote e bandeja   └── Alfred local (/chat)
                                                        ├── memória e agentes
                                                        └── alertas por WebSocket
```

## Responsabilidades

- A extensão do VS Code converte atividade do editor em eventos simples. Ela
  não controla janela, bandeja, animação ou provedor de IA. Além dos comandos
  e do menu de contexto, pode receber perguntas no chat nativo por `@pip`.
- O overlay mantém apresentação, interação com o cursor e estado visual do Pip.
- A leitura global do cursor usa intervalo adaptativo: 250 ms com o mascote
  escondido, 33 ms quando visível e nenhuma consulta enquanto as aparições estão pausadas.
- A animação Canvas usa o tempo real entre quadros e interrompe o ciclo de desenho
  enquanto a janela está oculta; ela recomeça quando o Pip aparece novamente.
- Arquivos soltos são resolvidos e lidos pelo processo principal do overlay, após
  validar a origem, o formato e o tamanho; ficam em memória até serem removidos
  ou o Pip encerrar.
- A camada `overlay/providers/` converte uma pergunta com contexto de código
  para o formato esperado pelo provedor escolhido.
- O Alfred continua independente quando não está selecionado como provedor.

As configurações ficam no perfil local do usuário. A chave Gemini é armazenada
criptografada pelo `safeStorage` do Electron; no Windows, a proteção usa DPAPI.
O renderer recebe apenas a indicação de que há uma chave salva, nunca o valor.
Variáveis de ambiente podem substituir as opções da tela.
No Windows, a preferência de início com o usuário é registrada pelo próprio
Windows com `app.setLoginItemSettings`; ela fica desligada até ser ativada.

## Provedores atuais

| Configuração | Destino | Contexto persistente |
| --- | --- | --- |
| `PIP_AI_PROVIDER=gemini` | Gemini GenerateContent | Conforme a política do serviço Gemini |
| `PIP_AI_PROVIDER=alfred` | `POST /chat` e `/ws/notifications` do Alfred em loopback | Histórico e memória da sessão configurada no Alfred |

A tela pode conferir `GET /health` com limite de quatro segundos para distinguir
um backend Alfred disponível de uma configuração local sem servidor ativo.

O Pip aceita endpoints Alfred somente em loopback. O código aberto ou
selecionado só é enviado quando o usuário executa uma pergunta ou revisão. Os
eventos automáticos do editor carregam estado, contagem de erros e caminho
relativo, sem enviar o conteúdo do arquivo.
Arquivos arrastados pelo usuário só são enviados junto com uma pergunta explícita.
O contrato `/chat` do Alfred aceita mensagens de até 4.096 caracteres. O Pip
preserva a pergunta e reparte o espaço restante entre os contextos, indicando
quando o conteúdo precisou ser truncado.

## Ponte dos editores

No Windows, a extensão do VS Code usa o Named Pipe `\\.\pipe\pip-desktop-v1`.
Cada conexão troca uma mensagem JSON terminada em nova linha. Os pedidos têm
limite de 64 KB; a extensão aceita respostas de até 1 MB:

```json
{"id":"request-id","method":"/event","payload":{"type":"saved"}}
```

A resposta preserva o identificador e informa o resultado. O HTTP em
`127.0.0.1:7777` continua disponível para outros editores e ferramentas locais;
ele rejeita origens de navegador e não escuta na rede local. A extensão permite
escolher `auto`, `namedPipe` ou `http` na configuração `pip.transport`.
A resposta de `/ask` inclui `text` e `ok`; provedores retornam o mesmo contrato
para que editores e mascote distingam uma falha de uma resposta normal.
A ponte HTTP limita conexões simultâneas a 16, cabeçalhos a 10 segundos, o
recebimento do pedido a 15 segundos e mantém conexões ociosas por até 5 segundos.
Cada pergunta do VS Code recebe um identificador próprio. Se o chat for
cancelado ou a conexão cair, a ponte interrompe a solicitação ativa e propaga o
cancelamento até o Gemini ou o Alfred.
O chat do overlay usa o mesmo ciclo de cancelamento pela IPC do Electron; fechar
o painel, abrir configurações ou pausar o mascote encerra a pergunta local ativa.

Novos editores devem produzir os mesmos eventos sem depender do código
específico do VS Code. O adaptador sabe como falar com o Pip; o mascote não
precisa conhecer a API interna de cada editor.

## Claude Code

A integração opcional usa hooks HTTP locais em `127.0.0.1:7777/claude-hook`.
Ela traduz eventos de sessão, envio de prompt, chamadas de ferramentas,
notificações, permissões, falhas e conclusão em estados visuais do Pip, sem decidir
permissões do Claude Code. O adaptador descarta prompts, comandos, conteúdo de
ferramentas, caminhos e resultados: só o tipo do evento e, em pedido de
permissão, o nome simples da ferramenta chegam à interface. A ativação é explícita
nas configurações do Pip; o instalador faz backup e mescla seus hooks sem remover
os hooks já existentes, e a desativação remove apenas as entradas identificadas
como pertencentes ao Pip.

## Próximas fronteiras de integração

1. Estabilizar o contrato dos eventos e adicionar adaptadores para outros
   editores.
2. Unificar a inicialização e o ciclo de vida do Pip e do Alfred, preservando
   a possibilidade de iniciar o Pip sem o backend Alfred.
