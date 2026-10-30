const test = require('node:test');
const assert = require('node:assert');
const S = require('../renderer/salas.js');

const AGORA = 1_700_000_000_000;
const sessao = (id, estado, minutos = 10) => ({ id, estado, inicio: AGORA - minutos * 60000, desde: AGORA - 5000 });
const exec = (id, tipo, estado, extra = {}) => ({ id: 's1/agent-' + id, sessaoId: 's1', tipo, estado, descricao: 'faz ' + id, projeto: 'p', inicio: AGORA - 9000, fim: estado === 'trabalhando' ? null : AGORA - 14000, ...extra });
const sala = (projeto, sessoes, execucoes) => ({ projeto, sessoes, execucoes });
const montar = (salas, lugares = S.criarLugares()) => S.montarSalas({ salas }, AGORA, lugares);

const retangulo = (a) => ({ x1: a.x, y1: a.y, x2: a.x + a.w, y2: a.y + a.h });
const sobrepoe = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

test('tempo: segundos, minutos e horas', () => {
  assert.strictEqual(S.fmtTempo(9000), '9 s');
  assert.strictEqual(S.fmtTempo(59999), '59 s');
  assert.strictEqual(S.fmtTempo(60000), '1 min');
  assert.strictEqual(S.fmtTempo(22 * 60000), '22 min');
  assert.strictEqual(S.fmtTempo(3600000), '1 h');
  assert.strictEqual(S.fmtTempo(3600000 + 5 * 60000), '1 h 5 min');
  assert.strictEqual(S.fmtTempo(-5), '0 s');
  assert.strictEqual(S.fmtTempo(NaN), '0 s');
});

test('onde cada um fica: trabalha/delega na mesa, sessão aguardando na sala de estar, execução encerrada no café', () => {
  assert.strictEqual(S.zonaDe('sessao', 'trabalhando'), 'mesa');
  assert.strictEqual(S.zonaDe('sessao', 'delegando'), 'mesa');
  assert.strictEqual(S.zonaDe('sessao', 'aguardando'), 'estar');
  assert.strictEqual(S.zonaDe('execucao', 'trabalhando'), 'mesa');
  assert.strictEqual(S.zonaDe('execucao', 'semSinal'), 'mesa');
  assert.strictEqual(S.zonaDe('execucao', 'concluido'), 'cafe');
});

test('sala com sessão e execuções: zonas, textos e áreas clicáveis', () => {
  const { salas } = montar([sala('nova', [sessao('a', 'delegando', 22)], [exec('1', 'qa', 'trabalhando'), exec('2', 'Explore', 'concluido')])]);
  assert.strictEqual(salas.length, 1);
  const s = salas[0];
  const por = (zona) => s.itens.filter((i) => i.zona === zona).map((i) => i.rotulo);
  assert.deepStrictEqual(por('mesa'), ['Claude principal', 'qa']);
  assert.deepStrictEqual(por('cafe'), ['Explore']);
  assert.deepStrictEqual(por('estar'), []);
  assert.strictEqual(s.subtitulo, '1 execução ativa');
  assert.strictEqual(s.resumo, '1 trabalhando · 1 delegando · 0 aguardando · 1 encerrada');
  const principal = s.itens.find((i) => i.tipo === 'sessao');
  assert.strictEqual(principal.tempo, '5 s', 'tempo da sessão = há quanto está neste estado (statusUpdatedAt), não há quanto abriu');
  assert.strictEqual(principal.losango, 'azul');
  assert.strictEqual(principal.tarefaId, null);
  const qa = s.itens.find((i) => i.rotulo === 'qa');
  assert.strictEqual(qa.tempo, '9 s');
  assert.strictEqual(qa.tarefaId, 's1/agent-1');
  assert.strictEqual(qa.losango, 'verde');
  const enc = s.itens.find((i) => i.rotulo === 'Explore');
  assert.strictEqual(enc.tempo, 'encerrou há 14 s');
  assert.strictEqual(enc.losango, 'cinza');
});

test('sessão aguardando vai para a sala de estar com losango laranja', () => {
  const { salas } = montar([sala('p', [sessao('a', 'aguardando', 16)], [])]);
  const i = salas[0].itens[0];
  assert.deepStrictEqual([i.zona, i.losango], ['estar', 'laranja']);
});

