// Abre o app de verdade contra uma pasta ~/.claude FALSA e salva capturas de tela em PNG.
// Uso: electron captura.js <modo> <saida.png>   (modo: ocupado | desligado | vazio | lista)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

if (process.env.DPR) app.commandLine.appendSwitch('force-device-scale-factor', process.env.DPR);
const modo = process.argv[2] || 'ocupado';
const saida = process.argv[3] || path.join(os.tmpdir(), 'captura.png');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'escr-cap-')));

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-fixture-'));
process.env.ESCRITHORIUS_CLAUDE_DIR = process.env.SEMPASTA ? path.join(raiz, 'nao-existe') : raiz;
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
  if (process.env.OCIOSO) { tarefa(0, 'o1', 'banco', 'Acabou', { finished: true, idadeMs: 112000 }); tarefa(0, 'o2', 'qa', 'Acabou', { finished: true, idadeMs: 113000 }); tarefa(2, 'o3', 'devops', 'Acabou', { finished: true, idadeMs: 111000 }); }
  tarefa(1, 'a6', 'Plan', 'Desenhar a migração', { idadeMs: 3 * 60 * 1000 });
}

require(require('node:path').join(__dirname, '..', 'main.js'));

app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('console-message', (e, nivel, msg, linha, fonte) => console.log('CONSOLE', nivel, msg, fonte + ':' + linha));
  const js = (c) => win.webContents.executeJavaScript(c);
  win.show(); win.focus();
  if (modo === 'lista') await js("document.getElementById('modo-painel').click()");
  if (modo === 'ocupado') { // acende uma skill: linha nova no .jsonl da sessão principal (o app só lê o que for acrescentado)
    const f = path.join(raiz, 'projects', 'C--dev-escrithorius', sess[0][0] + '.jsonl');
    fs.appendFileSync(f, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'grilling' } }] } }) + '\n');
  }
  await new Promise((r) => setTimeout(r, 2500));
  if (process.env.HORA) await js('Cena.definirHora(' + Number(process.env.HORA) + ')');
  if (process.env.CONCLUIR) { for (let k = 0; k < 5; k++) tarefa(0, 'z' + k, 'Explore', 'Tarefa ' + k, { finished: true, idadeMs: 1000 }); await new Promise((r) => setTimeout(r, 2200)); }
  if (process.env.CHAMAR) { tarefa(0, 'k1', 'planejador', 'Chamado agora', { idadeMs: 300 }); tarefa(0, 'k2', 'banco', 'Outro chamado', { idadeMs: 300 }); fs.writeFileSync(path.join(proj(0), 'agent-a1.meta.json'), JSON.stringify({ agentType: 'planejador', description: 'Planejar o MVP do app', finished: true })); }
  if (process.env.ESPERA) await new Promise((r) => setTimeout(r, Number(process.env.ESPERA)));
  if (process.env.FERR) { // ferramenta pendente há 20 s na sessão principal (possivelmente esperando você)
    const f = path.join(raiz, 'projects', 'C--dev-escrithorius', sess[0][0] + '.jsonl');
    fs.appendFileSync(f, JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() - 20000).toISOString(), message: { content: [{ type: 'tool_use', id: 'tf1', name: 'Edit', input: { arquivo: 'SEGREDO' } }] } }) + String.fromCharCode(10));
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (process.env.LARG) { win.setSize(Number(process.env.LARG), 800); await new Promise((r) => setTimeout(r, 800)); }
  if (process.env.PENTA) { const ids = [0,1,2,3,4,5].map((k) => 'p' + k); ids.forEach((id) => tarefa(0, id, 'Explore', 'Paralelo ' + id, { idadeMs: 500 })); await new Promise((r) => setTimeout(r, 2500)); ids.forEach((id) => fs.writeFileSync(path.join(proj(0), 'agent-' + id + '.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'x', finished: true }))); await new Promise((r) => setTimeout(r, 2500)); }
  if (process.env.CLIQUE) await js(`document.querySelector('${process.env.CLIQUE}').click()`);
  if (process.env.SCROLL) await js('window.scrollTo(0,' + Number(process.env.SCROLL) + ')');
  if (process.env.HOVER) await js(`(()=>{const b=document.querySelector('${process.env.HOVER}'); if(b){b.dispatchEvent(new MouseEvent('mouseenter'));}})()`);
  await new Promise((r) => setTimeout(r, 400));
  const quadros = Number(process.env.FRAMES || 1), intervalo = Number(process.env.INTERVALO || 700);
  for (let i = 0; i < quadros; i++) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(quadros > 1 ? saida.replace(/\.png$/, '-' + i + '.png') : saida, img.toPNG());
    if (i < quadros - 1) await new Promise((r) => setTimeout(r, intervalo));
  }
  const info = await js("({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, salas: document.querySelectorAll('.sala').length, canvas: Array.from(document.querySelectorAll('.sala canvas')).map(c => [c.clientWidth, c.clientHeight]), botoes: document.querySelectorAll('.area').length, scrollH: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, combo: !document.getElementById('combo').hidden })");
  console.log(JSON.stringify(info));
  app.exit(0);
}, 3500));
