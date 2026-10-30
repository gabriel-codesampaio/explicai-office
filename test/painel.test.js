const test = require('node:test');
const assert = require('node:assert');
const P = require('../renderer/painel.js');

const AGORA = 1_700_000_000_000;
const sessao = (id, estado, min = 10) => ({ id, estado, inicio: AGORA - min * 60000 });
const exec = (id, tipo, estado, extra = {}) => ({ id: 's1/agent-' + id, tipo, estado, descricao: 'faz ' + id, inicio: AGORA - 9000, fim: estado === 'concluido' ? AGORA - 14000 : null, ...extra });
const mesas = (...nomes) => nomes.map((nome) => ({ nome }));

test('uma seção por projeto, na ordem recebida, com sessões primeiro e o estado real (delegando/aguardando)', () => {
  const r = P.projetos({
    salas: [
      { projeto: 'a', sessoes: [sessao('s1', 'delegando', 22)], execucoes: [exec('1', 'qa', 'trabalhando')] },
      { projeto: 'b', sessoes: [sessao('s2', 'aguardando', 3)], execucoes: [] },
    ], mesas: [],
  }, AGORA);
  assert.deepStrictEqual(r.map((p) => p.projeto), ['a', 'b']);
  assert.deepStrictEqual(r[0].itens.map((i) => [i.classe, i.texto]), [['delegando', 'Claude principal: delegando · 22 min'], ['trabalhando', 'qa: trabalhando · 9 s']]);
  assert.deepStrictEqual(r[1].itens.map((i) => [i.classe, i.texto]), [['aguardando', 'Claude principal: aguardando · 3 min']]);
});

test('lista TODAS as execuções, mesmo mais do que cabem na sala (8 mesas + 4 do café)', () => {
  const execs = [];
  for (let k = 0; k < 15; k++) execs.push(exec('t' + k, 'Explore', 'trabalhando'));
  for (let k = 0; k < 6; k++) execs.push(exec('c' + k, 'qa', 'concluido'));
  const r = P.projetos({ salas: [{ projeto: 'p', sessoes: [sessao('s1', 'delegando')], execucoes: execs }], mesas: [] }, AGORA);
  assert.strictEqual(r[0].itens.length, 1 + 15 + 6);
  assert.strictEqual(r[0].subtitulo, '15 execuções ativas · 6 encerradas');
});

test('execução ativa vem antes da encerrada; encerrada mostra "encerrou há"; só execução abre relatório', () => {
  const r = P.projetos({ salas: [{ projeto: 'p', sessoes: [sessao('s1', 'trabalhando')], execucoes: [exec('e', 'banco', 'concluido'), exec('a', 'qa', 'semSinal')] }], mesas: [] }, AGORA);
  assert.deepStrictEqual(r[0].itens.map((i) => i.classe), ['trabalhando', 'semSinal', 'concluido']);
  assert.strictEqual(r[0].itens[2].texto, 'banco: encerrada · encerrou há 14 s');
  assert.deepStrictEqual(r[0].itens.map((i) => i.tarefaId), [null, 's1/agent-a', 's1/agent-e']);
  assert.strictEqual(r[0].itens[1].detalhe, 'faz a');
});

test('à espera: agentes do catálogo sem execução ativa naquele projeto', () => {
  const estado = { salas: [
    { projeto: 'a', sessoes: [sessao('s1', 'delegando')], execucoes: [exec('1', 'qa', 'trabalhando'), exec('2', 'banco', 'concluido')] },
    { projeto: 'b', sessoes: [sessao('s2', 'aguardando')], execucoes: [] },
  ], mesas: mesas('planejador', 'banco', 'qa') };
  const r = P.projetos(estado, AGORA);
  assert.deepStrictEqual(r[0].espera, ['planejador', 'banco']);
  assert.deepStrictEqual(r[1].espera, ['planejador', 'banco', 'qa']);
});

test('estado vazio ou incompleto não quebra', () => {
  assert.deepStrictEqual(P.projetos(undefined, AGORA), []);
  assert.deepStrictEqual(P.projetos({}, AGORA), []);
  assert.strictEqual(P.projetos({ salas: [{ projeto: 'p' }] }, AGORA)[0].itens.length, 0);
  assert.strictEqual(P.projetos({ salas: [{ projeto: 'p', sessoes: [{ id: 'x', estado: 'trabalhando' }] }] }, AGORA)[0].itens[0].texto, 'Claude principal: trabalhando');
});

test('painel mostra a ferramenta em uso e marca "possivelmente esperando você"', () => {
  const sess = { id: 's1', estado: 'trabalhando', inicio: AGORA - 60000, ferramenta: { nome: 'Edit', desde: AGORA - 15000, pendente: true }, esperando: true };
  const ex = exec('1', 'qa', 'trabalhando', { ferr: { nome: 'Grep', desde: AGORA - 2000, pendente: false } });
  const r = P.projetos({ salas: [{ projeto: 'p', sessoes: [sess], execucoes: [ex] }], mesas: [] }, AGORA);
  assert.deepStrictEqual([r[0].itens[0].classe, r[0].itens[0].texto, r[0].itens[0].detalhe], ['trabalhando esperando', 'Claude principal: trabalhando · 1 min · possivelmente esperando você', 'Usando Edit há 15 s']);
  assert.strictEqual(r[0].itens[1].detalhe, 'faz 1 · Última ferramenta: Grep há 2 s');
});