test('ninguém sai da sala nem se sobrepõe, mesmo com todas as vagas cheias', () => {
  const execs = [];
  for (let k = 0; k < 7; k++) execs.push(exec('t' + k, 'tipo' + k, 'trabalhando', { inicio: AGORA - 1000 * k }));
  for (let k = 0; k < 4; k++) execs.push(exec('c' + k, 'fim' + k, 'concluido'));
  const { salas } = montar([sala('p', [sessao('a', 'trabalhando'), sessao('b', 'aguardando'), sessao('c', 'aguardando'), sessao('d', 'aguardando')], execs)]);
  const itens = salas[0].itens;
  for (const i of itens) {
    assert.ok(i.area.x >= 0 && i.area.y >= 0 && i.area.x + i.area.w <= S.LARGURA && i.area.y + i.area.h <= S.ALTURA, i.chave + ' fora da sala');
    const faixa = S.ZONAS[{ mesa: 'estacoes', cafe: 'cafe', estar: 'estar' }[i.zona]];
    assert.ok(i.area.x >= faixa.x0 && i.area.x + i.area.w <= faixa.x1, i.chave + ' fora da sua zona');
  }
  for (let a = 0; a < itens.length; a++) for (let b = a + 1; b < itens.length; b++) {
    assert.ok(!sobrepoe(retangulo(itens[a].area), retangulo(itens[b].area)), itens[a].chave + ' sobrepõe ' + itens[b].chave);
  }
  assert.strictEqual(itens.filter((i) => i.zona === 'mesa').length, 8);
});

test('excesso vira contador por zona e some do desenho', () => {
  const execs = [];
  for (let k = 0; k < 11; k++) execs.push(exec('t' + k, 'x' + k, 'trabalhando', { inicio: AGORA - 1000 * k }));
  const { salas } = montar([sala('p', [], execs)]);
  assert.strictEqual(salas[0].itens.length, 8);
  assert.deepStrictEqual(salas[0].extras, { mesa: 3, cafe: 0, estar: 0 });
});

test('cada um mantém o lugar quando outro sai, e o lugar livre é reaproveitado', () => {
  const lugares = S.criarLugares();
  const todos = [exec('a', 'a', 'trabalhando', { inicio: 1 }), exec('b', 'b', 'trabalhando', { inicio: 2 }), exec('c', 'c', 'trabalhando', { inicio: 3 })];
  const vaga = (r, tipo) => r.salas[0].itens.find((i) => i.rotulo === tipo).vaga;
  const r1 = montar([sala('p', [], todos)], lugares);
  const [a1, c1] = [vaga(r1, 'a'), vaga(r1, 'c')];
  const r2 = montar([sala('p', [], [todos[0], todos[2]])], lugares); // b saiu
  assert.deepStrictEqual(vaga(r2, 'a'), a1);
  assert.deepStrictEqual(vaga(r2, 'c'), c1);
  const r3 = montar([sala('p', [], [todos[0], todos[2], exec('d', 'd', 'trabalhando', { inicio: 4 })])], lugares); // d entra no lugar de b
  assert.deepStrictEqual(vaga(r3, 'd'), vaga(r1, 'b'));
});

test('quem muda de estado troca de zona e libera a mesa', () => {
  const lugares = S.criarLugares();
  const r1 = montar([sala('p', [], [exec('a', 'a', 'trabalhando')])], lugares);
  assert.strictEqual(r1.salas[0].itens[0].zona, 'mesa');
  const r2 = montar([sala('p', [], [exec('a', 'a', 'concluido')])], lugares);
  assert.strictEqual(r2.salas[0].itens[0].zona, 'cafe');
  const r3 = montar([sala('p', [], [exec('a', 'a', 'trabalhando'), exec('b', 'b', 'trabalhando')])], lugares);
  assert.deepStrictEqual(r3.salas[0].itens.map((i) => i.zona), ['mesa', 'mesa']);
});

test('salas de projetos diferentes são independentes e em número limitado', () => {
  const lista = [];
  for (let k = 0; k < 15; k++) lista.push(sala('p' + k, [sessao('s' + k, 'trabalhando')], []));
  const r = montar(lista);
  assert.strictEqual(r.salas.length, S.MAX_SALAS);
  assert.strictEqual(r.maisSalas, 3);
  assert.ok(r.salas.every((s) => s.itens[0].vaga.x === S.MESAS[0].x), 'cada sala começa na primeira mesa');
});

test('dica e texto de acessibilidade: só o nome do projeto, estado e tempo', () => {
  const { salas } = montar([sala('nova', [], [exec('1', 'qa', 'trabalhando')])]);
  const i = salas[0].itens[0];
  assert.deepStrictEqual(i.dica, ['qa', 'trabalhando · 9 s', 'Projeto nova', 'faz 1']);
  assert.strictEqual(i.aria, 'Agente qa no projeto nova: trabalhando, 9 s');
});

