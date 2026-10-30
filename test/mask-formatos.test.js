const test = require('node:test');
const assert = require('node:assert');
const { mask, maskNome } = require('../src/mask');

// Cada caso: texto -> pedaço secreto que NÃO pode sobrar na saída.
const SEGREDOS = [
  ['{"password":"hunter2"}', 'hunter2'],
  ['{"password": "a b c"}', 'a b c'],
  ['DB_PASSWORD=x1', 'x1'],
  ['export API_TOKEN="abc 123"', 'abc 123'],
  ['access_token: zz9', 'zz9'],
  ['client_secret=s3cr3t', 's3cr3t'],
  ['x_api_key=k1', 'k1'],
  ['password: my secret phrase', 'my secret phrase'],
  ['--password hunter2', 'hunter2'],
  ['Authorization: Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
  ['Authorization: Bearer abcdef123456', 'abcdef123456'],
  ['postgres://admin:pw1@db.local/app', 'pw1'],
  ['https://user:senha@host.com/x', 'senha'],
  ['postgres://admin:pw1@localhost:5432/app', 'pw1'], // host sem ponto: a regra de e-mail não ajuda, só a de URL
  ['-----BEGIN RSA PRIVATE KEY-----\nMIIabc\nxyz12\n-----END RSA PRIVATE KEY-----', 'xyz12'],
  ['-----BEGIN PRIVATE KEY-----\ncortado sem fim', 'cortado'],
  ['token sk-ant-api03-abcdefghijklmnop', 'abcdefghijklmnop'],
  ['contato: fulano.silva@empresa.com.br', 'fulano.silva'],
  ['CPF 123.456.789-09', '123.456.789-09'],
  ['CPF 12345678909', '12345678909'],
  ['CNPJ 12.345.678/0001-90', '12.345.678/0001-90'],
];

for (const [texto, segredo] of SEGREDOS) {
  test('mascara: ' + texto.slice(0, 40).replace(/\n/g, ' '), () => {
    const saida = mask(texto);
    assert.ok(!saida.includes(segredo), 'sobrou "' + segredo + '" em: ' + saida);
    assert.ok(saida.includes('[mascarado]'));
  });
}

test('o nome da chave continua visível (só o valor some)', () => {
  assert.strictEqual(mask('DB_PASSWORD=x1'), 'DB_PASSWORD=[mascarado]');
  assert.strictEqual(mask('{"password":"hunter2"}'), '{"password":[mascarado]}');
});

test('texto comum continua legível', () => {
  const comuns = [
    'Liste os arquivos do projeto e responda em uma frase.',
    'mkdir -p src/test && npm test',
    'Erro em src/monitor.js:44, função nomeProjeto',
    'versão 1.2.3 em 2026-10-25 às 03:57',
    'a pasta C:\\Users\\usuario\\Projects\\app',
  ];
  for (const c of comuns) assert.strictEqual(mask(c), c, c);
});

test('maskNome mantém nomes longos e ainda mascara segredos conhecidos', () => {
  assert.strictEqual(maskNome('code-review-specialist'), 'code-review-specialist');
  assert.strictEqual(maskNome('meu-projeto-com-nome-bem-longo'), 'meu-projeto-com-nome-bem-longo');
  assert.ok(maskNome('sk-abcdefghijklmnop1234').includes('[mascarado]'));
  assert.ok(maskNome('dono@empresa.com').includes('[mascarado]'));
});

test('texto grande é mascarado rápido (sem backtracking explosivo)', () => {
  // Unidades repetidas até 120 mil caracteres: cada padrão precisa ser linear nelas.
  const unidades = ['a', 'a.', 'a-', 'a/', ':a', 'a@', '1', '1.', 'a1.-_/+=%', '"a', 'a=', 'a:', 'a ', 'token_', 'password ', 'x@', 'http://'];
  for (const u of unidades) {
    const c = u.repeat(Math.ceil(120000 / u.length));
    const t0 = Date.now();
    mask(c);
    maskNome(c);
    assert.ok(Date.now() - t0 < 1000, 'lento com "' + u + '": ' + (Date.now() - t0) + ' ms');
  }
});
