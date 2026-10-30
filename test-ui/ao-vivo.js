// Abre o app de verdade lendo o ~/.claude REAL (só leitura) e salva capturas da janela ao longo do tempo, para ver o fluxo ao vivo
// (agentes sendo chamados, trabalhando, encerrando). Preferências ficam numa pasta temporária (não mexe no config.json real).
// Uso: electron test-ui/ao-vivo.js <pasta-de-saida> [duracao-em-segundos=120] [intervalo-em-segundos=4] [projeto-para-rolar]
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const saida = process.argv[2] || path.join(os.tmpdir(), 'escrithorius-ao-vivo');
const duracao = Number(process.argv[3] || 120) * 1000, intervalo = Number(process.argv[4] || 4) * 1000;
const projeto = process.argv[5] || '';
fs.mkdirSync(saida, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'escr-vivo-')));
require(path.join(__dirname, '..', 'main.js'));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const js = (c) => win.webContents.executeJavaScript(c);
  win.show();
  const inicio = Date.now();
  let n = 0;
  const log = [];
  while (Date.now() - inicio < duracao) {
    if (projeto) await js(`(()=>{const h=Array.from(document.querySelectorAll('.sala-nome')).find(x=>x.textContent===${JSON.stringify(projeto)}); if(h) h.scrollIntoView({block:'start'});})()`);
    await espera(250);
    const img = await win.webContents.capturePage();
    const nome = 'ao-vivo-' + String(n).padStart(3, '0') + '.png';
    fs.writeFileSync(path.join(saida, nome), img.toPNG());
    const resumo = await js(`(()=>{ const p = Painel.projetos(ultimo, Date.now()).find(x => x.projeto === ${JSON.stringify(projeto)}) || Painel.projetos(ultimo, Date.now())[0];
      return { topo: document.getElementById('vivo-texto').textContent, itens: p ? p.itens.map(i => i.texto + (i.detalhe ? ' [' + i.detalhe + ']' : '')) : [] }; })()`);
    log.push({ t: Math.round((Date.now() - inicio) / 1000), arquivo: nome, ...resumo });
    console.log(JSON.stringify({ t: Math.round((Date.now() - inicio) / 1000), arquivo: nome, itens: resumo.itens }));
    n++;
    await espera(intervalo);
  }
  fs.writeFileSync(path.join(saida, 'log.json'), JSON.stringify(log, null, 2));
  app.exit(0);
}, 3500));
