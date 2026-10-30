// Testa o monitor contra uma pasta ~/.claude falsa (nunca toca na real).
// Cada teste começa do zero (beforeEach) e cria os próprios dados: dá para rodar qualquer um isolado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'escrithorius-'));
process.env.ESCRITHORIUS_CLAUDE_DIR = RAIZ; // antes do require
const { lerEstado, lerRelatorio, comandoRetomada, definirPasta, resumoDaPasta, reiniciar } = require('../src/monitor');

const SESSAO = '11111111-1111-1111-1111-111111111111';
const CWD = 'C:\\tmp\\meuprojeto';
const PASTA = path.join(RAIZ, 'projects', 'C--tmp-meuprojeto');
const SUB = path.join(PASTA, SESSAO, 'subagents');
const PRINCIPAL = path.join(PASTA, SESSAO + '.jsonl');
const PID_MORTO = 2147480; // improvável de existir

function limpar() {
  for (const d of ['sessions', 'projects', 'agents', 'skills']) fs.rmSync(path.join(RAIZ, d), { recursive: true, force: true });
  fs.mkdirSync(path.join(RAIZ, 'sessions'), { recursive: true });
  fs.mkdirSync(SUB, { recursive: true });
  fs.mkdirSync(path.join(RAIZ, 'agents'), { recursive: true });
  fs.writeFileSync(PRINCIPAL, JSON.stringify({ type: 'user', cwd: CWD }) + '\n');
}
test.beforeEach(() => { limpar(); reiniciar(); });
test.after(() => fs.rmSync(RAIZ, { recursive: true, force: true }));

function catalogoAgente(nome, descricao = 'Testa coisas') {
  fs.writeFileSync(path.join(RAIZ, 'agents', nome + '.md'), `---\nname: ${nome}\ndescription: ${descricao}\n---\n`);
}

function sessaoViva(viva, cwd = CWD) {
  fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'),
    JSON.stringify({ pid: viva ? process.pid : PID_MORTO, sessionId: SESSAO, cwd, status: 'busy' }));
}

function agente(id, { tipo = 'Explore', finished = false, idadeMs = 0, meta = null, dir = SUB } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const j = path.join(dir, `agent-${id}.jsonl`);
  const m = path.join(dir, `agent-${id}.meta.json`);
  fs.writeFileSync(j, '{}\n');
  fs.writeFileSync(m, meta !== null ? meta : JSON.stringify({ agentType: tipo, description: 'tarefa ' + id, ...(finished ? { finished: true } : {}) }));
  const t = new Date(Date.now() - idadeMs);
  fs.utimesSync(j, t, t);
  fs.utimesSync(m, t, t);
}

const estadoDe = (id) => lerEstado().agentes.find((a) => a.id === `${SESSAO}/agent-${id}`)?.estado;
const mesa = (e, nome) => e.mesas.find((m) => m.nome === nome);

test('trabalhando, concluído e sem sinal numa sessão viva', () => {
  sessaoViva(true);
  agente('a', { idadeMs: 5000 });
  agente('b', { finished: true, idadeMs: 5000 });
  agente('c', { idadeMs: 3 * 60 * 1000 });
  assert.strictEqual(estadoDe('a'), 'trabalhando');
  assert.strictEqual(estadoDe('b'), 'concluido');
  assert.strictEqual(estadoDe('c'), 'semSinal');
});

test('sessão sem processo vivo deixa o agente desligado, mesmo concluído', () => {
  sessaoViva(false);
  agente('a', { idadeMs: 5000 });
  agente('b', { finished: true, idadeMs: 5000 });
  assert.strictEqual(estadoDe('a'), 'desligado');
  assert.strictEqual(estadoDe('b'), 'desligado');
  assert.strictEqual(lerEstado().chefes.length, 0);
});

test('meta.json cortado ou inválido é ignorado sem quebrar', () => {
  sessaoViva(true);
  agente('d', { meta: '{"agentType":"Expl' });
  assert.doesNotThrow(() => lerEstado());
  assert.strictEqual(estadoDe('d'), undefined);
});

test('mesa fixa fica parada/desligada conforme a sessão; agente nativo ganha mesa temporária', () => {
  catalogoAgente('qa');
  sessaoViva(true);
  agente('n', { tipo: 'Explore', idadeMs: 1000 });
  const e = lerEstado();
  assert.strictEqual(mesa(e, 'qa').estado, 'parado');
  assert.ok(e.temporarias.some((t) => t.tipo === 'Explore'));
  sessaoViva(false);
  assert.strictEqual(mesa(lerEstado(), 'qa').estado, 'desligado');
});

