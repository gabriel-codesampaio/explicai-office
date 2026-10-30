const test = require('node:test');
const assert = require('node:assert');
const S = require('../renderer/salas.js');
const Mov = require('../renderer/movimento.js');

const item = (chave, zona, idx) => ({ chave, zona, vaga: S.VAGAS[zona][idx], sentado: zona === 'estar' || !!S.VAGAS[zona][idx].sentado,
  aparencia: { pele: 0, cabelo: 0, estilo: 0, acessorio: 0, camisa: 0 }, rotulo: chave, tipo: 'execucao', losango: 'verde' });
const cabeca = (it) => ({ x: it.vaga.x, y: it.zona === 'mesa' ? it.vaga.y + Mov.ASSENTO_MESA : it.vaga.y });

// Anda o relógio em passos de 100 ms e devolve o último instante.
function rodar(m, de, ate) {
  let t = de;
  for (; t <= ate; t += 100) m.avancar(t);
  return t;
}
const vistaDe = (m, chave, projeto = 'p') => m.vistas(projeto).get(chave);

// ---------- geometria das rotas ----------
const pontas = [];
S.MESAS.forEach((v) => pontas.push({ x: v.x, y: v.y + Mov.ASSENTO_MESA, zona: 'mesa', baixo: v.y === 86 }));
S.CAFE.forEach((v) => pontas.push({ x: v.x, y: v.y, zona: 'cafe' }));
S.ESTAR.forEach((v) => pontas.push({ x: v.x, y: v.y, zona: 'estar' }));
pontas.push({ x: Mov.PORTA.x, y: Mov.PORTA.y, zona: 'porta' });
for (const x of [45, 90, 135]) pontas.push({ x, y: Mov.HUB_MEIO, zona: 'livre' }); // lugares de quem está à toa nos corredores

const obstaculos = [];
for (const v of S.MESAS) {
  obstaculos.push({ x0: v.x - 17, x1: v.x + 17, y0: v.y + 1, y1: v.y + 26 }); // mesa
  obstaculos.push({ x0: v.x - 9, x1: v.x + 9, y0: v.y + 27, y1: v.y + 38 }); // cadeira
}
for (const x of [196, 220]) obstaculos.push({ x0: x - 6, x1: x + 6, y0: 104, y1: 111 }); // mesinhas do café
obstaculos.push({ x0: 238, x1: 346, y0: 36, y1: 61 }); // sofá
for (const x of [257, 292, 327]) obstaculos.push({ x0: x - 14, x1: x + 14, y0: 90, y1: 117 }); // poltronas
for (const x of [183, 230]) { // divisórias (com passagens nos corredores)
  obstaculos.push({ x0: x, x1: x + 4, y0: 33, y1: 66 });
  obstaculos.push({ x0: x, x1: x + 4, y0: 86, y1: 120 });
}
// Os pés (8 px de largura, base da cabeça + 16 a +20) é que batem nas coisas: a cabeça pode passar por cima de uma cadeira.
const pesNoTrecho = (a, b) => ({
  x0: Math.min(a.x, b.x) - 4, x1: Math.max(a.x, b.x) + 4, y0: Math.min(a.y, b.y) + 16, y1: Math.max(a.y, b.y) + 20,
});
const bate = (p, o) => p.x1 > o.x0 && p.x0 < o.x1 && p.y1 > o.y0 && p.y0 < o.y1;

test('rotas entre quaisquer duas pontas: retas, dentro da sala e sem atravessar mesas, cadeiras, mesinhas, sofá, poltronas nem divisórias', () => {
  let n = 0;
  for (const de of pontas) for (const para of pontas) {
    if (de === para) continue;
    const r = Mov.rota(de, para);
    const nome = de.zona + '@' + de.x + ',' + de.y + ' -> ' + para.zona + '@' + para.x + ',' + para.y;
    assert.deepStrictEqual([r[0].x, r[0].y], [de.x, de.y], 'começa onde está: ' + nome);
    assert.deepStrictEqual([r[r.length - 1].x, r[r.length - 1].y], [para.x, para.y], 'termina no destino: ' + nome);
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      assert.ok(Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9, 'trecho reto: ' + nome);
      assert.ok(b.x >= 0 && b.x <= S.LARGURA && b.y >= 0 && b.y <= 150, 'dentro da sala: ' + nome);
      if (i === 1 || i === r.length - 1) continue; // sair do próprio lugar e chegar ao destino
      const p = pesNoTrecho(a, b);
      for (const o of obstaculos) assert.ok(!bate(p, o), 'atravessa um móvel em ' + nome + ' (trecho ' + i + ')');
      n++;
    }
  }
  assert.ok(n > 500, 'testou muitos trechos');
});

