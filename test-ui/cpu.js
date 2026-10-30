// Abre o app de verdade contra uma pasta ~/.claude FALSA e salva capturas de tela em PNG.
// Uso: electron captura.js <modo> <saida.png>   (modo: ocupado | desligado | vazio | lista)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const modo = 'ocupado';
const saida = process.argv[3] || path.join(os.tmpdir(), 'captura.png');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'escr-cap-')));

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-fixture-'));
process.env.ESCRITHORIUS_CLAUDE_DIR = raiz;
const w = (rel, txt) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); return f; };

const agentes = ['planejador', 'banco', 'qa', 'seguranca', 'revisor-de-codigo', 'devops', 'docs', 'testes'];
for (const a of agentes) w(`agents/${a}.md`, `---\nname: ${a}\ndescription: Agente ${a}\n---\n`);
const skills = ['accessibility', 'frontend-design', 'grill-me', 'grilling', 'supabase-postgres-best-practices', 'dataviz'];
for (const s of skills) w(`skills/${s}/SKILL.md`, `---\nname: ${s}\ndescription: Skill ${s}\n---\n`);

const sess = [
  ['11111111-1111-1111-1111-111111111111', 'C:\\dev\\escrithorius', 'busy'],
  ['22222222-2222-2222-2222-222222222222', 'C:\\dev\\meu-projeto-com-nome-longo', 'idle'],
  ['33333333-3333-3333-3333-333333333333', 'C:\\dev\\api-pagamentos', 'busy'],
];
const vivas = modo === 'ocupado' || modo === 'lista';
if (modo !== 'vazio') {
  sess.forEach(([id, cwd, status], i) => {
    w(`sessions/${100 + i}.json`, JSON.stringify({ pid: vivas ? process.pid : 2147480, sessionId: id, cwd, status }));
    w(`projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${id}.jsonl`, JSON.stringify({ type: 'user', cwd }) + '\n');
  });
}
const proj = (i) => path.join(raiz, 'projects', sess[i][1].replace(/[^A-Za-z0-9]/g, '-'), sess[i][0], 'subagents');
function tarefa(i, id, tipo, desc, { finished = false, idadeMs = 0 } = {}) {
  const d = proj(i); fs.mkdirSync(d, { recursive: true });
  const j = path.join(d, `agent-${id}.jsonl`), m = path.join(d, `agent-${id}.meta.json`);
  fs.writeFileSync(j, '{}\n'); fs.writeFileSync(m, JSON.stringify({ agentType: tipo, description: desc, ...(finished ? { finished: true } : {}) }));
  const t = new Date(Date.now() - idadeMs); fs.utimesSync(j, t, t); fs.utimesSync(m, t, t);
}
if (modo !== 'vazio') {
  tarefa(0, 'a1', 'planejador', 'Planejar o MVP do app', { idadeMs: 4000 });
  tarefa(0, 'a2', 'seguranca', 'Revisar segurança do login', { idadeMs: 3 * 60 * 1000 });
  tarefa(2, 'a3', 'qa', 'Testar o fluxo de pagamento', { idadeMs: 2000 });
  tarefa(0, 'a4', 'Explore', 'Mapear a estrutura do projeto', { idadeMs: 1500 });
  tarefa(2, 'a5', 'general-purpose', 'Pesquisar bibliotecas', { finished: true, idadeMs: 6000 });
  tarefa(1, 'a6', 'Plan', 'Desenhar a migração', { idadeMs: 3 * 60 * 1000 });
}

require(require('node:path').join(__dirname, '..', 'main.js'));
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
async function medir(rotulo, ms) {
  const a = app.getAppMetrics().map((m) => m.cpu.cumulativeCPUUsage); const t0 = Date.now();
  await esp(ms);
  const b = app.getAppMetrics().map((m) => m.cpu.cumulativeCPUUsage);
  const total = b.reduce((s, v, i) => s + v - (a[i] || 0), 0);
  console.log(rotulo + ': ' + (100 * total / ((Date.now() - t0) / 1000)).toFixed(1) + '% de um núcleo (todos os processos)');
}
app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(1280, 790); await esp(1500);
  await medir('escritório (3 salas, 1 visível por inteiro)', 6000);
  await win.webContents.executeJavaScript("document.getElementById('modo-painel').click()"); await esp(800);
  await medir('modo Painel', 4000);
  win.minimize(); await esp(800);
  await medir('minimizada', 4000);
  app.exit(0);
}, 3500));