test('mesa fixa vira trabalhando / sem sinal quando o agente do catálogo roda', () => {
  catalogoAgente('qa');
  sessaoViva(true);
  agente('q1', { tipo: 'qa', idadeMs: 2000 });
  let e = lerEstado();
  assert.strictEqual(mesa(e, 'qa').estado, 'trabalhando');
  assert.strictEqual(mesa(e, 'qa').ultima.id, SESSAO + '/agent-q1');
  assert.ok(!e.temporarias.some((t) => t.tipo === 'qa'), 'agente do catálogo não vira mesa temporária');
  agente('q1', { tipo: 'qa', idadeMs: 3 * 60 * 1000 });
  e = lerEstado();
  assert.strictEqual(mesa(e, 'qa').estado, 'semSinal');
});

test('dois agentes iguais: o que ainda trabalha vale mais que o mais recente já concluído', () => {
  catalogoAgente('qa');
  sessaoViva(true);
  agente('velho', { tipo: 'qa', idadeMs: 20000 }); // começou antes, ainda trabalhando (escreveu há 20 s)
  agente('novo', { tipo: 'qa', finished: true, idadeMs: 1000 });
  // o mais novo precisa ter nascido depois: força a data de criação do .jsonl pela ordem de escrita
  const e = lerEstado();
  assert.strictEqual(mesa(e, 'qa').estado, 'trabalhando');
  assert.strictEqual(mesa(e, 'qa').ultima.id, SESSAO + '/agent-velho');
});

test('agente com nome longo (20+ caracteres) acende a mesa fixa e não cria mesa "[mascarado]"', () => {
  catalogoAgente('code-review-specialist');
  sessaoViva(true);
  agente('l1', { tipo: 'code-review-specialist', idadeMs: 1000 });
  const e = lerEstado();
  assert.strictEqual(mesa(e, 'code-review-specialist').estado, 'trabalhando');
  assert.strictEqual(e.temporarias.length, 0);
  assert.ok(!e.agentes.some((a) => a.tipo.includes('[mascarado]')));
});

test('projeto com nome longo aparece inteiro (chefe e tarefa), mas segredo no nome é mascarado', () => {
  const longo = 'meu-projeto-com-nome-bem-longo-mesmo';
  const pasta = path.join(RAIZ, 'projects', 'C--tmp-' + longo);
  fs.mkdirSync(path.join(pasta, SESSAO, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(pasta, SESSAO + '.jsonl'), JSON.stringify({ type: 'user', cwd: 'C:\\tmp\\' + longo }) + '\n');
  sessaoViva(true, 'C:\\tmp\\' + longo);
  agente('p1', { idadeMs: 1000, dir: path.join(pasta, SESSAO, 'subagents') });
  const e = lerEstado();
  assert.strictEqual(e.chefes[0].projeto, longo);
  assert.strictEqual(e.agentes.find((a) => a.id.endsWith('agent-p1')).projeto, longo);
});

test('histórico de atividade é limitado a 20', () => {
  sessaoViva(true);
  for (let i = 0; i < 30; i++) agente('x' + i, { finished: true, idadeMs: 1000 });
  assert.strictEqual(lerEstado().agentes.length, 20);
});

test('sessão fechada com agentes de mais de 24 h não aparece (e a pasta antiga nem é listada)', () => {
  sessaoViva(false);
  agente('antigo', { idadeMs: 2 * 24 * 60 * 60 * 1000 });
  const velho = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  fs.utimesSync(SUB, velho, velho);
  assert.strictEqual(estadoDe('antigo'), undefined);
  sessaoViva(true); // aberta de novo: a regra de 24 h por arquivo continua valendo
  assert.strictEqual(estadoDe('antigo'), undefined);
});

function linhaSkill(nome, idadeMs = 0) {
  return JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() - idadeMs).toISOString(),
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: nome } }] } });
}
const acesas = () => lerEstado().skills.filter((s) => s.acesa).map((s) => s.nome);

test('skill acende só com linhas novas, mesmo cortadas entre ciclos; api-request é ignorada', () => {
  sessaoViva(true);
  lerEstado(); // primeira leitura: marca o fim do arquivo
  const l = linhaSkill('minha-skill');
  fs.appendFileSync(PRINCIPAL, JSON.stringify({ type: 'api-request', blob: '"name":"Skill"' }) + '\n');
  fs.appendFileSync(PRINCIPAL, l.slice(0, 40)); // linha incompleta
  assert.deepStrictEqual(acesas(), []);
  fs.appendFileSync(PRINCIPAL, l.slice(40) + '\n');
  assert.deepStrictEqual(acesas(), ['minha-skill']);
});

