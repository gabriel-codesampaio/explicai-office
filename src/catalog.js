// Catálogo local (SOMENTE LEITURA): agentes (~/.claude/agents/*.md) e skills (~/.claude/skills/*/SKILL.md).
// Lê só o começo do arquivo (name e description); o resto nunca entra no estado.
const fs = require('node:fs');
const path = require('node:path');
const { mask, maskNome } = require('./mask');

const LEITURA = 16384;

// Devolve null se o arquivo não pôde ser lido; {nome:'', descricao:''} se não há cabeçalho legível.
function cabecalho(arquivo) {
  let texto;
  try {
    const fd = fs.openSync(arquivo, 'r');
    try {
      const buf = Buffer.alloc(LEITURA);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      texto = buf.toString('utf8', 0, n);
    } finally {
      fs.closeSync(fd);
    }
  } catch { return null; }
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1); // BOM (comum em arquivos criados pelo PowerShell 5)
  const m = texto.match(/^---\r?\n([\s\S]*?)(?:\r?\n---|$)/); // o fechamento pode estar além do que foi lido
  if (!m) return { nome: '', descricao: '' };
  const linhas = m[1].split(/\r?\n/);
  const campo = (chave) => {
    const i = linhas.findIndex((l) => l.startsWith(chave + ':'));
    if (i < 0) return '';
    const valor = linhas[i].slice(chave.length + 1).trim();
    if (/^[>|][+-]?$/.test(valor)) { // YAML em bloco: junta as linhas indentadas que seguem
      const partes = [];
      for (let j = i + 1; j < linhas.length && /^\s+\S/.test(linhas[j]); j++) partes.push(linhas[j].trim());
      return partes.join(' ');
    }
    return valor.replace(/^["']|["']$/g, '');
  };
  return { nome: campo('name'), descricao: campo('description') };
}

function limitar(t, max) {
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// Mascara antes de cortar: um segredo cortado ao meio escaparia da máscara.
function item(c, fallback) {
  return { nome: maskNome(c.nome || fallback), descricao: limitar(mask(c.descricao), 140) };
}

function lerCatalogo(claudeDir) {
  const agentes = [];
  const skills = [];
  const dirAgentes = path.join(claudeDir, 'agents');
  let nomes = [];
  try { nomes = fs.readdirSync(dirAgentes); } catch { /* sem agentes */ }
  for (const n of nomes) {
    if (!n.endsWith('.md')) continue;
    const c = cabecalho(path.join(dirAgentes, n));
    if (c) agentes.push(item(c, n.replace(/\.md$/, '')));
  }
  const dirSkills = path.join(claudeDir, 'skills');
  try { nomes = fs.readdirSync(dirSkills); } catch { nomes = []; }
  for (const n of nomes) {
    const c = cabecalho(path.join(dirSkills, n, 'SKILL.md'));
    if (c) skills.push(item(c, n));
  }
  return { agentes, skills };
}

module.exports = { lerCatalogo };
