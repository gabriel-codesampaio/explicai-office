// Avisos de ponta a ponta: janela real, ~/.claude falsa e Notification substituída por uma classe de teste.
const electron = require('electron');
const { app, BrowserWindow } = electron;
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const feitos = [];
class NotificacaoFalsa {
  static isSupported() { return true; }
  constructor(o) { this.o = o; this.h = {}; this.mostrada = false; feitos.push(this); }
  on(ev, fn) { this.h[ev] = fn; }
  show() { this.mostrada = true; }
}
const Module = require('module'); const carregar = Module._load;
Module._load = function (req, ...resto) { // o main.js recebe o 'electron' com a Notification trocada
  const r = carregar.call(this, req, ...resto);
  return req === 'electron' ? new Proxy(r, { get: (t, k) => (k === 'Notification' ? NotificacaoFalsa : t[k]) }) : r;
};

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'escr-av-')));
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-fixture-'));
process.env.ESCRITHORIUS_CLAUDE_DIR = raiz;
const w = (rel, txt) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); return f; };
const ID = '11111111-1111-1111-1111-111111111111';
const cwd = 'C:\\dev\\meuprojeto';
const sessaoArq = () => w('sessions/100.json', JSON.stringify({ pid: process.pid, sessionId: ID, cwd, status: this_status }));
let this_status = 'busy';
sessaoArq();
w(`projects/C--dev-meuprojeto/${ID}.jsonl`, JSON.stringify({ type: 'user', cwd }) + '\n');
const sub = path.join(raiz, 'projects', 'C--dev-meuprojeto', ID, 'subagents');
function agente(id, tipo, finished) {
  fs.mkdirSync(sub, { recursive: true });
  const j = path.join(sub, `agent-${id}.jsonl`), m = path.join(sub, `agent-${id}.meta.json`);
  if (!fs.existsSync(j)) fs.writeFileSync(j, '{}\n'); else fs.utimesSync(j, new Date(), new Date());
  fs.writeFileSync(m, JSON.stringify({ agentType: tipo, description: 'SEGREDO da tarefa', ...(finished ? { finished: true } : {}) }));
}
agente('a1', 'qa', false);
agente('a2', 'banco', false);

require(require('node:path').join(__dirname, '..', 'main.js'));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA ') + m); if (!c) falhas++; };

app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const js = (c) => win.webContents.executeJavaScript(c);
  win.show(); win.focus();
  await espera(2500);
  ok(feitos.length === 0, 'abrir o app não avisa nada');

  // janela à vista: nada
  agente('a1', 'qa', true);
  await espera(4000);
  ok(feitos.length === 0, 'com a janela em foco não avisa (' + feitos.length + ')');

  // janela minimizada: banco conclui -> um aviso único com o relatório
  win.minimize(); await espera(500);
  agente('a2', 'banco', true);
  await espera(4000);
  ok(feitos.length === 1 && feitos[0].mostrada, 'minimizada: 1 aviso mostrado (' + feitos.length + ')');
  const n = feitos[0];
  ok(n && n.o.title === 'banco concluiu' && n.o.body === 'Projeto meuprojeto', 'título e corpo só com agente e projeto: ' + (n && n.o.title) + ' | ' + (n && n.o.body));
  ok(n && n.o.silent === true, 'sem som por padrão');
  ok(!JSON.stringify(n.o).includes('SEGREDO'), 'descrição não vaza no aviso');

  // clique: restaura a janela e abre o relatório
  n.h.click(); await espera(800);
  ok(!win.isMinimized() && win.isVisible(), 'clique restaura a janela');
  ok(await js("!document.getElementById('painel').hidden"), 'clique abre o painel do relatório');
  ok((await js("document.getElementById('painel-titulo').textContent")) === 'banco', 'título do painel = agente');
  await js("document.getElementById('fechar').click()");

  await espera(12500); // intervalo mínimo entre avisos
  // sessão passa a aguardando, com a janela minimizada, avisos ligados e som ligado
  await js("document.getElementById('op-som').click()");
  win.minimize(); await espera(500);
  this_status = 'idle'; sessaoArq();
  await espera(4000);
  ok(feitos.length === 2 && feitos[1].o.title === 'Claude principal aguarda você' && feitos[1].o.silent === false, 'sessão aguardando avisa, com som ligado: ' + (feitos[1] && feitos[1].o.title));

  // ferramenta pendente há 20 s numa sessão ocupada e com a janela minimizada: 'possivelmente espera você' (respeitando o intervalo mínimo entre avisos)
  this_status = 'busy'; sessaoArq(); await espera(2500);
  win.restore(); win.show(); win.focus(); await espera(300); win.minimize(); await espera(13000);
  fs.appendFileSync(path.join(raiz, 'projects', 'C--dev-meuprojeto', ID + '.jsonl'), JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() - 20000).toISOString(), message: { content: [{ type: 'tool_use', id: 'tx1', name: 'Edit', input: { arquivo: 'SEGREDO' } }] } }) + String.fromCharCode(10));
  await espera(4500);
  ok(feitos.length === 3 && feitos[2].o.title === 'Claude principal possivelmente espera você' && !JSON.stringify(feitos[2].o).includes('SEGREDO') && !JSON.stringify(feitos[2].o).includes('Edit'), 'esperando você avisa só com agente e projeto: ' + (feitos[2] && feitos[2].o.title));
  // avisos desligados: nada
  win.restore(); win.show(); win.focus(); await espera(500);
  await js("document.getElementById('op-avisos').click()");
  win.minimize(); await espera(500);
  this_status = 'busy'; sessaoArq(); await espera(2500);
  this_status = 'idle'; sessaoArq(); await espera(4000);
  ok(feitos.length === 3, 'com Avisos desligado não avisa (' + feitos.length + ')');
  ok((await js("document.getElementById('op-avisos').getAttribute('aria-pressed')")) === 'false', 'botão Avisos reflete o estado');

  const gravado = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
  ok(gravado.avisos === false && gravado.som === true, 'botões do topo gravam a preferência (avisos desligado, som ligado): ' + JSON.stringify(gravado));
  console.log(falhas ? 'FALHAS: ' + falhas : 'TUDO OK');
  app.exit(falhas ? 1 : 0);
}, 3500));
