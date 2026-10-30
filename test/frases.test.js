const test = require('node:test');
const assert = require('node:assert');
const { LISTA, sortear } = require('../renderer/frases.js');

test('lista de frases: autor e frase preenchidos, curtos, em português, sem repetição e sem caracteres de controle', () => {
  assert.ok(LISTA.length >= 20);
  const vistas = new Set();
  for (const x of LISTA) {
    assert.ok(x.autor && x.frase, JSON.stringify(x));
    assert.ok(x.frase.length <= 70 && x.autor.length <= 20, x.frase);
    assert.ok(!/[\u0000-\u001f<>]/.test(x.frase + x.autor), x.frase);
    assert.ok(!vistas.has(x.frase), 'repetida: ' + x.frase);
    vistas.add(x.frase);
  }
  assert.ok(new Set(LISTA.map((x) => x.autor)).size >= 10, 'várias personas (autores) diferentes');
  // português: nenhuma das palavras inglesas comuns das falas antigas
  const INGLES = ['the', 'you', 'your', 'and', 'with', 'my', 'is', 'to', 'of', 'it'];
  const palavras = (s) => s.toLowerCase().split(/[^a-zà-ú]+/).filter(Boolean);
  assert.ok(!LISTA.some((x) => palavras(x.frase).some((p) => INGLES.includes(p))), 'frase em inglês');
  assert.ok(palavras('Take the money and run').some((p) => INGLES.includes(p)), 'o detector de inglês funciona');
});

test('sortear devolve falas da lista, cobre a lista inteira e não repete a anterior', () => {
  let n = 12345;
  const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
  let ant = -1;
  const vistos = new Set();
  for (let i = 0; i < 2000; i++) {
    const f = sortear(rnd, ant);
    assert.strictEqual(LISTA[f.indice].frase, f.frase);
    assert.notStrictEqual(f.indice, ant);
    vistos.add(f.indice); ant = f.indice;
  }
  assert.strictEqual(vistos.size, LISTA.length);
  assert.strictEqual(sortear(() => 0.9999999).indice, LISTA.length - 1);
});