test('arquivo truncado volta a ser lido do começo', () => {
  sessaoViva(true);
  fs.appendFileSync(PRINCIPAL, JSON.stringify({ type: 'user', texto: 'w'.repeat(2000) }) + '\n');
  lerEstado();
  fs.writeFileSync(PRINCIPAL, linhaSkill('outra-skill') + '\n'); // menor que o offset anterior
  assert.ok(acesas().includes('outra-skill'));
});

test('pid inválido ou 0 nunca conta como sessão viva', () => {
  for (const pid of [0, -1, 'abc', null]) {
    fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'), JSON.stringify({ pid, sessionId: SESSAO, cwd: CWD, status: 'busy' }));
    assert.strictEqual(lerEstado().chefes.length, 0, 'pid ' + pid);
  }
});

test('arquivo recriado que já nasce maior que o offset é lido do começo', () => {
  sessaoViva(true);
  fs.appendFileSync(PRINCIPAL, JSON.stringify({ type: 'user', texto: 'z'.repeat(3000) }) + '\n');
  lerEstado(); // marca o fim do arquivo atual (maior que a linha da skill)
  fs.rmSync(PRINCIPAL);
  const enchimento = JSON.stringify({ type: 'user', texto: 'x'.repeat(2000) }) + '\n';
  // A skill vem antes do offset antigo: só um reset do offset consegue lê-la.
  fs.writeFileSync(PRINCIPAL, linhaSkill('recriada') + '\n' + enchimento.repeat(5));
  assert.ok(acesas().includes('recriada'));
});

test('pulo por excesso de bytes não deixa a linha cortada contaminar a leitura', () => {
  sessaoViva(true);
  lerEstado();
  const cortada = linhaSkill('fragmentada');
  const lixo = JSON.stringify({ type: 'user', texto: 'y'.repeat(1000) }) + '\n';
  fs.appendFileSync(PRINCIPAL, lixo.repeat(Math.ceil((4 * 1024 * 1024 + 1) / lixo.length)));
  fs.appendFileSync(PRINCIPAL, cortada.slice(0, 40)); // o pulo cai no meio desta linha
  assert.deepStrictEqual(acesas(), []);
  fs.appendFileSync(PRINCIPAL, cortada.slice(40) + '\n' + linhaSkill('depois-do-pulo') + '\n');
  const a = acesas();
  assert.ok(a.includes('depois-do-pulo'));
  assert.ok(!a.includes('fragmentada'));
});

test('uso antigo expira e não vira skill "nativa" para sempre', () => {
  sessaoViva(true);
  lerEstado();
  fs.appendFileSync(PRINCIPAL, linhaSkill('antiga', 11 * 60 * 1000) + '\n');
  assert.ok(!lerEstado().skills.some((s) => s.nome === 'antiga'));
});

test('plugin:skill casa com a skill do catálogo, sem duplicar', () => {
  sessaoViva(true);
  fs.mkdirSync(path.join(RAIZ, 'skills', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'skills', 'foo', 'SKILL.md'), '---\nname: foo\ndescription: d\n---\n');
  lerEstado();
  fs.appendFileSync(PRINCIPAL, linhaSkill('meuplugin:foo') + '\n');
  const e = lerEstado();
  assert.strictEqual(e.skills.filter((s) => s.nome.endsWith('foo')).length, 1);
  assert.ok(e.skills.find((s) => s.nome === 'foo').acesa);
});

