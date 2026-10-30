// Preferências do usuário, guardadas num arquivo pequeno (config.json) na pasta de dados do app.
// É a única coisa que o app grava em disco por conta própria: só 3 liga/desliga e, se o usuário escolher, a pasta do Claude.
// Nada de sessões, relatórios ou segredos. Tudo é validado ao ler e ao receber da tela.
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = 'config.json';
const MAX_BYTES = 16 * 1024;
const PADRAO = Object.freeze({ avisos: true, som: false, falas: true, pasta: null });
const BOOLEANAS = ['avisos', 'som', 'falas'];

// Formato aceitável de pasta: texto, absoluta, sem caractere nulo e que NÃO seja caminho de rede (\\servidor\\pasta ou //servidor/pasta:
// consultá-lo pode abrir conexão SMB com um servidor remoto). Não confere se existe. Devolve o caminho resolvido ou null.
function pastaPlausivel(p) {
  if (typeof p !== 'string' || !p || p.length > 500 || p.includes('\0') || !path.isAbsolute(p) || /^[\\/]{2}/.test(p)) return null;
  return path.resolve(p);
}

// Pasta que o usuário acabou de escolher: formato aceitável E existe como pasta. Senão, null.
function validarPasta(p) {
  const r = pastaPlausivel(p);
  if (!r) return null;
  try { return fs.statSync(r).isDirectory() ? r : null; } catch { return null; }
}

// Aceita só o que conhecemos, com o tipo certo; o resto cai no padrão.
function normalizar(obj) {
  const o = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  const r = { ...PADRAO };
  for (const k of BOOLEANAS) if (typeof o[k] === 'boolean') r[k] = o[k];
  r.pasta = pastaPlausivel(o.pasta); // mantém a escolha mesmo se a pasta estiver offline agora (pendrive, rede); o monitor avisa se não existir
  return r;
}

function carregar(dir) {
  try {
    const arquivo = path.join(dir, ARQUIVO);
    if (fs.statSync(arquivo).size > MAX_BYTES) return { ...PADRAO };
    return normalizar(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
  } catch { return { ...PADRAO }; }
}

// Escrita em arquivo temporário + renomear (nunca deixa o config.json pela metade). Nunca lança erro.
function salvar(dir, cfg) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, ARQUIVO), tmp = destino + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(normalizar(cfg), null, 2));
    fs.renameSync(tmp, destino);
    return true;
  } catch { return false; }
}

// Aplica as mudanças vindas da tela: só as chaves booleanas conhecidas, só com booleano estrito. A pasta NÃO passa por aqui
// (ela só muda pelo seletor nativo de pastas, no processo principal).
function aplicar(atual, mudancas) {
  const r = normalizar(atual);
  if (mudancas && typeof mudancas === 'object' && !Array.isArray(mudancas)) {
    for (const k of BOOLEANAS) if (typeof mudancas[k] === 'boolean') r[k] = mudancas[k];
  }
  return r;
}

// "C:\Users\fulano\.claude" -> "~\.claude": não mostra o nome de usuário na tela.
function abreviar(p, home) {
  if (typeof p !== 'string') return '';
  if (home && p.toLowerCase().startsWith(home.toLowerCase()) && (p.length === home.length || /[\\/]/.test(p[home.length]))) return '~' + p.slice(home.length);
  return p;
}

module.exports = { carregar, salvar, normalizar, aplicar, validarPasta, pastaPlausivel, abreviar, PADRAO, ARQUIVO, MAX_BYTES };
