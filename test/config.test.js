const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../src/config');

const novaPasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'escr-cfg-'));

test('sem arquivo, usa o padrão (avisos ligados, sem som, falas ligadas, pasta padrão)', () => {
  assert.deepStrictEqual(C.carregar(novaPasta()), { avisos: true, som: false, falas: true, pasta: null });
});

test('salvar e carregar devolvem as mesmas preferências, inclusive a pasta escolhida', () => {
  const dir = novaPasta(), escolhida = novaPasta();
  assert.strictEqual(C.salvar(dir, { avisos: false, som: true, falas: false, pasta: escolhida }), true);
  assert.deepStrictEqual(C.carregar(dir), { avisos: false, som: true, falas: false, pasta: path.resolve(escolhida) });
  assert.ok(!fs.existsSync(path.join(dir, 'config.json.tmp')), 'não deixa arquivo temporário');
});

test('arquivo corrompido, grande demais ou com tipos errados cai no padrão, campo a campo', () => {
  const dir = novaPasta();
  fs.writeFileSync(path.join(dir, 'config.json'), '{"avisos": ');
  assert.deepStrictEqual(C.carregar(dir), C.PADRAO);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ avisos: 'sim', som: 1, falas: false, pasta: 42, extra: 'x' }));
  assert.deepStrictEqual(C.carregar(dir), { avisos: true, som: false, falas: false, pasta: null });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ avisos: false, lixo: 'x'.repeat(C.MAX_BYTES) }));
  assert.deepStrictEqual(C.carregar(dir), C.PADRAO, 'grande demais é ignorado');
  fs.writeFileSync(path.join(dir, 'config.json'), '[1,2,3]');
  assert.deepStrictEqual(C.carregar(dir), C.PADRAO);
});

test('pasta escolhida que some (pendrive, rede) continua guardada; caminho de rede (UNC) nunca é aceito', () => {
  const dir = novaPasta(), cfg = novaPasta(), sumida = path.join(novaPasta(), 'pendrive');
  assert.strictEqual(C.pastaPlausivel(sumida), path.resolve(sumida), 'formato ok mesmo sem existir');
  assert.strictEqual(C.validarPasta(sumida), null, 'mas escolher exige que exista');
  C.salvar(cfg, { avisos: false, pasta: sumida });
  assert.strictEqual(C.carregar(cfg).pasta, path.resolve(sumida), 'não perde a escolha');
  assert.strictEqual(C.aplicar(C.carregar(cfg), { som: true }).pasta, path.resolve(sumida), 'mudar uma preferência não apaga a pasta');
  for (const unc of [String.raw`\\servidor\pasta`, '//servidor/pasta', String.raw`\\?\C:\x`]) { assert.strictEqual(C.pastaPlausivel(unc), null, unc); assert.strictEqual(C.validarPasta(unc), null, unc); }
  assert.ok(dir);
});

test('pasta: só caminho absoluto, existente e que seja pasta; nada de relativo, arquivo, nulo ou enorme', () => {
  const dir = novaPasta();
  const arquivo = path.join(dir, 'a.txt'); fs.writeFileSync(arquivo, 'x');
  assert.strictEqual(C.validarPasta(dir), path.resolve(dir));
  for (const ruim of [arquivo, path.join(dir, 'nao-existe'), 'relativa/pasta', '..', '', null, undefined, 42, {}, dir + '\0x', path.join(dir, 'a'.repeat(600))]) {
    assert.strictEqual(C.validarPasta(ruim), null, String(ruim).slice(0, 40));
  }
});

test('aplicar: só as 3 chaves booleanas conhecidas mudam; a pasta nunca vem da tela', () => {
  const dir = novaPasta();
  const base = C.normalizar({ avisos: true, som: false, falas: true, pasta: dir });
  const r = C.aplicar(base, { avisos: false, som: 'true', falas: null, pasta: '/etc', outra: true, __proto__: { avisos: true } });
  assert.deepStrictEqual(r, { avisos: false, som: false, falas: true, pasta: path.resolve(dir) });
  assert.deepStrictEqual(C.aplicar(base, null), base);
  assert.deepStrictEqual(C.aplicar(base, [true]), base);
  assert.deepStrictEqual(C.aplicar(base, 'texto'), base);
});

test('abreviar troca a pasta do usuário por ~ e não confunde pastas parecidas', () => {
  assert.strictEqual(C.abreviar('C:\\Users\\ana\\.claude', 'C:\\Users\\ana'), '~\\.claude');
  assert.strictEqual(C.abreviar('c:\\users\\ana\\.claude', 'C:\\Users\\ana'), '~\\.claude');
  assert.strictEqual(C.abreviar('/home/ana/.claude', '/home/ana'), '~/.claude');
  assert.strictEqual(C.abreviar('C:\\Users\\anabela\\.claude', 'C:\\Users\\ana'), 'C:\\Users\\anabela\\.claude');
  assert.strictEqual(C.abreviar('D:\\outra', 'C:\\Users\\ana'), 'D:\\outra');
  assert.strictEqual(C.abreviar(undefined, 'x'), '');
});

test('salvar numa pasta impossível devolve false sem lançar erro', () => {
  const dir = novaPasta();
  const arquivo = path.join(dir, 'arquivo'); fs.writeFileSync(arquivo, 'x');
  assert.strictEqual(C.salvar(path.join(arquivo, 'dentro'), C.PADRAO), false);
});
