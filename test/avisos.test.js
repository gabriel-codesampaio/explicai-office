const test = require('node:test');
const assert = require('node:assert');
const { criarAvisos, montarAviso, atrasoDoEnvio, limitar, AGRUPA_MS, MIN_ENTRE_AVISOS_MS, MAX_PENDENTES } = require('../src/avisos');

const sessao = (id, estado) => ({ id, estado });
const exec = (id, tipo, estado) => ({ id: 's1/agent-' + id, tipo, estado, descricao: 'SEGREDO da tarefa' });
const estadoDe = (sessoes, execucoes, projeto = 'proj') => ({ salas: [{ projeto, sessoes, execucoes }] });

test('a primeira leitura nunca avisa, mesmo com tudo já concluído ou aguardando', () => {
  const a = criarAvisos();
  assert.deepStrictEqual(a.processar(estadoDe([sessao('s1', 'aguardando')], [exec('1', 'qa', 'concluido'), exec('2', 'x', 'semSinal')])), []);
  assert.deepStrictEqual(a.processar(estadoDe([sessao('s1', 'aguardando')], [exec('1', 'qa', 'concluido'), exec('2', 'x', 'semSinal')])), [], 'sem mudança, sem aviso');
});

test('sessão que passa de trabalhando/delegando para aguardando avisa uma vez só', () => {
  const a = criarAvisos();
  a.processar(estadoDe([sessao('s1', 'trabalhando'), sessao('s2', 'delegando')], []));
  const r = a.processar(estadoDe([sessao('s1', 'aguardando'), sessao('s2', 'aguardando')], []));
  assert.deepStrictEqual(r.map((i) => [i.tipo, i.rotulo, i.projeto]), [['aguardando', 'Claude principal', 'proj'], ['aguardando', 'Claude principal', 'proj']]);
  assert.deepStrictEqual(a.processar(estadoDe([sessao('s1', 'aguardando'), sessao('s2', 'aguardando')], [])), []);
});

test('sessão nova já aguardando não avisa; voltar a trabalhar e aguardar de novo avisa', () => {
  const a = criarAvisos();
  a.processar(estadoDe([], []));
  assert.deepStrictEqual(a.processar(estadoDe([sessao('s1', 'aguardando')], [])), []);
  a.processar(estadoDe([sessao('s1', 'trabalhando')], []));
  assert.strictEqual(a.processar(estadoDe([sessao('s1', 'aguardando')], [])).length, 1);
});

test('execução que conclui avisa com o id da tarefa; já concluída ao aparecer não avisa', () => {
  const a = criarAvisos();
  a.processar(estadoDe([sessao('s1', 'delegando')], [exec('1', 'qa', 'trabalhando')]));
  const r = a.processar(estadoDe([sessao('s1', 'delegando')], [exec('1', 'qa', 'concluido'), exec('9', 'banco', 'concluido')]));
  assert.deepStrictEqual(r.map((i) => [i.tipo, i.rotulo, i.tarefaId]), [['concluido', 'qa', 's1/agent-1']]);
});

test('execução que fica sem sinal avisa; sem sinal que conclui depois também', () => {
  const a = criarAvisos();
  a.processar(estadoDe([], [exec('1', 'qa', 'trabalhando')]));
  assert.deepStrictEqual(a.processar(estadoDe([], [exec('1', 'qa', 'semSinal')])).map((i) => i.tipo), ['semSinal']);
  assert.deepStrictEqual(a.processar(estadoDe([], [exec('1', 'qa', 'concluido')])).map((i) => i.tipo), ['concluido']);
});

test('item que some dos dados é esquecido (não acumula)', () => {
  const a = criarAvisos();
  a.processar(estadoDe([], [exec('1', 'qa', 'trabalhando')]));
  a.processar(estadoDe([], []));
  // reaparece trabalhando e conclui: como foi esquecido, volta a valer como transição normal
  a.processar(estadoDe([], [exec('1', 'qa', 'trabalhando')]));
  assert.strictEqual(a.processar(estadoDe([], [exec('1', 'qa', 'concluido')])).length, 1);
});

test('um aviso só: título e corpo sem descrição nem relatório', () => {
  const av = montarAviso([{ tipo: 'concluido', projeto: 'proj', rotulo: 'qa', tarefaId: 's1/agent-1' }]);
  assert.deepStrictEqual([av.titulo, av.corpo, av.tarefaId], ['qa concluiu', 'Projeto proj', 's1/agent-1']);
  assert.ok(!JSON.stringify(av).includes('SEGREDO'));
  const aguarda = montarAviso([{ tipo: 'aguardando', projeto: 'proj', rotulo: 'Claude principal', tarefaId: null }]);
  assert.deepStrictEqual([aguarda.titulo, aguarda.tarefaId], ['Claude principal aguarda você', null]);
});

