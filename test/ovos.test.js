const test = require('node:test');
const assert = require('node:assert');
const Ovos = require('../renderer/ovos.js');

const fixo = (n, estado) => ({ zona: 'fixo', chave: 'fixo:' + n, estado });
const T0 = new Date(2026, 9, 25, 12, 0, 0).getTime();

test('noite: dia claro, noite escura e rampas suaves no fim e no começo do dia', () => {
  for (const h of [8, 12, 17.5]) assert.strictEqual(Ovos.noite(h), 0);
  for (const h of [21, 23.9, 0, 3, 5.5]) assert.strictEqual(Ovos.noite(h), 1);
  assert.ok(Math.abs(Ovos.noite(19) - 0.5) < 1e-9);
  assert.ok(Math.abs(Ovos.noite(6.5) - 0.5) < 1e-9);
  let ant = 0;
  for (let h = 17.5; h <= 20.5; h += 0.25) { const n = Ovos.noite(h); assert.ok(n >= ant); ant = n; }
  for (let h = 0; h < 24; h += 0.1) { const n = Ovos.noite(h); assert.ok(n >= 0 && n <= 1); }
});

test('noite: entradas estranhas não quebram (sem hora = dia)', () => {
  assert.strictEqual(Ovos.noite(NaN), 0);
  assert.strictEqual(Ovos.noite(undefined), 0);
  assert.strictEqual(Ovos.noite(25), Ovos.noite(1));
  assert.strictEqual(Ovos.noite(-1), Ovos.noite(23));
});

test('toda conclusão ganha uma frase da lista, com o nome do autor, e nunca repete a anterior', () => {
  const Frases = require('../renderer/frases.js');
  const o = Ovos.criar({ rnd: () => 0 }); // sorteio fixo: sem o filtro, repetiria sempre a primeira
  const s = [fixo('a', 'concluido'), fixo('b', 'trabalhando')];
  let anterior = null;
  for (let i = 0; i < 6; i++) {
    const f = o.concluiu(s, 'fixo:a', T0 + i * 10000);
    assert.ok(Frases.LISTA.some((x) => x.frase === f.texto && x.autor === f.autor), JSON.stringify(f));
    assert.notStrictEqual(f.texto, anterior);
    anterior = f.texto;
  }
});

test('as frases variam: não há uma frase fixa para a primeira conclusão do dia', () => {
  const o = Ovos.criar();
  const textos = [];
  for (let i = 0; i < 20; i++) textos.push(o.concluiu([fixo('a', 'concluido'), fixo('b', 'parado')], 'fixo:a', T0 + i * 1000).texto);
  assert.ok(new Set(textos).size > 3, 'varia');
});

test('"Equipe completa" quando todas as execuções da sala estão concluídas juntas (e há pelo menos 2)', () => {
  const o = Ovos.criar();
  assert.deepStrictEqual(o.concluiu([fixo('a', 'concluido'), fixo('b', 'concluido')], 'fixo:b', T0), { texto: 'Equipe completa: tudo entregue!', autor: '' });
  assert.notStrictEqual(o.concluiu([fixo('a', 'concluido')], 'fixo:a', T0 + 2000).texto, 'Equipe completa: tudo entregue!'); // só uma: não é equipe completa
  assert.notStrictEqual(o.concluiu([fixo('a', 'concluido'), fixo('b', 'desligado')], 'fixo:a', T0 + 3000).texto, 'Equipe completa: tudo entregue!');
});

test('a fala some depois de 4 s', () => {
  const o = Ovos.criar();
  o.concluiu([fixo('a', 'concluido')], 'fixo:a', T0);
  const f = o.fala('fixo:a', T0 + 3999);
  assert.ok(f && f.texto && f.autor);
  assert.strictEqual(o.fala('fixo:a', T0 + 4000), null);
  assert.strictEqual(o.fala('fixo:b', T0), null);
});

test('combo: 5 conclusões em 10 min mostram o banner por 8 s e zeram a contagem', () => {
  const o = Ovos.criar();
  const s = [fixo('a', 'concluido')];
  for (let i = 0; i < 4; i++) o.concluiu(s, 'fixo:a', T0 + i * 60000);
  assert.strictEqual(o.combo(T0 + 4 * 60000), false);
  o.concluiu(s, 'fixo:a', T0 + 4 * 60000);
  assert.strictEqual(o.combo(T0 + 4 * 60000), true);
  assert.strictEqual(o.combo(T0 + 4 * 60000 + 7999), true);
  assert.strictEqual(o.combo(T0 + 4 * 60000 + 8000), false);
  for (let i = 5; i < 9; i++) o.concluiu(s, 'fixo:a', T0 + i * 60000);
  assert.strictEqual(o.combo(T0 + 9 * 60000), false); // contagem recomeçou: só 4
});

test('combo: conclusões espalhadas por mais de 10 min não contam', () => {
  const o = Ovos.criar();
  const s = [fixo('a', 'concluido')];
  for (let i = 0; i < 8; i++) o.concluiu(s, 'fixo:a', T0 + i * 4 * 60000); // uma a cada 4 min: no máximo 3 na janela
  assert.strictEqual(o.combo(T0 + 8 * 4 * 60000), false);
});
