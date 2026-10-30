# Explicaí Office

> Projeto derivado do [Escrithorius](https://github.com/thalesguasti/escrithorius), de Thales de Souza Guasti, sob licença MIT. A base (salas, pixel art, estados, avisos e máscara de segredos) vem dele. O Explicaí Office adapta o escritório para a equipe de agentes do [explicai-workflow](https://github.com/gabriel-codesampaio/explicai-workflow).

Um **escritório virtual** para ver o seu Claude Code trabalhando: uma sala em pixel art por projeto, onde a sessão principal e os agentes (subagentes) aparecem sentados à mesa quando trabalham, vão ao café quando terminam e esperam à toa na sala de estar quando ninguém os chamou. Tem avisos do Windows, modo compacto sempre no topo e um painel com tudo em lista.

> Só **observa**: lê a pasta do Claude Code do **seu** computador (agentes, skills e sessões que **você** tem) e nunca altera nada nela.

## Download

O `.exe` portátil (Windows, sem instalador) fica na aba **Releases** deste repositório, junto com o hash SHA-256. Ele não é assinado: o SmartScreen pode avisar na primeira vez. Se preferir, compile você mesmo (veja "Rodando").

## Como funciona

- Cada **projeto** com uma sessão do Claude Code aberta vira uma sala.
- A sessão principal ("Claude principal") e cada execução de agente aparecem como pessoas: **trabalhando** (à mesa), **delegando**, **aguardando** (sofá), **encerrada** (café) ou **possivelmente esperando você** (um "?" amarelo: uma ferramenta ficou sem resposta por mais de 8 s, como numa permissão pendente).
- Os agentes e skills que existem na **sua** pasta do Claude (`agents/*.md` e `skills/*/SKILL.md`) é que aparecem: cada pessoa que usar o app vê os dela.
- Clique numa execução para ler o relatório do agente (com segredos mascarados) e copiar o comando `claude --resume <sessão>` (cole no terminal **dentro da pasta do projeto**: o Claude Code procura a sessão a partir da pasta atual).

## Requisitos

- **Node.js 20 ou mais novo** e npm (só para rodar os testes e gerar o `.exe`; o Electron traz o próprio Node).
- **Windows** (é onde foi desenvolvido e testado; o resto é Electron e deve abrir em outros sistemas, mas os avisos e o `.exe` são para Windows).
- O **Claude Code** instalado e já usado pelo menos uma vez (é ele que cria a pasta `~/.claude`).

## Rodando

```bash
npm ci        # instala as versões exatas do package-lock.json (baixa o Electron, ~100 MB)
npm start
```

Para gerar o executável portátil (sem instalador): `npm run dist` → `dist/explicai-office-0.1.0-portable.exe`. Ele **não é assinado**: o SmartScreen do Windows pode avisar na primeira vez, e o ideal é compilar você mesmo a partir do código em vez de confiar num `.exe` pronto. No Windows, o `npm run dist` pode pedir o **Modo de Desenvolvedor** ou um terminal de administrador (o electron-builder cria links simbólicos). O `.exe` portátil se extrai em `%TEMP%`, e o Chromium guarda perfil e cache em `AppData`.

### Primeira vez

1. Abra o Claude Code em algum projeto: a sala dele aparece no Explicaí Office.
2. Se aparecer "Não encontrei a pasta do Claude Code", abra o Claude Code uma vez, ou clique em **Configurações** e escolha a pasta (a que tem `agents`, `skills` e `sessions`). O app também respeita a variável `CLAUDE_CONFIG_DIR`, a mesma do Claude Code.

## Configurações

O botão **Configurações** (no topo) mostra qual pasta está sendo lida e quantos agentes, skills e sessões ela tem, e deixa ligar ou desligar os **avisos do Windows**, o **som** e as **frases de comemoração**. Atalhos: `L` alterna Painel/Escritório e `M` liga o modo compacto.

As preferências ficam num `config.json` pequeno na pasta de dados do app (só liga/desliga e a pasta escolhida). Nenhuma conversa é gravada.

## Privacidade e segurança

- **Tudo local.** Não há rede: nenhum servidor, nenhum envio, nenhuma conta.
- **Só leitura** em `~/.claude`. O app nunca escreve lá.
- **Segredos mascarados** (tokens, senhas, chaves, e-mails, CPF/CNPJ...) antes de qualquer texto chegar à tela. O conteúdo das ferramentas nunca é lido: só o **nome** da ferramenta em uso.
- A notificação do Windows mostra só nome do agente, projeto e estado (nunca descrição ou relatório).
- Electron com `contextIsolation`, `sandbox`, CSP restritiva, sem `eval`/`innerHTML` e canais IPC validados.
## Testes

```bash
npm test          # lógica (sem abrir janela)
npm run test:ui   # abre a janela de verdade contra uma pasta ~/.claude FALSA (veja test-ui/LEIA-ME.md)
npm run test:exe  # confere o .exe gerado (rode npm run dist antes)
```

## Estrutura

- `main.js`, `preload.js`: processo principal e ponte segura para a tela.
- `src/`: leitura dos arquivos (`monitor.js`), máscara de segredos (`mask.js`), catálogo, avisos e configuração.
- `renderer/`: a tela (HTML/CSS/JS puro, sem framework): salas, arte em pixel art desenhada em código, movimento, painel e compacto.
- `test/`, `test-ui/`: testes. `tools/`: gerador do ícone.

## Limitações

- O formato dos arquivos do Claude Code **não é documentado** e pode mudar; se mudar, o app mostra um aviso amarelo no topo e pode precisar de atualização.
- "Possivelmente esperando você" é uma heurística (pode confundir com uma ferramenta lenta).
- Só salas de sessões **abertas**; sessões fechadas aparecem só em "Atividade recente" do Painel.

## Licença

[MIT](LICENSE) © 2026 Thales de Souza Guasti (Escrithorius) e Gabriel Sampaio (Explicaí Office).

## Créditos e avisos

Projeto independente, **sem vínculo com a Anthropic**. A pixel art (desenhada em código) e as frases de comemoração (`renderer/frases.js`) foram criadas por Thales de Souza Guasti para o Escrithorius.