test('rota passa pelo corredor do meio ou de baixo e troca de corredor só pelas passagens', () => {
  const de = { x: 22, y: 86 + Mov.ASSENTO_MESA, zona: 'mesa', baixo: true }; // mesa de baixo
  const para = { x: 257, y: 40, zona: 'estar' };
  const r = Mov.rota(de, para);
  assert.ok(r.some((p) => p.y === Mov.HUB_BAIXO) && r.some((p) => p.y === Mov.HUB_MEIO));
  assert.ok(r.some((p) => p.x === Mov.LANE_ESTACOES), 'sobe pela passagem junto às mesas');
});

// ---------- comportamento ----------
test('primeira leitura: todos já aparecem no lugar, parados', () => {
  const m = Mov.criar();
  const a = item('a', 'mesa', 2), b = item('b', 'estar', 4);
  m.sincronizar('p', [a, b], true);
  const va = vistaDe(m, 'a'), vb = vistaDe(m, 'b');
  assert.deepStrictEqual([va.x, va.y, va.modo], [cabeca(a).x, cabeca(a).y, 'parado']);
  assert.deepStrictEqual([vb.x, vb.y, vb.modo], [cabeca(b).x, cabeca(b).y, 'parado']);
});

test('quem é chamado depois entra pela porta, corre até a mesa e senta', () => {
  const m = Mov.criar();
  m.sincronizar('p', [], true);
  m.avancar(0);
  const a = item('a', 'mesa', 5);
  m.sincronizar('p', [a], false);
  let v = vistaDe(m, 'a');
  assert.deepStrictEqual([v.x, v.y, v.modo], [Mov.PORTA.x, Mov.PORTA.y, 'correndo']);
  const t = rodar(m, 100, 20000);
  v = vistaDe(m, 'a');
  assert.deepStrictEqual([v.x, v.y, v.modo], [cabeca(a).x, cabeca(a).y, 'parado']);
  assert.ok(t > 100);
});

test('correr (ao ser chamado para a mesa) é 2,5x mais rápido que andar (ao ir para o café)', () => {
  const andado = (zona) => {
    const m = Mov.criar();
    m.sincronizar('p', [], true); m.avancar(0);
    m.sincronizar('p', [item('a', zona, 0)], false);
    m.avancar(100);
    return vistaDe(m, 'a').passo;
  };
  assert.ok(Math.abs(andado('mesa') - Mov.VEL.corre * 0.1) < 1e-6);
  assert.ok(Math.abs(andado('cafe') - Mov.VEL.anda * 0.1) < 1e-6);
  assert.ok(Mov.VEL.corre / Mov.VEL.anda >= 2.4);
});

test('ao concluir, sai da mesa andando e vai ao café', () => {
  const m = Mov.criar();
  const naMesa = item('a', 'mesa', 1);
  m.sincronizar('p', [naMesa], true); m.avancar(0);
  const noCafe = item('a', 'cafe', 0);
  m.sincronizar('p', [noCafe], false);
  assert.strictEqual(vistaDe(m, 'a').modo, 'andando');
  rodar(m, 100, 30000);
  const v = vistaDe(m, 'a');
  assert.deepStrictEqual([v.x, v.y, v.modo, v.zona], [noCafe.vaga.x, noCafe.vaga.y, 'parado', 'cafe']);
});

test('sessão que volta a trabalhar corre do sofá para a mesa', () => {
  const m = Mov.criar();
  m.sincronizar('p', [item('s', 'estar', 0)], true); m.avancar(0);
  m.sincronizar('p', [item('s', 'mesa', 0)], false);
  assert.strictEqual(vistaDe(m, 's').modo, 'correndo');
  rodar(m, 100, 20000);
  assert.strictEqual(vistaDe(m, 's').modo, 'parado');
});