function agenteComLinhas(id, linhas) {
  agente(id, { finished: true, idadeMs: 1000 });
  fs.writeFileSync(path.join(SUB, 'agent-' + id + '.jsonl'), linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
}
const assistente = (...content) => ({ type: 'assistant', message: { content } });
const entrega = (message) => assistente({ type: 'tool_use', name: 'SubagentHandback', input: { message } });
const idDe = (id) => SESSAO + '/agent-' + id;

test('relatório: pega a última entrega (SubagentHandback), mascara segredos e não é parcial', () => {
  sessaoViva(true);
  agenteComLinhas('r1', [entrega('rascunho velho'), { type: 'api-request-blob', x: 'SubagentHandback' },
    entrega('Tudo certo. Token: sk-abcdefghijklmnop1234 fim.')]);
  lerEstado();
  const r = lerRelatorio(idDe('r1'));
  assert.ok(r.texto.startsWith('Tudo certo.'));
  assert.ok(!r.texto.includes('sk-abcdefghijklmnop1234'));
  assert.ok(r.texto.includes('[mascarado]'));
  assert.strictEqual(r.truncado, false);
  assert.strictEqual(r.parcial, false);
});

test('relatório: mascara antes de cortar em 20 mil, sem deixar pedaço de segredo na borda', () => {
  sessaoViva(true);
  const segredo = 'sk-' + 'q'.repeat(40);
  agenteComLinhas('r2', [entrega('a '.repeat(9995) + segredo + ' ' + 'b '.repeat(5000))]);
  lerEstado();
  const r = lerRelatorio(idDe('r2'));
  assert.strictEqual(r.truncado, true);
  assert.strictEqual(r.texto.length, 20000);
  assert.ok(!r.texto.includes('sk-q'));
});

test('relatório: sem entrega usa o último texto do assistente e marca como parcial; sem nada devolve vazio', () => {
  sessaoViva(true);
  agenteComLinhas('r3', [assistente({ type: 'text', text: 'primeiro' }), assistente({ type: 'text', text: 'resposta final' })]);
  agenteComLinhas('r4', [{ type: 'user', message: { content: 'oi' } }]);
  lerEstado();
  const r3 = lerRelatorio(idDe('r3'));
  assert.strictEqual(r3.texto, 'resposta final');
  assert.strictEqual(r3.parcial, true);
  assert.strictEqual(lerRelatorio(idDe('r4')).texto, '');
});

test('relatório: ids inválidos ou desconhecidos devolvem null (nunca aceita caminho)', () => {
  sessaoViva(true);
  agenteComLinhas('r1', [entrega('x')]);
  lerEstado();
  const ruins = ['../../etc/passwd', SESSAO + '/../agent-r1', SESSAO + '/agent-naoexiste', 42, null, undefined, '', {}];
  for (const id of ruins) assert.strictEqual(lerRelatorio(id), null, String(id));
  assert.notStrictEqual(lerRelatorio(idDe('r1')), null); // o válido continua funcionando
});

test('relatório: o mapa interno esquece agentes que saíram da lista', () => {
  sessaoViva(true);
  agenteComLinhas('r5', [entrega('oi')]);
  lerEstado();
  assert.notStrictEqual(lerRelatorio(idDe('r5')), null);
  // O arquivo continua no disco, mas o agente passou das 24 h e saiu da lista: o id não pode ficar valendo.
  const velho = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  for (const f of ['agent-r5.meta.json', 'agent-r5.jsonl']) fs.utimesSync(path.join(SUB, f), velho, velho);
  lerEstado();
  assert.strictEqual(lerRelatorio(idDe('r5')), null);
});

test('nome do projeto sai mascarado também nas leituras seguintes (cache)', () => {
  const sessao2 = '22222222-2222-2222-2222-222222222222';
  const pasta = path.join(PASTA, sessao2, 'subagents');
  const segredo = 'sk-abcdefghijklmnop1234';
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(PASTA, sessao2 + '.jsonl'), JSON.stringify({ type: 'user', cwd: 'C:\\tmp\\' + segredo }) + '\n');
  agente('z', { dir: pasta, idadeMs: 1000 });
  for (let i = 0; i < 2; i++) {
    const t = lerEstado().agentes.find((a) => a.id === `${sessao2}/agent-z`);
    assert.ok(t, 'tarefa encontrada');
    assert.ok(!t.projeto.includes(segredo), `leitura ${i + 1} vazou o nome`);
  }
});

test('catálogo com nome de skill longo não vira [mascarado] no estado', () => {
  sessaoViva(true);
  fs.mkdirSync(path.join(RAIZ, 'skills', 'supabase-postgres-best-practices'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'skills', 'supabase-postgres-best-practices', 'SKILL.md'), '---\nname: supabase-postgres-best-practices\ndescription: d\n---\n');
  assert.ok(lerEstado().skills.some((s) => s.nome === 'supabase-postgres-best-practices'));
});