test('vários itens viram um aviso agrupado, com no máximo 4 linhas e "+N mais"', () => {
  const itens = [];
  for (let k = 0; k < 7; k++) itens.push({ tipo: 'concluido', projeto: 'proj', rotulo: 'ag' + k, tarefaId: 't' + k });
  const av = montarAviso(itens);
  assert.strictEqual(av.titulo, '7 avisos do Escrithorius');
  assert.strictEqual(av.corpo.split('\n').length, 5);
  assert.ok(av.corpo.endsWith('+3 mais'));
  assert.strictEqual(av.tarefaId, null, 'agrupado não abre relatório');
  assert.strictEqual(montarAviso([]), null);
});

test('nomes muito longos são cortados', () => {
  const av = montarAviso([{ tipo: 'concluido', projeto: 'p'.repeat(200), rotulo: 'a'.repeat(200), tarefaId: 't' }]);
  assert.ok(av.titulo.length < 70 && av.corpo.length < 60);
});

test('quem sumiu dos dados e volta já concluído não avisa (o estado antigo foi esquecido)', () => {
  const a = criarAvisos();
  a.processar(estadoDe([], [exec('1', 'qa', 'trabalhando')]));
  a.processar(estadoDe([], []));
  assert.deepStrictEqual(a.processar(estadoDe([], [exec('1', 'qa', 'concluido')])), []);
});

test('nomes com quebra de linha, controle ou inversão de texto não bagunçam o aviso', () => {
  const NL = String.fromCharCode(10), CR = String.fromCharCode(13), RLO = String.fromCharCode(8238), BEL = String.fromCharCode(7), DEL = String.fromCharCode(127);
  const av = montarAviso([{ tipo: 'concluido', projeto: 'proj' + NL + 'SEGUNDA', rotulo: 'qa' + RLO + 'evil' + CR + NL + 'falso', tarefaId: 't' }]);
  assert.ok(!(av.titulo + av.corpo).includes(NL) && !(av.titulo + av.corpo).includes(CR) && !(av.titulo + av.corpo).includes(RLO), JSON.stringify(av));
  const ctrl = montarAviso([{ tipo: 'concluido', projeto: 'p' + BEL + 'q', rotulo: 'a' + DEL + 'b', tarefaId: 't' }]);
  assert.strictEqual(ctrl.titulo, 'a b concluiu');
  assert.strictEqual(ctrl.corpo, 'Projeto p q');
  const agrupado = montarAviso([{ tipo: 'concluido', projeto: 'a' + NL + 'b', rotulo: 'x' + NL + 'y', tarefaId: 't' }, { tipo: 'aguardando', projeto: 'c', rotulo: 'z', tarefaId: null }]);
  assert.strictEqual(agrupado.corpo.split(NL).length, 2, 'só as 2 linhas do aviso');
});

