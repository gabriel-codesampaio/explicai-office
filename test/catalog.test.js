const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lerCatalogo } = require('../src/catalog');

function pasta(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-cat-'));
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  }
  return raiz;
}

test('caminho feliz: agente e skill', () => {
  const r = pasta({ 'agents/qa.md': '---\nname: qa\ndescription: Testa coisas\n---\ncorpo', 'skills/foo/SKILL.md': '---\nname: foo\ndescription: d\n---\n' });
  const c = lerCatalogo(r);
  assert.deepStrictEqual(c.agentes, [{ nome: 'qa', descricao: 'Testa coisas' }]);
  assert.deepStrictEqual(c.skills, [{ nome: 'foo', descricao: 'd' }]);
  fs.rmSync(r, { recursive: true, force: true });
});

test('arquivo com BOM e CRLF não some', () => {
  const r = pasta({ 'agents/bom.md': '﻿---\r\nname: bom\r\ndescription: com bom\r\n---\r\n' });
  assert.deepStrictEqual(lerCatalogo(r).agentes, [{ nome: 'bom', descricao: 'com bom' }]);
  fs.rmSync(r, { recursive: true, force: true });
});

test('cabeçalho maior que o trecho lido não faz o agente sumir', () => {
  const longo = 'palavra '.repeat(4000); // ~32 KB de description
  const r = pasta({ 'agents/grande.md': `---\nname: grande\ndescription: ${longo}\n---\n` });
  const [a] = lerCatalogo(r).agentes;
  assert.strictEqual(a.nome, 'grande');
  assert.ok(a.descricao.length <= 140);
  fs.rmSync(r, { recursive: true, force: true });
});

test('description em bloco YAML (> e |) junta as linhas', () => {
  const r = pasta({
    'agents/dobrado.md': '---\nname: dobrado\ndescription: >\n  primeira linha\n  segunda linha\ntools: Read\n---\n',
    'agents/literal.md': '---\nname: literal\ndescription: |-\n  uma\n  duas\n---\n',
  });
  const por = Object.fromEntries(lerCatalogo(r).agentes.map((a) => [a.nome, a.descricao]));
  assert.strictEqual(por.dobrado, 'primeira linha segunda linha');
  assert.strictEqual(por.literal, 'uma duas');
  fs.rmSync(r, { recursive: true, force: true });
});

test('sem cabeçalho usa o nome do arquivo; pasta de skill sem SKILL.md é ignorada', () => {
  const r = pasta({ 'agents/solto.md': 'só texto, sem cabeçalho', 'skills/vazia/outro.txt': 'x' });
  const c = lerCatalogo(r);
  assert.deepStrictEqual(c.agentes, [{ nome: 'solto', descricao: '' }]);
  assert.deepStrictEqual(c.skills, []);
  fs.rmSync(r, { recursive: true, force: true });
});

test('nome longo é mantido e a descrição é mascarada antes de ser cortada', () => {
  // O corte em 140 deixa 'sk-' + 8 letras do segredo (curto demais para qualquer regra casar):
  // se cortasse antes de mascarar, esse pedaço apareceria.
  const segredo = 'sk-' + 'q'.repeat(40);
  const desc = 'x '.repeat(64) + segredo; // 128 caracteres + segredo
  const r = pasta({ 'agents/code-review-specialist.md': `---\nname: code-review-specialist\ndescription: ${desc}\n---\n` });
  const [a] = lerCatalogo(r).agentes;
  assert.strictEqual(a.nome, 'code-review-specialist');
  assert.ok(!a.descricao.includes('sk-q'), a.descricao);
  fs.rmSync(r, { recursive: true, force: true });
});