test('estado vazio ou incompleto não quebra', () => {
  assert.deepStrictEqual(S.montarSalas(undefined, AGORA, S.criarLugares()), { salas: [], maisSalas: 0 });
  assert.deepStrictEqual(S.montarSalas({}, AGORA, S.criarLugares()).salas, []);
  const r = montar([{ projeto: 'p' }]);
  assert.deepStrictEqual([r.salas[0].itens.length, r.salas[0].subtitulo], [0, '0 execuções ativas']);
});

test('o alocador respeita a capacidade e devolve -1 para quem não coube', () => {
  const al = S.criarAlocador(2);
  const m = al.atribuir(['a', 'b', 'c']);
  assert.deepStrictEqual([m.get('a'), m.get('b'), m.get('c')], [0, 1, -1]);
  const m2 = al.atribuir(['b', 'c']); // a saiu: c passa a caber
  assert.deepStrictEqual([m2.get('b'), m2.get('c')], [1, 0]);
});

test('dica e aria de execução encerrada não repetem "encerrada"', () => {
  const { salas } = montar([sala('nova', [], [exec('1', 'Explore', 'concluido')])]);
  assert.deepStrictEqual(salas[0].itens[0].dica, ['Explore', 'encerrou há 14 s', 'Projeto nova', 'faz 1']);
  assert.strictEqual(salas[0].itens[0].aria, 'Agente Explore no projeto nova: encerrou há 14 s');
});

test('trajeto: só execuções em andamento ligam à sessão da sala', () => {
  const { salas } = montar([sala('p', [sessao('s1', 'delegando')], [exec('1', 'qa', 'trabalhando'), exec('2', 'Explore', 'concluido'), exec('3', 'x', 'semSinal', { sessaoId: 'outra' })])]);
  const pares = S.arcosDe(salas[0]).map(([pai, filho]) => [pai.chave, filho.rotulo]);
  assert.deepStrictEqual(pares, [['sessao:s1', 'qa']]);
});

test('dica da execução traz a duração das últimas do mesmo tipo (sem ela mesma nem de outros tipos)', () => {
  const feita = (id, tipo, dur, ha = 600000) => ({ id: 's1/agent-' + id, tipo, estado: 'concluido', inicio: AGORA - ha, fim: AGORA - ha + dur });
  const estado = { salas: [sala('p', [sessao('s1', 'delegando')], [exec('1', 'qa', 'trabalhando')])],
    agentes: [feita('a', 'qa', 45000, 300000), feita('b', 'qa', 120000, 900000), feita('c', 'banco', 9000), { id: 's1/agent-1', tipo: 'qa', estado: 'trabalhando', inicio: AGORA - 9000, fim: null }] };
  const { salas } = S.montarSalas(estado, AGORA, S.criarLugares());
  const qa = salas[0].itens.find((i) => i.rotulo === 'qa');
  assert.ok(qa.dica.some((l) => l === 'Últimas execuções: 45 s · 2 min'), JSON.stringify(qa.dica));
  const sem = montar([sala('p', [sessao('s1', 'delegando')], [exec('1', 'qa', 'trabalhando')])]).salas[0].itens.find((i) => i.rotulo === 'qa');
  assert.ok(!sem.dica.some((l) => l.startsWith('Últimas')));
});

test('easter eggs: áreas dentro da sala e sem sobreposição com mesas, café ou sofá', () => {
  const todos = [];
  for (const [nome, o] of Object.entries(S.OVOS)) {
    assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= S.LARGURA && o.y + o.h <= S.ALTURA, nome);
    todos.push([nome, retangulo(o)]);
  }
  for (const zona of ['mesa', 'cafe', 'estar']) {
    for (const v of S.VAGAS[zona]) {
      const a = zona === 'mesa' ? { x: v.x - S.CELULA.w / 2, y: v.y, w: S.CELULA.w, h: S.CELULA.h } : { x: v.x - 10, y: v.y - 2, w: 20, h: 26 };
      for (const [nome, r] of todos) assert.ok(!sobrepoe(r, retangulo(a)), nome + ' x ' + zona);
    }
  }
});