test('nome que a máscara completa alteraria vira texto genérico', () => {
  const av = montarAviso([{ tipo: 'concluido', projeto: 'proj', rotulo: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4', tarefaId: 't' }]);
  assert.strictEqual(av.titulo, 'Agente concluiu');
  const proj = montarAviso([{ tipo: 'concluido', projeto: 'sk-abcdefghijklmnopqrstuvwxyz123456', rotulo: 'qa', tarefaId: 't' }]);
  assert.strictEqual(proj.corpo, 'Projeto oculto');
  assert.strictEqual(montarAviso([{ tipo: 'concluido', projeto: 'meu-projeto', rotulo: 'qa', tarefaId: 't' }]).corpo, 'Projeto meu-projeto');
});

test('frequência: o envio espera o agrupamento ou o intervalo mínimo desde o último aviso', () => {
  assert.strictEqual(atrasoDoEnvio(100000, 0), AGRUPA_MS, 'nunca avisou: só o agrupamento');
  assert.strictEqual(atrasoDoEnvio(100000, 100000 - MIN_ENTRE_AVISOS_MS - 1), AGRUPA_MS, 'último há muito tempo');
  assert.strictEqual(atrasoDoEnvio(100000, 99000), MIN_ENTRE_AVISOS_MS - 1000, 'último há 1 s: espera o resto do intervalo');
});

test('itens pendentes têm teto e ficam com os mais recentes', () => {
  const muitos = Array.from({ length: MAX_PENDENTES + 30 }, (_, k) => ({ k }));
  const r = limitar(muitos);
  assert.strictEqual(r.length, MAX_PENDENTES);
  assert.strictEqual(r[r.length - 1].k, MAX_PENDENTES + 29);
  assert.strictEqual(limitar([{ k: 1 }]).length, 1);
});

test('"possivelmente espera você": avisa uma vez na transição de não esperando para esperando, para sessão e execução ativas', () => {
  let relogio = 1_000_000;
  const a = criarAvisos({ agora: () => relogio });
  const sess = (esperando) => ({ id: 's1', estado: 'trabalhando', esperando });
  const ex = (esperando) => ({ ...exec('1', 'qa', 'trabalhando'), esperando });
  a.processar(estadoDe([sess(false)], [ex(false)]));
  const r = a.processar(estadoDe([sess(true)], [ex(true)]));
  assert.deepStrictEqual(r.map((i) => [i.tipo, i.rotulo]), [['esperando', 'Claude principal'], ['esperando', 'qa']]);
  assert.deepStrictEqual(a.processar(estadoDe([sess(true)], [ex(true)])), [], 'continuar esperando não repete');
  a.processar(estadoDe([sess(false)], [ex(false)]));
  relogio += 6 * 60 * 1000; // depois do período de silêncio
  assert.strictEqual(a.processar(estadoDe([sess(true)], [ex(false)])).length, 1, 'voltou a esperar depois de 5 min: avisa de novo');
});

test('esperando não avisa na primeira leitura, para item novo nem para sessão ociosa', () => {
  const a = criarAvisos();
  assert.deepStrictEqual(a.processar(estadoDe([{ id: 's1', estado: 'trabalhando', esperando: true }], [])), [], 'primeira leitura');
  assert.deepStrictEqual(a.processar(estadoDe([{ id: 's1', estado: 'trabalhando', esperando: true }, { id: 's2', estado: 'trabalhando', esperando: true }], [])), [], 'item novo já esperando');
  a.processar(estadoDe([{ id: 's3', estado: 'aguardando', esperando: false }], []));
  assert.deepStrictEqual(a.processar(estadoDe([{ id: 's3', estado: 'aguardando', esperando: true }], [])), [], 'sessão ociosa nunca espera você');
});

test('aviso de "possivelmente espera você": texto só com agente e projeto', () => {
  const av = montarAviso([{ tipo: 'esperando', projeto: 'proj', rotulo: 'Claude principal', tarefaId: null }]);
  assert.deepStrictEqual([av.titulo, av.corpo, av.tarefaId], ['Claude principal possivelmente espera você', 'Projeto proj', null]);
});

test('"possivelmente espera você" não repete para a mesma chave em 5 min (ferramenta lenta que volta e meia pendura), mas avisa de novo depois', () => {
  const { REAVISO_ESPERANDO_MS } = require('../src/avisos');
  let agora = 1_000_000;
  const a = criarAvisos({ agora: () => agora });
  const sess = (esperando) => ({ id: 's1', estado: 'trabalhando', esperando });
  a.processar(estadoDe([sess(false)], []));
  assert.strictEqual(a.processar(estadoDe([sess(true)], [])).length, 1, 'primeira vez avisa');
  for (let k = 0; k < 5; k++) { // ferramenta lenta atrás de ferramenta lenta: esperando, não esperando, esperando...
    agora += 20_000;
    a.processar(estadoDe([sess(false)], []));
    agora += 20_000;
    assert.strictEqual(a.processar(estadoDe([sess(true)], [])).length, 0, 'ciclo ' + k + ': não repete');
  }
  a.processar(estadoDe([sess(false)], []));
  agora += REAVISO_ESPERANDO_MS;
  assert.strictEqual(a.processar(estadoDe([sess(true)], [])).length, 1, 'passados 5 min avisa de novo');
});

test('o limite de reaviso é por sessão/execução: outra chave avisa normalmente', () => {
  let agora = 1_000_000;
  const a = criarAvisos({ agora: () => agora });
  const base = (e1, e2) => estadoDe([{ id: 's1', estado: 'trabalhando', esperando: e1 }, { id: 's2', estado: 'trabalhando', esperando: e2 }], []);
  a.processar(base(false, false));
  assert.strictEqual(a.processar(base(true, false)).length, 1);
  agora += 1000;
  a.processar(base(false, false));
  agora += 1000;
  const r = a.processar(base(true, true));
  assert.deepStrictEqual(r.length, 1, 's1 ainda em silêncio; s2 avisa');
});