// ---------- salas por projeto (visual "sala por projeto") ----------
const SESSAO2 = '22222222-2222-2222-2222-222222222222';
const SESSAO3 = '33333333-3333-3333-3333-333333333333';
function sessaoExtra(n, id, cwd, extra = {}) {
  fs.writeFileSync(path.join(RAIZ, 'sessions', n + '.json'),
    JSON.stringify({ pid: process.pid, sessionId: id, cwd, status: 'busy', ...extra }));
  const pasta = path.join(RAIZ, 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(path.join(pasta, id, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(pasta, id + '.jsonl'), JSON.stringify({ type: 'user', cwd }) + '\n');
  return path.join(pasta, id, 'subagents');
}

test('salas: sessão ocupada sem subagente trabalha, com subagente rodando delega, ociosa aguarda', () => {
  sessaoViva(true); // ocupada, sem subagentes
  const dir2 = sessaoExtra(2, SESSAO2, 'C:\\tmp\\outro', { status: 'busy' });
  agente('x', { dir: dir2, idadeMs: 3000 });
  sessaoExtra(3, SESSAO3, 'C:\\tmp\\terceiro', { status: 'idle' });
  const { salas, resumo } = lerEstado();
  const est = (proj) => salas.find((s) => s.projeto === proj).sessoes[0].estado;
  assert.strictEqual(est('meuprojeto'), 'trabalhando');
  assert.strictEqual(est('outro'), 'delegando');
  assert.strictEqual(est('terceiro'), 'aguardando');
  assert.deepStrictEqual([resumo.delegando, resumo.aguardando, resumo.projetos, resumo.sessoes], [1, 1, 3, 3]);
  assert.strictEqual(resumo.trabalhando, 2); // a sessão que trabalha + o subagente que roda
});

test('salas: duas sessões do mesmo projeto dividem a sala; salas saem em ordem alfabética', () => {
  sessaoViva(true);
  sessaoExtra(2, SESSAO2, 'C:\\outra\\meuprojeto');
  sessaoExtra(3, SESSAO3, 'C:\\tmp\\alfa');
  const { salas } = lerEstado();
  assert.deepStrictEqual(salas.map((s) => s.projeto), ['alfa', 'meuprojeto']);
  assert.strictEqual(salas[1].sessoes.length, 2);
});

test('salas: concluída fica 2 min na sala (e conta no resumo); depois some da sala mas continua contada', () => {
  sessaoViva(true);
  agente('novo', { finished: true, idadeMs: 20 * 1000 });
  agente('velho', { finished: true, idadeMs: 5 * 60 * 1000 });
  agente('rodando', { idadeMs: 2000 });
  const { salas, resumo } = lerEstado();
  const ids = salas[0].execucoes.map((e) => e.id.split('/')[1]).sort();
  assert.deepStrictEqual(ids, ['agent-novo', 'agent-rodando']);
  assert.strictEqual(resumo.concluidas, 2);
});

test('salas: sessão fechada não tem sala, e as execuções dela não entram', () => {
  sessaoViva(false);
  agente('a', { idadeMs: 2000 });
  const { salas, resumo } = lerEstado();
  assert.strictEqual(salas.length, 0);
  assert.deepStrictEqual([resumo.projetos, resumo.trabalhando, resumo.concluidas], [0, 0, 0]);
});

test('salas: datas inválidas da sessão viram null e o caminho completo nunca aparece', () => {
  sessaoViva(true);
  fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'),
    JSON.stringify({ pid: process.pid, sessionId: SESSAO, cwd: CWD, status: 'busy', startedAt: 'ontem', statusUpdatedAt: -5 }));
  const e = lerEstado();
  assert.strictEqual(e.salas[0].sessoes[0].inicio, null);
  assert.strictEqual(e.salas[0].sessoes[0].desde, null);
  assert.ok(!JSON.stringify(e.salas).includes('C:'), 'só o nome da pasta, nunca o caminho');
});

test('salas: datas válidas da sessão passam', () => {
  sessaoViva(true);
  const t = Date.now() - 60000;
  fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'),
    JSON.stringify({ pid: process.pid, sessionId: SESSAO, cwd: CWD, status: 'idle', startedAt: t, statusUpdatedAt: t + 1000 }));
  const s = lerEstado().salas[0].sessoes[0];
  assert.deepStrictEqual([s.inicio, s.desde, s.estado], [t, t + 1000, 'aguardando']);
});

test('arquivo de sessão ilegível por um ciclo (sendo reescrito) não derruba a sala', () => {
  sessaoViva(true);
  assert.strictEqual(lerEstado().salas.length, 1);
  fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'), '{"pid":'); // reescrita pela metade
  assert.strictEqual(lerEstado().salas.length, 1);
  fs.rmSync(path.join(RAIZ, 'sessions', '1.json')); // apagado de verdade: a sala some
  assert.strictEqual(lerEstado().salas.length, 0);
});

test('arquivo .meta.json gigante é ignorado e descrição longa é cortada depois de mascarar', () => {
  sessaoViva(true);
  agente('grande', { tipo: 'qa', meta: JSON.stringify({ agentType: 'qa', description: 'x '.repeat(200000) }) });
  assert.strictEqual(estadoDe('grande'), undefined, 'meta enorme ignorado');
  agente('longa', { tipo: 'qa', meta: JSON.stringify({ agentType: 'qa', description: 'palavra '.repeat(200) }) });
  const t = lerEstado().agentes.find((x) => x.id === SESSAO + '/agent-longa');
  assert.ok(t && t.descricao.length <= 300, 'descrição cortada');
});

// ---------- ferramenta em uso / possivelmente esperando você ----------
const ISO = (msAtras) => new Date(Date.now() - msAtras).toISOString();
const usoFerramenta = (id, nome, msAtras, input = { comando: 'x' }) => JSON.stringify({ type: 'assistant', timestamp: ISO(msAtras), message: { content: [{ type: 'tool_use', id, name: nome, input }] } });
const resultadoFerramenta = (id, msAtras = 0) => JSON.stringify({ type: 'user', timestamp: ISO(msAtras), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'saida' }] } });
let contadorMtime = 0;
const escreverSessao = (linhas) => { // data de modificação sempre diferente: o cache da ferramenta olha tamanho e data
  fs.writeFileSync(PRINCIPAL, [JSON.stringify({ type: 'user', cwd: CWD }), ...linhas].join('\n') + '\n');
  const t = new Date(Date.now() + 1000 * ++contadorMtime);
  fs.utimesSync(PRINCIPAL, t, t);
};
const sessaoDaSala = () => lerEstado().salas[0].sessoes[0];

