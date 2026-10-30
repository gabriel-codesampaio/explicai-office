const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const origem = process.argv[2] || require('node:path').join(__dirname, '..', 'dist', 'Escrithorius-1.0.0-portable.exe');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-exe-'));      // "outra pasta"
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-dados-'));    // não colide com app aberto
const exe = path.join(pasta, 'teste.exe');
fs.copyFileSync(origem, exe);
const proc = spawn(exe, [`--remote-debugging-port=9333`, `--user-data-dir=${dados}`], { stdio: 'ignore', detached: false });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function matar() {
  try {
    const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(dados)}*' -or $_.ExecutablePath -like '*${path.basename(pasta)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
    execFileSync('powershell', ['-NoProfile', '-Command', ps]);
  } catch {}
}
(async () => {
  let alvo = null;
  for (let i = 0; i < 40 && !alvo; i++) {
    await espera(1000);
    try { alvo = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page'); } catch {}
  }
  if (!alvo) { console.log('FALHA: janela não apareceu'); matar(); process.exit(1); }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
  const js = (expression) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })); }).then((x) => x.result.value);
  await espera(2500);
  console.log('título:', await js('document.title'));
  console.log('salas:', await js("document.querySelectorAll('.sala').length"), '| áreas:', await js("document.querySelectorAll('.area').length"), '| cartões:', await js("[...document.querySelectorAll('.card strong')].map(e=>e.textContent).join('/')"), '| AO VIVO:', await js("document.getElementById('vivo-texto').textContent.slice(0,60)"));
  await js("document.getElementById('modo-painel').click()"); await espera(400);
  console.log('mesas:', await js("[...document.querySelectorAll('#mesas li')].map(l=>l.firstChild.textContent).join(' | ')"));
  console.log('skills:', await js("document.querySelectorAll('#skills li').length"));
  console.log('atividade (3 primeiras):', await js("[...document.querySelectorAll('#atividade li')].slice(0,3).map(l=>l.firstChild.textContent).join(' | ')"));
  const cmd = (method, params) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await js("document.querySelector('li[data-tarefa]').scrollIntoView({block:'center'})");
  await espera(300);
  console.log('item visível na janela antes do clique:', await js("(()=>{const b=document.querySelector('li[data-tarefa]').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight})()"));
  const rect = await js("(()=>{const b=document.querySelector('li[data-tarefa]').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()");
  // clique de mouse real (entrada do navegador), com 1,2 s entre apertar e soltar
  await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await espera(1200);
  await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await espera(900);
  const painel = await js("({aberto: document.getElementById('painel').hidden===false, texto: document.getElementById('painel-texto').textContent})");
  console.log('clique real -> painel aberto:', painel.aberto, '| texto do relatório (não "indisponível"):', painel.texto.length > 20 && painel.texto !== 'Carregando...' && painel.texto !== 'Relatório indisponível.', '|', painel.texto.length, 'caracteres');
  console.log('menu removido no executável (sem DevTools por atalho):', 'conferir manualmente: Ctrl+Shift+I não deve abrir');
  ws.close(); matar();
  await espera(1500);
  try { fs.rmSync(pasta, { recursive: true, force: true }); fs.rmSync(dados, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
