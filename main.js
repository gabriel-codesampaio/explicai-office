const { app, BrowserWindow, ipcMain, Menu, session, Notification, clipboard, dialog } = require('electron');
const os = require('node:os');
if (app.isPackaged) delete process.env.ESCRITHORIUS_CLAUDE_DIR; // a variável de teste não vale no executável (antes de carregar o monitor)
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { lerEstado, lerRelatorio, comandoRetomada, definirPasta, resumoDaPasta } = require('./src/monitor');
const config = require('./src/config');
const { criarAvisos, montarAviso, atrasoDoEnvio, limitar } = require('./src/avisos');

const PAGINA = path.join(__dirname, 'renderer', 'index.html');
const PAGINA_URL = pathToFileURL(PAGINA).href;
let janela = null;
let prefs = { ...config.PADRAO }; // preferências (config.json na pasta de dados do app; só liga/desliga e a pasta do Claude)
let avisosLigados = prefs.avisos;
let somLigado = prefs.som;
let ultimoAviso = 0; // quando o último aviso foi mostrado (limita a frequência)
const notificacoesAbertas = new Set(); // evita que o coletor de lixo descarte a notificação antes do clique

// Só aceita mensagens da página do próprio app, vindas da nossa janela.
const remetenteOk = (evento) => !!janela && evento.sender === janela.webContents && !!evento.senderFrame && evento.senderFrame.url === PAGINA_URL;

// A tela só pede o relatório pelo id da tarefa; o monitor valida o id e nunca aceita caminho.
// Só responde à página do próprio app, vinda da nossa janela.
ipcMain.handle('relatorio', (evento, id) => {
  if (!remetenteOk(evento)) return null;
  return lerRelatorio(id);
});

// Copia "claude --resume <id da sessão>" (só texto, sem caminho) para a área de transferência. O id é validado pelo monitor.
ipcMain.handle('retomada', async (evento, id) => {
  if (!remetenteOk(evento)) return false;
  const comando = comandoRetomada(id);
  if (!comando) return false;
  try { await clipboard.writeText(comando); return true; } catch { return false; }
});

// Modo compacto: janela pequena e sempre no topo; ao sair volta ao tamanho de antes (guardado só em memória).
let tamanhoAntes = null;
function aplicarCompacto(ligado) {
  if (!janela || janela.isDestroyed()) return;
  if (ligado) {
    if (janela.isFullScreen()) janela.setFullScreen(false);
    if (janela.isMaximized()) janela.unmaximize(); // senão o tamanho pequeno seria ignorado
    if (!tamanhoAntes) tamanhoAntes = janela.getContentSize();
    janela.setMinimumSize(280, 140);
    janela.setContentSize(380, 300);
    janela.setAlwaysOnTop(true, 'floating');
  } else {
    janela.setAlwaysOnTop(false);
    janela.setMinimumSize(800, 640);
    const t = tamanhoAntes || [1280, 790];
    janela.setContentSize(t[0], t[1]);
    tamanhoAntes = null;
  }
}
ipcMain.on('compacto', (evento, valor) => { if (remetenteOk(evento) && typeof valor === 'boolean') aplicarCompacto(valor); });