test('ferramenta pendente: mostra só o nome e há quanto tempo; com resposta, deixa de ser pendente', () => {
  sessaoViva(true);
  escreverSessao([usoFerramenta('t1', 'Bash', 3000)]);
  let s = sessaoDaSala();
  assert.strictEqual(s.ferramenta.nome, 'Bash');
  assert.strictEqual(s.ferramenta.pendente, true);
  assert.ok(Math.abs(Date.now() - s.ferramenta.desde - 3000) < 2000);
  assert.strictEqual(s.esperando, false, 'só 3 s: ainda não é espera');
  escreverSessao([usoFerramenta('t1', 'Bash', 3000), resultadoFerramenta('t1', 1000)]);
  s = sessaoDaSala();
  assert.strictEqual(s.ferramenta.pendente, false);
  assert.strictEqual(s.esperando, false);
});

test('possivelmente esperando você: ferramenta pendente há mais de 8 s numa sessão ocupada; Agent/Task não contam', () => {
  sessaoViva(true);
  escreverSessao([usoFerramenta('t1', 'Edit', 20000)]);
  assert.strictEqual(sessaoDaSala().esperando, true);
  escreverSessao([usoFerramenta('t1', 'Agent', 20000)]);
  assert.strictEqual(sessaoDaSala().esperando, false, 'delegar a subagente demora de propósito');
  escreverSessao([usoFerramenta('t1', 'Task', 20000)]);
  assert.strictEqual(sessaoDaSala().esperando, false);
  escreverSessao([usoFerramenta('t1', 'Edit', 7000)]);
  assert.strictEqual(sessaoDaSala().esperando, false, 'abaixo do limite');
  escreverSessao([usoFerramenta('t1', 'Edit', 20000), resultadoFerramenta('t1', 100)]);
  assert.strictEqual(sessaoDaSala().esperando, false, 'já respondida');
});

test('sessão ociosa (aguardando) nunca é "esperando você", mesmo com ferramenta antiga sem resposta', () => {
  fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'), JSON.stringify({ pid: process.pid, sessionId: SESSAO, cwd: CWD, status: 'idle' }));
  escreverSessao([usoFerramenta('t1', 'Bash', 60000)]);
  assert.strictEqual(sessaoDaSala().esperando, false);
});

test('várias ferramentas em paralelo: vale a que ainda não respondeu', () => {
  sessaoViva(true);
  const duas = JSON.stringify({ type: 'assistant', timestamp: ISO(30000), message: { content: [
    { type: 'tool_use', id: 'a', name: 'Read', input: {} }, { type: 'tool_use', id: 'b', name: 'Bash', input: {} }] } });
  escreverSessao([duas, resultadoFerramenta('b', 20000)]);
  const s = sessaoDaSala();
  assert.deepStrictEqual([s.ferramenta.nome, s.ferramenta.pendente], ['Read', true]);
});

test('privacidade: o estado nunca leva o input, o conteúdo nem segredos da ferramenta', () => {
  sessaoViva(true);
  escreverSessao([usoFerramenta('t1', 'Bash', 20000, { command: 'curl -H "Authorization: Bearer sk-ABCDEF1234567890" https://segredo.exemplo' }), resultadoFerramenta('t2')]);
  const json = JSON.stringify(lerEstado());
  assert.ok(!json.includes('sk-ABCDEF') && !json.includes('segredo.exemplo') && !json.includes('Authorization'), 'input vazou');
  assert.ok(json.includes('"nome":"Bash"'));
});