test('mudar de ideia no meio do caminho não teleporta ninguém e termina no novo lugar', () => {
  const m = Mov.criar();
  m.sincronizar('p', [item('a', 'mesa', 6)], true); m.avancar(0);
  m.sincronizar('p', [item('a', 'cafe', 0)], false);
  let t = rodar(m, 100, 1500);
  const antes = vistaDe(m, 'a');
  assert.strictEqual(antes.modo, 'andando');
  const alvo = item('a', 'estar', 2);
  m.sincronizar('p', [alvo], false);
  m.avancar(t += 100);
  const depois = vistaDe(m, 'a');
  assert.ok(Math.hypot(depois.x - antes.x, depois.y - antes.y) <= Mov.VEL.corre * 0.25 + 1, 'sem salto');
  rodar(m, t, t + 60000);
  const v = vistaDe(m, 'a');
  assert.deepStrictEqual([v.x, v.y, v.modo], [alvo.vaga.x, alvo.vaga.y, 'parado']);
});

test('quem estava no café e some fica na sala à toa (parado, sem sair); quem estava na mesa some na hora', () => {
  const m = Mov.criar();
  m.sincronizar('p', [item('c', 'cafe', 1), item('m', 'mesa', 0)], true); m.avancar(0);
  m.sincronizar('p', [], false);
  assert.strictEqual(vistaDe(m, 'm'), undefined, 'da mesa some na hora');
  assert.strictEqual(vistaDe(m, 'c'), undefined, 'já não é um item da sala');
  assert.strictEqual(m.saindo('p').length, 0, 'não sai pela porta');
  const o = m.ociosos('p');
  assert.deepStrictEqual(o.map((x) => [x.chave, x.rotulo, x.modo]), [['c', 'c', 'parado']]);
});

test('quem está à toa passeia pela sala (café, sala de estar, corredor), nunca ocupa o lugar de outro e nunca some', () => {
  const m = Mov.criar({ rnd: (() => { let n = 7; return () => { n = (n * 16807) % 2147483647; return n / 2147483647; }; })() });
  const ativo = item('a', 'estar', 0);
  m.sincronizar('p', [item('c', 'cafe', 1), ativo], true); m.avancar(0);
  m.sincronizar('p', [ativo], false);
  const visitou = new Set();
  let t = 100;
  for (; t < 600000; t += 100) {
    m.avancar(t);
    const o = m.ociosos('p');
    assert.strictEqual(o.length, 1, 'continua na sala');
    assert.strictEqual(m.saindo('p').length, 0);
    if (o[0].modo === 'parado') visitou.add(o[0].zona + '|' + o[0].x + ',' + o[0].y);
    assert.ok(!(o[0].modo === 'parado' && o[0].x === ativo.vaga.x && o[0].y === ativo.vaga.y), 'não senta no lugar de quem está lá');
    assert.ok(o[0].x >= 0 && o[0].x <= S.LARGURA && o[0].y >= 0 && o[0].y <= S.ALTURA);
  }
  assert.ok(visitou.size >= 4, 'passeou por vários lugares: ' + visitou.size);
  assert.ok(Array.from(visitou).some((k) => k.startsWith('estar')) && Array.from(visitou).some((k) => k.startsWith('cafe')), 'café e sala de estar');
});

test('passando do limite de ociosos, o mais antigo sai pela porta e desaparece', () => {
  const m = Mov.criar();
  const todos = [];
  for (let k = 0; k <= Mov.MAX_OCIOSOS; k++) todos.push(item('c' + k, 'cafe', k % 4));
  for (const it of todos) m.sincronizar('p', [it], true);
  m.avancar(0);
  for (let k = 0; k <= Mov.MAX_OCIOSOS; k++) { m.sincronizar('p', todos.slice(k + 1), false); }
  assert.strictEqual(m.ociosos('p').length, Mov.MAX_OCIOSOS);
  assert.strictEqual(m.saindo('p').length, 1);
  assert.strictEqual(m.saindo('p')[0].chave, 'c0');
  rodar(m, 100, 60000);
  assert.strictEqual(m.saindo('p').length, 0, 'sumiu depois de sair');
});

test('sala que some leva os ociosos junto', () => {
  const m = Mov.criar();
  m.sincronizar('p', [item('c', 'cafe', 1)], true); m.avancar(0);
  m.sincronizar('p', [], false);
  m.manter([]);
  assert.strictEqual(m.ociosos('p').length, 0);
});

test('mesmo lugar: nada se mexe', () => {
  const m = Mov.criar();
  const a = item('a', 'mesa', 3);
  m.sincronizar('p', [a], true); m.avancar(0);
  for (let k = 0; k < 5; k++) { m.sincronizar('p', [a], false); m.avancar(1000 * (k + 1)); }
  const v = vistaDe(m, 'a');
  assert.deepStrictEqual([v.x, v.y, v.modo, v.passo], [cabeca(a).x, cabeca(a).y, 'parado', 0]);
});