test('histórico: nunca inclui a própria execução (já encerrada) e mostra no máximo 3', () => {
  const feita = (id, dur, ha) => ({ id: 's1/agent-' + id, tipo: 'qa', estado: 'concluido', inicio: AGORA - ha, fim: AGORA - ha + dur });
  const propria = feita('1', 7000, 60000);
  const estado = { salas: [sala('p', [sessao('s1', 'delegando')], [exec('1', 'qa', 'concluido', { inicio: propria.inicio, fim: propria.fim })])],
    agentes: [propria, feita('a', 1000, 100000), feita('b', 2000, 200000), feita('c', 3000, 300000), feita('d', 4000, 400000)] };
  const { salas } = S.montarSalas(estado, AGORA, S.criarLugares());
  const linha = salas[0].itens.find((i) => i.rotulo === 'qa').dica.find((l) => l.startsWith('Últimas'));
  assert.strictEqual(linha, 'Últimas execuções: 1 s · 2 s · 3 s');
});

test('escala da sala: inteira em pixels do dispositivo com qualquer zoom do Windows, sem passar da largura nem de 4x CSS', () => {
  for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
    for (let largura = 640; largura <= 2600; largura += 7) {
      const { k, escala } = S.escalaDaTela(largura, dpr);
      assert.ok(Number.isInteger(k) && k >= 1, 'k inteiro');
      assert.ok(Math.abs(escala * dpr - k) < 1e-9, 'escala * dpr = k');
      assert.ok(Math.abs(Math.round(S.LARGURA * escala * dpr) - S.LARGURA * k) < 1e-6, 'canvas em pixels inteiros do dispositivo');
      assert.ok(escala <= 4 + 1e-9, 'no máximo 4x CSS');
      if (k > 1) assert.ok(S.LARGURA * escala <= largura - 58 + 1e-6, 'cabe na largura: ' + dpr + ' ' + largura);
    }
  }
});

test('escala da sala: com zoom de 100% continua igual à regra antiga (1 a 4)', () => {
  const antiga = (l) => Math.max(1, Math.min(4, Math.floor((l - 58) / S.LARGURA)));
  for (let l = 640; l <= 2000; l += 5) assert.strictEqual(S.escalaDaTela(l, 1).escala, antiga(l), String(l));
  assert.strictEqual(S.escalaDaTela(1280, undefined).escala, 3);
  assert.strictEqual(S.escalaDaTela(1280, 0).escala, 3);
});

test('dica mostra a ferramenta em uso (só o nome) e avisa "possivelmente esperando você"', () => {
  const sess = { id: 's1', estado: 'trabalhando', inicio: AGORA - 60000, ferramenta: { nome: 'Bash', desde: AGORA - 20000, pendente: true }, esperando: true };
  const ex = exec('1', 'qa', 'trabalhando', { ferr: { nome: 'Read', desde: AGORA - 3000, pendente: false }, esperando: false });
  const { salas } = montar([sala('p', [sess], [ex])]);
  const s = salas[0].itens.find((i) => i.tipo === 'sessao'), q = salas[0].itens.find((i) => i.rotulo === 'qa');
  assert.ok(s.dica.includes('Usando Bash há 20 s'), JSON.stringify(s.dica));
  assert.ok(s.dica.some((l) => l.startsWith('Possivelmente esperando você')));
  assert.ok(s.aria.includes('possivelmente esperando você'));
  assert.ok(q.dica.includes('Última ferramenta: Read há 3 s'), JSON.stringify(q.dica));
  assert.ok(!q.dica.some((l) => l.startsWith('Possivelmente')));
});

test('ferramenta e "esperando" só valem para quem está ativo; ferramenta antiga some', () => {
  const sess = { id: 's1', estado: 'aguardando', inicio: AGORA - 60000, ferramenta: { nome: 'Bash', desde: AGORA - 20000, pendente: true }, esperando: true };
  const velha = exec('2', 'x', 'trabalhando', { ferr: { nome: 'Read', desde: AGORA - 600000, pendente: false } });
  const { salas } = montar([sala('p', [sess], [velha])]);
  const s = salas[0].itens.find((i) => i.tipo === 'sessao'), x = salas[0].itens.find((i) => i.rotulo === 'x');
  assert.ok(!s.esperando && !s.dica.some((l) => l.includes('Bash') || l.startsWith('Possivelmente')), JSON.stringify(s.dica));
  assert.ok(!x.dica.some((l) => l.includes('Read')));
  assert.strictEqual(S.linhaFerramenta(null, AGORA), '');
  assert.strictEqual(S.linhaFerramenta({ nome: 'Bash', desde: null, pendente: true }, AGORA), 'Usando Bash');
});

test('tempo da sessão: sem data de status, cai para o início da sessão', () => {
  const sem = { id: 's1', estado: 'trabalhando', inicio: AGORA - 22 * 60000 };
  const { salas } = montar([sala('p', [sem], [])]);
  assert.strictEqual(salas[0].itens[0].tempo, '22 min');
});
