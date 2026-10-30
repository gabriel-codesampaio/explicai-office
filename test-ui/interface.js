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
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA ') + m); if (!c) falhas++; };

app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  const js = (c) => wc.executeJavaScript(c);
  win.show(); win.focus(); win.setContentSize(1280, 790); await esp(900);
  ok((await js("document.querySelectorAll('.sala').length")) === 3, '3 salas (uma por projeto)');
  // clique real do mouse numa execução
  const alvo = await js(`(()=>{const b=document.querySelector('button.area[data-tarefa]'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), nome:b.dataset.titulo}})()`);
  await esp(300);
  wc.sendInputEvent({ type: 'mouseMove', x: alvo.x, y: alvo.y }); await esp(250);
  ok(await js("!document.getElementById('dica').hidden"), 'dica aparece no hover: ' + (await js("document.getElementById('dica').textContent.slice(0,40)")));
  wc.sendInputEvent({ type: 'mouseDown', x: alvo.x, y: alvo.y, button: 'left', clickCount: 1 }); await esp(80);
  wc.sendInputEvent({ type: 'mouseUp', x: alvo.x, y: alvo.y, button: 'left', clickCount: 1 }); await esp(700);
  ok(await js("!document.getElementById('painel').hidden"), 'clique real abre o relatório de ' + alvo.nome);
  ok((await js("document.getElementById('painel-texto').textContent")).length > 20, 'relatório com texto');
  const { clipboard } = require('electron'); // botão de copiar comando de retomada
  await clipboard.writeText('antes');
  await js("document.getElementById('copiar').click()"); await esp(500);
  const copiado = await clipboard.readText();
  ok(/^claude --resume [0-9a-f-]{36}$/.test(copiado), 'copiar comando de retomada: ' + copiado);
  ok((await js("document.getElementById('copiar-aviso').textContent")) .startsWith('Copiado!'), 'aviso Copiado!');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await esp(200);
  ok(await js("document.getElementById('painel').hidden"), 'Esc fecha o relatório');
  // teclado: Tab chega a um botão da sala, Enter abre
  await js("document.querySelector('button.area[data-tarefa]').focus()"); await esp(200);
  ok(await js("!document.getElementById('dica').hidden"), 'foco por teclado mostra a dica');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: '\r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await esp(700);
  ok(await js("!document.getElementById('painel').hidden"), 'Enter no botão focado abre o relatório');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await esp(200);
  await js("document.activeElement.blur()");
  // modo Painel e tecla L
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'L' }); wc.sendInputEvent({ type: 'char', keyCode: 'l' }); await esp(300);
  ok(await js("document.getElementById('vista-cena').hidden && !document.getElementById('vista-lista').hidden"), 'L abre o modo Painel');
  const q0 = await js('Cena.quadros()'); await esp(1000); const q1 = await js('Cena.quadros()');
  ok(q1 === q0, 'sem animação no modo Painel (' + (q1 - q0) + ' quadros em 1 s)');
  ok(await js("document.getElementById('modo-painel').getAttribute('aria-pressed') === 'true'"), 'aria-pressed do Painel');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'L' }); wc.sendInputEvent({ type: 'char', keyCode: 'l' }); await esp(500);
  const f0 = await js('Cena.quadros()'); await esp(1000); const f1 = await js('Cena.quadros()');
  ok(f1 - f0 >= 10 && f1 - f0 <= 30, 'animação roda no Escritório (' + (f1 - f0) + ' quadros em 1 s)');
  // janela estreita: escala 2, botões continuam sobre as pessoas
  win.setContentSize(800, 700); await esp(900);
  const dim = await js("(()=>{const c=document.querySelector('.sala canvas'); const b=document.querySelector('button.area'); const pr=c.getBoundingClientRect(), br=b.getBoundingClientRect(); return {w:c.clientWidth, dentro: br.left>=pr.left-1 && br.right<=pr.right+1 && br.top>=pr.top-1 && br.bottom<=pr.bottom+1}})()");
  ok(dim.w === 704 && dim.dentro, 'janela 800: escala 2 (' + dim.w + ' px) e botões dentro da sala');
  // nenhum botão sobreposto dentro da mesma sala
  const sobre = await js(`(()=>{let n=0; for(const sala of document.querySelectorAll('.sala')){const rs=Array.from(sala.querySelectorAll('button.area')).map(b=>b.getBoundingClientRect()); for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j]; if(a.left<b.right-0.5&&b.left<a.right-0.5&&a.top<b.bottom-0.5&&b.top<a.bottom-0.5)n++;}} return n})()`);
  ok(sobre === 0, 'nenhuma área clicável sobreposta (' + sobre + ')');
  // Configurações: abre pelo botão, mostra a pasta lida (definida pelo ambiente nos testes), guarda a preferência em disco, Esc fecha e devolve o foco
  win.setContentSize(1280, 790); await esp(500);
  await js("document.getElementById('op-config').focus()");
  await js("document.getElementById('op-config').click()"); await esp(600);
  ok(await js("!document.getElementById('config').hidden && document.activeElement.id === 'config-fechar'"), 'configurações abrem com o foco no botão Fechar');
  ok((await js("document.getElementById('cfg-status').textContent")).startsWith('Encontrada: 8 agentes'), 'status da pasta: ' + (await js("document.getElementById('cfg-status').textContent")));
  ok(await js("document.getElementById('cfg-escolher').disabled && document.getElementById('cfg-padrao').disabled"), 'pasta definida pelo ambiente: botões de trocar desligados');
  ok((await js("document.getElementById('cfg-pasta').textContent")).includes('definida pelo ambiente'), 'mostra de onde vem a pasta');
  ok(await js("document.getElementById('cfg-avisos').checked && !document.getElementById('cfg-som').checked && document.getElementById('cfg-falas').checked"), 'padrões: avisos e falas ligados, sem som');
  await js("document.getElementById('cfg-falas').click()"); await esp(600);
  const gravado = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
  ok(gravado.falas === false && gravado.avisos === true && gravado.pasta === null, 'preferência gravada no config.json: ' + JSON.stringify(gravado));
  ok(await js('Prefs.falas === false'), 'a cena passa a respeitar a preferência');
  await js("document.getElementById('cfg-falas').click()"); await esp(400);
  for (let k = 0; k < 14; k++) wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  await esp(200);
  ok(await js("document.getElementById('config').contains(document.activeElement)"), 'Tab não sai da caixa de configurações');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await esp(300);
  ok(await js("document.getElementById('config').hidden && document.activeElement.id === 'op-config'"), 'Esc fecha e devolve o foco ao botão');
  // com as Configurações abertas, L e M não valem; ligar o compacto fecha o relatório e as Configurações
  await js("document.getElementById('op-config').click()"); await esp(400);
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'M' }); wc.sendInputEvent({ type: 'char', keyCode: 'm' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'M' }); await esp(500);
  ok(await js("!document.body.classList.contains('compacto') && !document.getElementById('config').hidden"), 'M não liga o compacto com as Configurações abertas');
  ok(await js("document.getElementById('vista-cena').inert === true"), 'fundo inerte enquanto as Configurações estão abertas');
  await js("document.getElementById('config-fechar').click()"); await esp(300);
  ok(await js("document.getElementById('vista-cena').inert === false"), 'fundo volta ao normal ao fechar');
  await js("document.getElementById('op-config').click()"); await esp(300);
  await js("document.getElementById('op-compacto').click()"); await esp(800);
  ok(await js("document.body.classList.contains('compacto') && document.getElementById('config').hidden"), 'ligar o compacto fecha as Configurações');
  await js("document.getElementById('op-compacto').click()"); await esp(800);
  // modo compacto: botão liga, janela pequena e sempre no topo, sem desenhar a sala; M desliga e volta ao tamanho de antes
  win.setContentSize(1280, 790); await esp(600);
  await js("document.getElementById('op-compacto').click()"); await esp(900);
  const [cw, ch] = win.getContentSize();
  ok(await js("document.body.classList.contains('compacto') && !document.getElementById('vista-compacta').hidden && document.getElementById('vista-cena').hidden"), 'compacto: mostra a lista e esconde a sala');
  ok(win.isAlwaysOnTop() && cw <= 400 && ch <= 320, 'compacto: sempre no topo e janela pequena (' + cw + 'x' + ch + ')');
  ok((await js("document.querySelectorAll('#compacto-lista li[class]').length")) >= 3, 'compacto: uma linha por projeto');
  const cq1 = await js('Cena.quadros()'); await esp(800); const cq2 = await js('Cena.quadros()');
  ok(cq2 === cq1, 'compacto: a sala não é desenhada (' + (cq2 - cq1) + ' quadros)');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'M' }); wc.sendInputEvent({ type: 'char', keyCode: 'm' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'M' }); await esp(900);
  const [rw, rh] = win.getContentSize();
  ok(!win.isAlwaysOnTop() && rw === 1280 && rh === 790, 'M volta ao tamanho de antes e sem sempre-no-topo (' + rw + 'x' + rh + ')');
  ok(await js("!document.body.classList.contains('compacto') && !document.getElementById('vista-cena').hidden"), 'saiu do compacto: sala de volta');
  console.log(falhas ? falhas + ' FALHA(S)' : 'TUDO OK');
  app.exit(falhas ? 1 : 0);
}, 3500));