test('uma pausa longa (janela escondida) não teleporta ninguém', () => {
  const m = Mov.criar();
  m.sincronizar('p', [], true); m.avancar(0);
  m.sincronizar('p', [item('a', 'cafe', 0)], false);
  m.avancar(100);
  const a = vistaDe(m, 'a');
  m.avancar(100 + 60000);
  const b = vistaDe(m, 'a');
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) <= Mov.VEL.anda * 0.25 + 1e-9);
});

test('salas diferentes são independentes e as que sumiram são esquecidas', () => {
  const m = Mov.criar();
  m.sincronizar('p1', [item('a', 'mesa', 0)], true);
  m.sincronizar('p2', [item('a', 'mesa', 0)], true);
  assert.ok(m.vistas('p1').get('a') && m.vistas('p2').get('a'));
  m.manter(['p2']);
  assert.strictEqual(m.vistas('p1').size, 0);
  assert.strictEqual(m.vistas('p2').size, 1);
});

test('item sem vaga (não coube) é ignorado', () => {
  const m = Mov.criar();
  m.sincronizar('p', [{ chave: 'x', zona: 'mesa', vaga: null }], true);
  assert.strictEqual(m.vistas('p').size, 0);
});

test('quem é chamado junto entra em fila pela porta, não um em cima do outro', () => {
  const m = Mov.criar();
  m.sincronizar('p', [], true); m.avancar(0);
  m.sincronizar('p', [item('a', 'mesa', 0), item('b', 'mesa', 1), item('c', 'mesa', 2)], false);
  const ys = ['a', 'b', 'c'].map((k) => vistaDe(m, k).y);
  assert.strictEqual(new Set(ys).size, 3);
  assert.ok(Math.min(...ys) === Mov.PORTA.y);
  rodar(m, 100, 30000);
  for (const k of ['a', 'b', 'c']) assert.strictEqual(vistaDe(m, k).modo, 'parado');
});

test('movimento reduzido: quem é chamado chega na hora, sem andar', () => {
  const m = Mov.criar();
  m.reduzir(true);
  m.sincronizar('p', [], true);
  m.avancar(1000);
  const it = item('exec:1', 'mesa', 2);
  m.sincronizar('p', [it], false); // chamado agora: normalmente entraria pela porta e correria
  m.avancar(1100);
  const v = vistaDe(m, 'exec:1');
  assert.strictEqual(v.modo, 'parado');
  assert.deepStrictEqual({ x: v.x, y: v.y }, cabeca(it));
});

test('movimento reduzido: quem está à toa fica parado onde está', () => {
  const m = Mov.criar();
  m.reduzir(true);
  const it = item('exec:2', 'cafe', 0);
  m.sincronizar('p', [it], true);
  m.avancar(1000);
  m.sincronizar('p', [], false);
  for (let t = 1100; t < 60000; t += 100) m.avancar(t);
  const o = m.ociosos('p');
  assert.deepStrictEqual([o.length, o[0].x, o[0].y, o[0].modo], [1, it.vaga.x, it.vaga.y, 'parado']);
});

// ---------- residentes: os agentes do catálogo esperam na sala até serem chamados ----------
const morador = (rotulo) => ({ rotulo, aparencia: { pele: 1, cabelo: 1, estilo: 0, acessorio: 0, camisa: 1 } });
const exec = (chave, rotulo, zona, idx) => Object.assign(item(chave, zona, idx), { rotulo });

test('residentes: cada agente do catálogo espera na sala, em lugares diferentes e livres, parado ao abrir o app', () => {
  const m = Mov.criar();
  const ativo = item('a', 'estar', 0);
  m.sincronizar('p', [ativo], true);
  m.residentes('p', ['planejador', 'banco', 'qa', 'seguranca'].map(morador), true);
  m.avancar(0);
  const o = m.ociosos('p');
  assert.deepStrictEqual(o.map((x) => x.rotulo).sort(), ['banco', 'planejador', 'qa', 'seguranca']);
  assert.ok(o.every((x) => x.res && x.modo === 'parado'));
  assert.strictEqual(new Set(o.map((x) => x.x + ',' + x.y)).size, 4, 'lugares diferentes');
  assert.ok(!o.some((x) => x.x === ativo.vaga.x && x.y === ativo.vaga.y), 'ninguém no lugar de quem está lá');
  m.residentes('p', ['planejador', 'banco', 'qa', 'seguranca'].map(morador), false);
  assert.strictEqual(m.ociosos('p').length, 4, 'chamar de novo não duplica');
});