// --- Configurações ---
const dirDados = () => app.getPath('userData');
function salvarPrefs() { config.salvar(dirDados(), prefs); }
function carregarPrefs() {
  prefs = config.carregar(dirDados());
  avisosLigados = prefs.avisos; somLigado = prefs.som;
  definirPasta(prefs.pasta);
}
// O que a tela de Configurações mostra: preferências + o que há na pasta lida (com a pasta do usuário abreviada para "~").
function estadoConfig(extra) {
  const r = resumoDaPasta();
  return {
    avisos: prefs.avisos, som: prefs.som, falas: prefs.falas,
    pasta: config.abreviar(r.pasta, os.homedir()), padrao: r.padrao, forcada: r.forcada, existe: r.existe, agentes: r.agentes, skills: r.skills, sessoes: r.sessoes,
    arquivo: config.abreviar(path.join(dirDados(), config.ARQUIVO), os.homedir()), versao: app.getVersion(),
    ...(extra || {}),
  };
}
function mudarPrefs(mudancas) {
  prefs = config.aplicar(prefs, mudancas); // só chaves booleanas conhecidas, com booleano estrito
  avisosLigados = prefs.avisos; somLigado = prefs.som;
  salvarPrefs();
}
// Botões do topo (Avisos/Som): só booleanos estritos, qualquer outra coisa é ignorada.
ipcMain.on('avisos', (evento, valor) => { if (remetenteOk(evento) && typeof valor === 'boolean') mudarPrefs({ avisos: valor }); });
ipcMain.on('som', (evento, valor) => { if (remetenteOk(evento) && typeof valor === 'boolean') mudarPrefs({ som: valor }); });
ipcMain.handle('config:obter', (evento) => (remetenteOk(evento) ? estadoConfig() : null));
ipcMain.handle('config:definir', (evento, mudancas) => {
  if (!remetenteOk(evento)) return null;
  mudarPrefs(mudancas);
  return estadoConfig();
});
// A pasta do Claude só muda pelo seletor nativo (a tela nunca informa caminho) ou voltando ao padrão.
ipcMain.handle('config:escolher-pasta', async (evento) => {
  if (!remetenteOk(evento)) return null;
  try {
    const r = await dialog.showOpenDialog(janela, { title: 'Escolha a pasta do Claude Code (a que tem agents, skills e sessions)', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths.length) return estadoConfig();
    const p = config.validarPasta(r.filePaths[0]);
    if (!p) return estadoConfig({ erro: 'Essa pasta não pode ser usada.' });
    prefs = { ...prefs, pasta: p }; salvarPrefs(); definirPasta(p);
    return estadoConfig();
  } catch { return estadoConfig({ erro: 'Não foi possível abrir o seletor de pastas.' }); }
});
ipcMain.handle('config:pasta-padrao', (evento) => {
  if (!remetenteOk(evento)) return null;
  prefs = { ...prefs, pasta: null }; salvarPrefs(); definirPasta(null);
  return estadoConfig();
});

// Só avisa quando a janela não está à vista (minimizada, escondida ou sem foco): com o app na frente seria redundante.
const janelaEmSegundoPlano = () => !!janela && !janela.isDestroyed() && (janela.isMinimized() || !janela.isVisible() || !janela.isFocused());

function mostrarAviso(itens) {
  const aviso = montarAviso(itens);
  if (!aviso || !avisosLigados || !Notification.isSupported() || !janelaEmSegundoPlano()) return;
  const n = new Notification({ title: aviso.titulo, body: aviso.corpo, silent: !somLigado });
  notificacoesAbertas.add(n);
  const solta = () => notificacoesAbertas.delete(n);
  n.on('close', solta); n.on('failed', solta);
  n.on('click', () => {
    solta();
    if (!janela || janela.isDestroyed()) return;
    if (janela.isMinimized()) janela.restore();
    janela.show(); janela.focus();
    if (aviso.tarefaId) janela.webContents.send('abrir-relatorio', { id: aviso.tarefaId, titulo: aviso.rotulo || '' });
  });
  ultimoAviso = Date.now();
  n.show();
}

function criarJanela() {
  carregarPrefs();
  // O app não precisa de nenhuma permissão do navegador (câmera, notificações etc.).
  session.defaultSession.setPermissionRequestHandler((_wc, _permissao, resposta) => resposta(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  if (app.isPackaged) Menu.setApplicationMenu(null); // sem menu (e sem atalho das DevTools) no executável

  janela = new BrowserWindow({
    width: 1280,
    height: 790, // conteúdo: barra (~56) + cena 320x240 ampliada 3x (960x720) + painel Equipe (280) ao lado
    minWidth: 800,
    minHeight: 640, // a cena (960x720 lógicos) encolhe até ~0,8x + barra
    useContentSize: true,
    title: 'Escrithorius',
    icon: path.join(__dirname, 'build', 'icone.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const wc = janela.webContents;
  // Sem navegação nem janelas novas: o app só mostra a própria tela.
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('will-frame-navigate', (e) => e.preventDefault());
  wc.on('will-redirect', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.loadFile(PAGINA);

  const avisos = criarAvisos();
  let pendentes = [];
  let envio = null;
  const timer = setInterval(() => {
    if (janela.isDestroyed()) return;
    try {
      const estado = lerEstado();
      wc.send('estado', estado);
      const novos = avisos.processar(estado); // sempre processa (para o estado anterior não ficar velho), mesmo com avisos desligados
      if (novos.length) {
        pendentes = limitar(pendentes.concat(novos));
        if (!envio) envio = setTimeout(() => { const lote = pendentes; pendentes = []; envio = null; try { mostrarAviso(lote); } catch { /* aviso é só um extra */ } }, atrasoDoEnvio(Date.now(), ultimoAviso));
      }
    } catch {
      // Um formato inesperado num arquivo não pode derrubar o app (nem abrir um diálogo de erro com caminhos): tenta no próximo ciclo.
    }
  }, 1000);
  janela.on('closed', () => { clearInterval(timer); if (envio) clearTimeout(envio); janela = null; });
}

// Segunda instância: só encerra, sem criar janela.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('local.escrithorius'); // identifica o app nas notificações do Windows
  app.whenReady().then(criarJanela);
  app.on('window-all-closed', () => app.quit());
}
