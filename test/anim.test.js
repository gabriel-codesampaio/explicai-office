const test = require('node:test');
const assert = require('node:assert');
const A = require('../renderer/anim.js');

test('20 quadros por segundo', () => {
  assert.strictEqual(A.FPS, 20);
  assert.strictEqual(A.PASSO_MS, 50);
});

test('digitando alterna entre 2 quadros e a tela percorre 4', () => {
  const dig = new Set(), tela = new Set();
  for (let t = 0; t < 2000; t += 50) { dig.add(A.quadroDigitando(t)); tela.add(A.quadroTela(t)); }
  assert.deepStrictEqual([...dig].sort(), [0, 1]);
  assert.deepStrictEqual([...tela].sort(), [0, 1, 2, 3]);
  assert.notStrictEqual(A.quadroDigitando(0), A.quadroDigitando(140));
});

test('piscar: raro, curto, e cada personagem pisca em momentos diferentes', () => {
  const conta = (sem) => { let n = 0; for (let t = 0; t < 42000; t += 50) if (A.piscando(t, sem)) n++; return n; };
  const n = conta(123);
  assert.ok(n >= 20 && n <= 40, 'piscou em ' + n + ' de 840 quadros'); // 10 piscadas de ~3 quadros (140 ms a 20 fps)
  const fase = (sem) => { let t = 0; while (!A.piscando(t, sem)) t += 10; return t; };
  assert.notStrictEqual(fase(1), fase(500));
  assert.doesNotThrow(() => A.piscando(1e12, -77));
});

test('ZZZ: três letras que sobem (dy <= 0), se afastam em x e piscam/somem no ciclo', () => {
  let viuSumir = false;
  for (let t = 0; t < 4800; t += 50) {
    const z = A.zzz(t);
    assert.strictEqual(z.length, 3);
    for (const l of z) { assert.ok(l.dy <= 0 && l.dy >= -6); if (!l.visivel) viuSumir = true; }
    assert.ok(z[0].dx < z[2].dx);
  }
  assert.ok(viuSumir);
});

test('"?" balança entre 0 e -1', () => {
  const v = new Set();
  for (let t = 0; t < 2000; t += 50) v.add(A.duvidaDy(t));
  assert.deepStrictEqual([...v].sort(), [-1, 0]);
});

test('visto pula, para, e some depois de 4 s', () => {
  assert.strictEqual(A.visto(1000, 999), null); // antes de acontecer
  assert.ok(A.visto(1000, 1000).dy < 0); // começa pulando
  assert.strictEqual(A.visto(1000, 1000 + 2000).dy, 0); // depois fica parado
  assert.strictEqual(A.visto(1000, 1000 + 4001), null); // some
  assert.strictEqual(A.visto(-Infinity, 5000), null); // visto antes de o app abrir: não anima
  assert.strictEqual(A.visto(undefined, 5000), null);
});