test('residentes: ao ser chamado, o agente que esperava corre da onde está até a mesa (sem cópia)', () => {
  const m = Mov.criar();
  m.sincronizar('p', [], true);
  m.residentes('p', [morador('qa'), morador('banco')], true);
  m.avancar(0);
  const mesa = exec('exec:1', 'qa', 'mesa', 2);
  m.sincronizar('p', [mesa], false);
  m.residentes('p', [morador('qa'), morador('banco')], false);
  assert.deepStrictEqual(m.ociosos('p').map((x) => x.rotulo), ['banco'], 'o qa deixou de ser ocioso e não ganhou cópia');
  const v = vistaDe(m, 'exec:1');
  assert.strictEqual(v.modo, 'correndo');
  rodar(m, 100, 30000);
  assert.deepStrictEqual({ x: vistaDe(m, 'exec:1').x, y: vistaDe(m, 'exec:1').y }, cabeca(mesa));
  assert.strictEqual(m.ociosos('p').length, 1);
});

test('residentes: depois de concluir e sumir dos dados, volta a ser o residente (sem duplicar)', () => {
  const m = Mov.criar();
  m.sincronizar('p', [], true);
  m.residentes('p', [morador('qa')], true);
  m.avancar(0);
  m.sincronizar('p', [exec('exec:1', 'qa', 'mesa', 0)], false); m.residentes('p', [morador('qa')], false);
  rodar(m, 100, 20000);
  m.sincronizar('p', [exec('exec:1', 'qa', 'cafe', 0)], false); m.residentes('p', [morador('qa')], false); // concluiu: vai ao café
  rodar(m, 20100, 40000);
  m.sincronizar('p', [], false); m.residentes('p', [morador('qa')], false); // passaram os 2 min
  const o = m.ociosos('p');
  assert.deepStrictEqual(o.map((x) => [x.chave, x.res]), [['res:qa', true]]);
  assert.strictEqual(m.saindo('p').length, 0);
});

test('residentes: nunca são expulsos pelo limite de ociosos e saem se deixarem o catálogo', () => {
  const m = Mov.criar();
  m.sincronizar('p', [], true);
  m.residentes('p', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(morador), true);
  assert.strictEqual(m.ociosos('p').length, 8);
  m.residentes('p', ['a'].map(morador), false);
  assert.deepStrictEqual(m.ociosos('p').map((x) => x.rotulo), ['a']);
});

test('residentes: sala nova recebe os agentes entrando pela porta; sala que some leva todos', () => {
  const m = Mov.criar();
  m.sincronizar('q', [], false);
  m.residentes('q', [morador('qa')], false);
  m.avancar(0);
  assert.notStrictEqual(m.ociosos('q')[0].modo, 'parado', 'entra andando pela porta');
  m.manter([]);
  assert.strictEqual(m.ociosos('q').length, 0);
});

test('quem está à toa cede o lugar quando um item dos dados passa a ocupá-lo (ninguém fica no mesmo lugar)', () => {
  const m = Mov.criar({ rnd: () => 0 });
  m.sincronizar('p', [], true);
  m.residentes('p', ['a', 'b', 'c', 'd', 'e', 'f'].map(morador), true);
  m.avancar(0);
  const antes = m.ociosos('p');
  const alvo = antes.find((o) => o.zona === 'cafe');
  assert.ok(alvo, 'alguém no café');
  const idx = S.CAFE.findIndex((v) => v.x === alvo.x && v.y === alvo.y);
  const chegou = Object.assign(item('exec:9', 'cafe', idx), { rotulo: 'zz' }); // concluiu e foi para o mesmo lugar
  m.sincronizar('p', [chegou], false);
  rodar(m, 100, 300); // logo depois de chegar: quem estava lá já está indo para outro lugar
  const nolugar = m.ociosos('p').filter((o) => o.modo === 'parado' && o.x === chegou.vaga.x && o.y === chegou.vaga.y);
  assert.strictEqual(nolugar.length, 0, 'o ocioso cedeu o lugar na hora');
  rodar(m, 400, 60000);
  const parados = m.ociosos('p').filter((o) => o.modo === 'parado');
  assert.ok(!parados.some((o) => o.x === chegou.vaga.x && o.y === chegou.vaga.y), 'ninguém no lugar de quem chegou');
  const v = vistaDe(m, 'exec:9');
  assert.ok(v, 'o recém-chegado continua na sala');
});
