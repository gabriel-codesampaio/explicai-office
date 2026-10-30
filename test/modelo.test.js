const test = require('node:test');
const assert = require('node:assert');
const M = require('../renderer/modelo.js');

test('aparência: determinística, dentro das faixas, e diferente entre nomes', () => {
  assert.deepStrictEqual(M.aparencia('planejador'), M.aparencia('planejador'));
  for (const nome of ['planejador', 'qa', 'banco', 'seguranca', 'x', '', 'revisor-de-codigo', 'ação']) {
    const ap = M.aparencia(nome);
    assert.ok(ap.pele >= 0 && ap.pele < M.N_PELE);
    assert.ok(ap.cabelo >= 0 && ap.cabelo < M.N_CABELO);
    assert.ok(ap.estilo >= 0 && ap.estilo < M.N_ESTILO);
    assert.ok(ap.acessorio >= 0 && ap.acessorio < M.N_ACESSORIO);
    assert.ok(ap.camisa >= 0 && ap.camisa < M.N_CAMISA);
  }
  const nomes = ['planejador', 'qa', 'banco', 'seguranca', 'devops', 'docs', 'testes', 'revisor', 'Explore', 'Plan', 'general-purpose', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  assert.ok(new Set(nomes.map((n) => JSON.stringify(M.aparencia(n)))).size >= 18, 'quase todos os agentes devem ter aparências diferentes');
  for (const traco of ['pele', 'cabelo', 'estilo', 'acessorio', 'camisa']) {
    assert.ok(new Set(nomes.map((n) => M.aparencia(n)[traco])).size >= 2, 'o traço "' + traco + '" precisa variar com o nome');
  }
});

test('sessão: a camisa vem do projeto; o resto é igual para todas as sessões', () => {
  const x = M.aparencia('chefe', 'projeto-a');
  const y = M.aparencia('chefe', 'projeto-b');
  assert.strictEqual(x.pele, y.pele);
  assert.strictEqual(x.cabelo, y.cabelo);
  assert.strictEqual(M.aparencia('chefe', 'projeto-a').camisa, x.camisa);
});

test('sigla da skill: iniciais de duas palavras ou duas primeiras letras', () => {
  assert.strictEqual(M.siglaDe('frontend-design'), 'FD');
  assert.strictEqual(M.siglaDe('grill-me'), 'GM');
  assert.strictEqual(M.siglaDe('accessibility'), 'AC');
  assert.strictEqual(M.siglaDe('supabase-postgres-best-practices'), 'SP');
  assert.strictEqual(M.siglaDe('x'), 'X');
  assert.strictEqual(M.siglaDe('ação'), 'AÇ');
  assert.strictEqual(M.siglaDe('---'), '?');
  assert.strictEqual(M.siglaDe(''), '?');
  assert.strictEqual(M.siglaDe(undefined), '?');
});

test('resumoTopo: números do resumo, execuções em andamento e último evento', () => {
  const r = M.resumoTopo({
    resumo: { trabalhando: 3, delegando: 1, aguardando: 2, projetos: 2, sessoes: 3, concluidas: 5 },
    salas: [{ execucoes: [{ estado: 'trabalhando' }, { estado: 'semSinal' }, { estado: 'concluido' }] }, { execucoes: [{ estado: 'trabalhando' }] }],
    agentes: [{ inicio: 1000, fim: 5000 }, { inicio: 9000, fim: null }, { inicio: 2000, fim: 3000 }],
  });
  assert.deepStrictEqual(r, { trabalhando: 3, delegando: 1, aguardando: 2, projetos: 2, sessoes: 3, concluidas: 5, execucoes: 3, ultimo: 9000 });
});

test('resumoTopo: estado vazio, ausente ou com lixo vira zeros e sem último evento', () => {
  const zeros = { trabalhando: 0, delegando: 0, aguardando: 0, projetos: 0, sessoes: 0, concluidas: 0, execucoes: 0, ultimo: null };
  assert.deepStrictEqual(M.resumoTopo(undefined), zeros);
  assert.deepStrictEqual(M.resumoTopo({}), zeros);
  assert.deepStrictEqual(M.resumoTopo({ resumo: { trabalhando: -2, delegando: 'x', aguardando: NaN, projetos: 1.9 }, agentes: [{ inicio: 'a', fim: null }] }),
    { ...zeros, projetos: 1 });
});
