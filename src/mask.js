// Máscara de segredos e dados pessoais: roda antes de qualquer texto entrar no estado. Prefere mascarar demais.
const PALAVRAS = '(?:password|passwd|pwd|senha|secret|token|api[_-]?key|private[_-]?key|authorization|cookie|credential|session[_-]?id)';
const M = '[mascarado]';

// A ordem importa: formatos mais específicos primeiro, a regra genérica de "sequência longa" por último.
// `rep` ausente = troca tudo por [mascarado]; com `rep`, mantém o nome da chave e mascara só o valor.
const PADROES = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g }, // chave privada PEM
  { re: /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^\s\/:@]+:[^\s\/@]+@/gi, rep: '$1' + M + '@' }, // usuario:senha@host em URL
  { re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{6,}/gi },
  // chave: valor (JSON, YAML, "Token: x"): aceita prefixo/sufixo (DB_PASSWORD, access_token), aspas e valor com espaços
  { re: new RegExp('(' + PALAVRAS + '[A-Za-z0-9_-]{0,40}["\']?\\s*:\\s*)("[^"\\n]*"|\'[^\'\\n]*\'|[^\\n]*)', 'gi'), rep: '$1' + M },
  // chave=valor (.env, linha de comando); o sufixo é limitado a 40 para não ficar quadrático em texto repetitivo
  { re: new RegExp('(' + PALAVRAS + '[A-Za-z0-9_-]{0,40}["\']?\\s*=\\s*)("[^"\\n]*"|\'[^\'\\n]*\'|[^\\s"\',;]+)', 'gi'), rep: '$1' + M },
  { re: /(--(?:password|passwd|token|secret|api-key)\s+)(\S+)/gi, rep: '$1' + M }, // --password valor
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g }, // JWT
  { re: /\b(?:sk|pk|ghp|gho|ghs|xox[abp]|AKIA)[-_A-Za-z0-9]{12,}/g },
  // e-mail; o lookbehind faz só o início de cada sequência tentar casar (sem ele, texto longo vira O(n²))
  { re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g }, // CNPJ
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g }, // CPF
  { re: /[A-Za-z0-9+\/_=-]{20,}/g, longa: true }, // qualquer sequência longa sem espaço (inclui hex/base64)
];

function aplicar(texto, padroes) {
  let saida = texto;
  for (const p of padroes) saida = saida.replace(p.re, p.rep || M);
  return saida;
}

function mask(texto) {
  if (typeof texto !== 'string') return '';
  return aplicar(texto, PADROES);
}

// Nomes de agentes, skills e pastas de projeto (vêm da config e das pastas do próprio usuário): nomes longos
// com hífen são normais, então só os padrões de segredo conhecidos valem, sem a regra de "sequência longa".
const PADROES_NOME = PADROES.filter((p) => !p.longa);
function maskNome(texto) {
  if (typeof texto !== 'string') return '';
  return aplicar(texto, PADROES_NOME);
}

module.exports = { mask, maskNome };
