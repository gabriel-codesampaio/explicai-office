const test = require('node:test');
const assert = require('node:assert');
const C = require('../renderer/compacto.js');

const AGORA = 1_700_000_000_000;
const sessao = (id, estado, extra = {}) => ({ id, estado, inicio: AGORA - 600000, desde: AGORA - 30000, ...extra });
const exec = (id, estado, extra = {}) => ({ id, tipo: 'qa', estado, ...extra });
const estadoDe = (salas, resumo = {}) => ({ salas, resumo });

test('uma linha por projeto, com o estado que mais pede atenção', () => {
  const r = C.resumir(estadoDe([
    { projeto: 'a', sessoes: [sessao('1', 'aguardando')], execucoes: [] },
    { projeto: 'b', sessoes: [sessao('2', 'trabalhando')], execucoes: [] },
    { projeto: 'c', sessoes: [sessao('3', 'delegando')], execucoes: [exec('x', 'trabalhando'), exec('y', 'trabalhando'), exec('z', 'concluido')] },
    { projeto: 'd', sessoes: [sessao('4', 'trabalhando', { esperando: true })], execucoes: [] },
  ], { trabalhando: 2, delegando: 1, aguardando: 1 }), AGORA);
  assert.deepStrictEqual(r.linhas.map((l) => [l.chave, l.classe]), [['proj:a', 'aguardando'], ['proj:b', 'trabalhando'], ['proj:c', 'delegando'], ['proj:d', 'esperando']]);
  assert.strictEqual(r.linhas[0].texto, 'a: aguardando · 30 s');
  assert.strictEqual(r.linhas[2].texto, 'c: delegando · 2 agentes · 30 s');
  assert.strictEqual(r.linhas[3].texto, 'd: esperando você? · 30 s');
  assert.strictEqual(r.resumo, '3 em atividade · 1 aguardando');
});

test('esperando você vale para execução ativa, mas não para sessão ociosa nem execução encerrada', () => {
  const r = C.resumir(estadoDe([
    { projeto: 'a', sessoes: [sessao('1', 'delegando')], execucoes: [exec('x', 'trabalhando', { esperando: true })] },
    { projeto: 'b', sessoes: [sessao('2', 'aguardando', { esperando: true })], execucoes: [exec('y', 'concluido', { esperando: true })] },
  ]), AGORA);
  assert.deepStrictEqual(r.linhas.map((l) => l.classe), ['esperando', 'aguardando']);
});

test('execução ativa sem sessão trabalhando conta como trabalhando; um agente no singular', () => {
  const r = C.resumir(estadoDe([{ projeto: 'a', sessoes: [sessao('1', 'aguardando')], execucoes: [exec('x', 'trabalhando')] }]), AGORA);
  assert.strictEqual(r.linhas[0].classe, 'trabalhando');
  assert.strictEqual(r.linhas[0].texto, 'a: trabalhando · 1 agente · 30 s');
});

test('estado vazio ou incompleto não quebra', () => {
  assert.deepStrictEqual(C.resumir(undefined, AGORA), { resumo: '0 em atividade · 0 aguardando', linhas: [] });
  assert.deepStrictEqual(C.resumir({}, AGORA).linhas, []);
  assert.strictEqual(C.resumir(estadoDe([{ projeto: 'p' }]), AGORA).linhas[0].texto, 'p: aguardando');
});