test('nome de ferramenta estranho é cortado e mascarado; linha cortada e lixo não quebram', () => {
  sessaoViva(true);
  escreverSessao(['{"type":"assistant","message":{"content":[{"type":"tool_use","id":"x","name":"Bash"', 'lixo', usoFerramenta('t1', 'sk-abcdefghijklmnopqrstuvwxyz123456', 20000)]);
  const s = sessaoDaSala();
  assert.ok(!JSON.stringify(s).includes('sk-abcdefghijklmnopqrstuvwxyz'), 'token no nome');
  assert.ok(s.ferramenta.nome.length <= 40);
});

test('arquivo grande: só o fim é lido; resposta fora da janela não derruba nada', () => {
  sessaoViva(true);
  const enchimento = 'x'.repeat(200 * 1024);
  escreverSessao([usoFerramenta('antigo', 'Read', 600000), JSON.stringify({ type: 'attachment', lixo: enchimento }), usoFerramenta('t1', 'Grep', 15000)]);
  const s = sessaoDaSala();
  assert.deepStrictEqual([s.ferramenta.nome, s.ferramenta.pendente, s.esperando], ['Grep', true, true]);
});

test('subagente trabalhando também mostra a ferramenta e pode estar "esperando você"', () => {
  sessaoViva(true);
  agente('f1', { tipo: 'qa' });
  fs.writeFileSync(path.join(SUB, 'agent-f1.jsonl'), usoFerramenta('s1', 'Write', 25000) + '\n');
  const e = lerEstado();
  const ex = e.salas[0].execucoes.find((x) => x.id === SESSAO + '/agent-f1');
  assert.deepStrictEqual([ex.ferr.nome, ex.esperando], ['Write', true]);
  fs.writeFileSync(path.join(SUB, 'agent-f1.jsonl'), usoFerramenta('s1', 'Write', 25000) + '\n' + resultadoFerramenta('s1') + '\n');
  assert.strictEqual(lerEstado().salas[0].execucoes.find((x) => x.id === SESSAO + '/agent-f1').esperando, false);
});

// ---------- PID reaproveitado: sessão "ocupada" parada há 20 min ----------
const idadeArquivo = (ms) => { const t = new Date(Date.now() - ms); fs.utimesSync(PRINCIPAL, t, t); };
const sessaoComStatus = (extra) => fs.writeFileSync(path.join(RAIZ, 'sessions', '1.json'), JSON.stringify({ pid: process.pid, sessionId: SESSAO, cwd: CWD, status: 'busy', ...extra }));

test('sessão "busy" cujo arquivo e status estão parados há mais de 20 min vira aguardando (PID reaproveitado)', () => {
  sessaoComStatus({ statusUpdatedAt: Date.now() - 25 * 60000 });
  escreverSessao([usoFerramenta('t1', 'Bash', 25 * 60000)]);
  idadeArquivo(25 * 60000);
  const s = sessaoDaSala();
  assert.strictEqual(s.estado, 'aguardando');
  assert.strictEqual(s.esperando, false);
  assert.strictEqual(lerEstado().resumo.aguardando, 1);
});

test('sessão "busy" continua trabalhando se o arquivo OU o status mexeram há menos de 20 min', () => {
  sessaoComStatus({ statusUpdatedAt: Date.now() - 25 * 60000 });
  escreverSessao([usoFerramenta('t1', 'Bash', 1000)]);
  idadeArquivo(60000);
  assert.strictEqual(sessaoDaSala().estado, 'trabalhando', 'arquivo recente');
  sessaoComStatus({ statusUpdatedAt: Date.now() - 60000 });
  idadeArquivo(25 * 60000);
  assert.strictEqual(sessaoDaSala().estado, 'trabalhando', 'status recente (comando longo sem escrever no arquivo)');
  sessaoComStatus({}); // sem data de status: só o arquivo decide
  idadeArquivo(25 * 60000);
  assert.strictEqual(sessaoDaSala().estado, 'aguardando');
});

test('sessão pai calada há muito tempo continua ocupada enquanto um subagente dela trabalha', () => {
  sessaoComStatus({ statusUpdatedAt: Date.now() - 25 * 60000 });
  escreverSessao([usoFerramenta('t1', 'Agent', 25 * 60000)]);
  idadeArquivo(25 * 60000);
  agente('sub1', { tipo: 'qa' }); // mtime de agora: está trabalhando
  const s = sessaoDaSala();
  assert.strictEqual(s.estado, 'delegando');
  assert.strictEqual(s.esperando, false);
});

