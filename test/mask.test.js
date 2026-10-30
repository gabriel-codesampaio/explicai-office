const test = require('node:test');
const assert = require('node:assert');
const { mask } = require('../src/mask');

test('mascara segredos conhecidos', () => {
  const casos = [
    'sk-abcdefghijklmnop1234',
    'ghp_abcdefghijklmnop1234',
    'Authorization: Bearer abcdef123456',
    'password=hunter2',
    'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abc123',
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  ];
  for (const c of casos) assert.match(mask(c), /\[mascarado\]/, c);
});

test('mantém texto normal legível', () => {
  assert.strictEqual(mask('Liste os arquivos do projeto'), 'Liste os arquivos do projeto');
  assert.strictEqual(mask('escrithorius'), 'escrithorius');
});

test('entrada que não é texto vira vazio', () => {
  assert.strictEqual(mask(undefined), '');
});

test('maskNome mantém nome longo de skill, mas mascara segredo conhecido', () => {
  const { maskNome } = require('../src/mask');
  assert.strictEqual(maskNome('supabase-postgres-best-practices'), 'supabase-postgres-best-practices');
  assert.match(maskNome('sk-abcdefghijklmnop1234'), /\[mascarado\]/);
});

test('mascara também cookie, pwd, credential e session_id (só o valor)', () => {
  for (const linha of ['Cookie: sessao=abc123', 'Set-Cookie: sid=xyz', 'pwd=abc', 'credential: usuario1', 'session_id: ab12cd', 'SESSION-ID=9x8y']) {
    const r = mask(linha);
    assert.ok(r.includes('[mascarado]'), linha + ' -> ' + r);
    assert.ok(!/abc123|sid=xyz|=abc$|usuario1|ab12cd|9x8y/.test(r), linha + ' -> ' + r);
  }
});