// ---------- formato desconhecido ----------
const escreverSemConversa = (linhas) => { // sem a primeira linha de conversa que escreverSessao acrescenta
  fs.writeFileSync(PRINCIPAL, linhas.join(String.fromCharCode(10)) + String.fromCharCode(10));
  const t = new Date(Date.now() + 1000 * ++contadorMtime); fs.utimesSync(PRINCIPAL, t, t);
};
test('formato desconhecido: muitas linhas e nenhuma no formato esperado aciona o alerta; formato normal ou pouca atividade não', () => {
  sessaoViva(true);
  const estranha = Array.from({ length: 40 }, (_, k) => JSON.stringify({ tipo: 'evento', numero: k }));
  escreverSemConversa(estranha);
  assert.strictEqual(lerEstado().alertas.formato, 1);
  escreverSessao(estranha.concat([usoFerramenta('t1', 'Bash', 1000)]));
  assert.strictEqual(lerEstado().alertas.formato, 0, 'com linhas de conversa no formato esperado');
  escreverSemConversa(estranha.slice(0, 10));
  assert.strictEqual(lerEstado().alertas.formato, 0, 'poucas linhas: ainda não dá para dizer');
});

test('formato desconhecido: JSON com espaçamento diferente também é detectado (o app procura o formato exato)', () => {
  sessaoViva(true);
  const espacado = Array.from({ length: 40 }, () => '{"type": "assistant", "message": {"content": []}}');
  escreverSemConversa(espacado);
  assert.strictEqual(lerEstado().alertas.formato, 1);
});

test('comando de retomada: só para tarefas que o monitor conhece, só com o id da sessão', () => {
  sessaoViva(true);
  agente('r1', { tipo: 'qa' });
  lerEstado();
  assert.strictEqual(comandoRetomada(SESSAO + '/agent-r1'), 'claude --resume ' + SESSAO);
  assert.strictEqual(comandoRetomada(SESSAO + '/agent-desconhecido'), null, 'id válido mas não descoberto');
  for (const ruim of [SESSAO.replace(/[0-9a-f]/g, '-') + '/agent-r1', '-'.repeat(36) + '/agent-r1', SESSAO.replace(/-/g, '') + '0000/agent-r1', '', 'claude --resume x', '../../etc/passwd', SESSAO + '/agent-r1; calc', SESSAO + '/agent-r1\nrm', null, undefined, 42, {}, SESSAO]) {
    assert.strictEqual(comandoRetomada(ruim), null, String(ruim));
  }
});

test('resumo da pasta: conta agentes, skills e sessões abertas; pasta ausente é avisada no estado', () => {
  catalogoAgente('qa'); catalogoAgente('banco');
  fs.mkdirSync(path.join(RAIZ, 'skills', 'minha'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'skills', 'minha', 'SKILL.md'), '---\nname: minha\ndescription: x\n---\n');
  sessaoViva(true);
  const r = resumoDaPasta();
  assert.deepStrictEqual([r.existe, r.agentes, r.skills, r.sessoes, r.forcada], [true, 2, 1, 1, true]);
  assert.strictEqual(lerEstado().alertas.pastaAusente, false);
});

test('pasta escolhida em Configurações: a variável de teste vence; sem ela, troca e volta ao padrão', () => {
  definirPasta(path.join(RAIZ, 'nao-existe'));
  assert.strictEqual(resumoDaPasta().pasta, RAIZ, 'ESCRITHORIUS_CLAUDE_DIR vence');
  definirPasta(null);
  assert.strictEqual(resumoDaPasta().pasta, RAIZ);
});

test('sem a variável de teste: Configurações troca a pasta; CLAUDE_CONFIG_DIR vira a pasta padrão', () => {
  const { spawnSync } = require('node:child_process');
  const outra = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-outra-')), cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'escr-cfgdir-'));
  const codigo = `const m = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'monitor.js'))});
    const a = m.resumoDaPasta(); m.definirPasta(${JSON.stringify(outra)}); const b = m.resumoDaPasta(); m.definirPasta(null); const c = m.resumoDaPasta();
    console.log(JSON.stringify([a.pasta, a.padrao, b.pasta, b.padrao, c.pasta, c.padrao, a.forcada]));`;
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg }; delete env.ESCRITHORIUS_CLAUDE_DIR;
  const r = spawnSync(process.execPath, ['-e', codigo], { env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), [cfg, true, outra, false, cfg, true, false]);
  const env2 = { ...process.env }; delete env2.ESCRITHORIUS_CLAUDE_DIR; delete env2.CLAUDE_CONFIG_DIR;
  const r2 = spawnSync(process.execPath, ['-e', codigo], { env: env2, encoding: 'utf8' });
  assert.strictEqual(JSON.parse(r2.stdout)[0], path.join(os.homedir(), '.claude'));
});
