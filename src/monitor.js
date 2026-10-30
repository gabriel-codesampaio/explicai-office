// Observa ~/.claude (SOMENTE LEITURA) e devolve o estado já mascarado.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mask, maskNome } = require('./mask');
const { lerCatalogo } = require('./catalog');

// Pasta do Claude Code: variável de teste > pasta escolhida em Configurações > CLAUDE_CONFIG_DIR (a mesma do Claude Code) > ~/.claude.
const PASTA_PADRAO = process.env.CLAUDE_CONFIG_DIR && path.isAbsolute(process.env.CLAUDE_CONFIG_DIR) && !/^[\\/]{2}/.test(process.env.CLAUDE_CONFIG_DIR) ? process.env.CLAUDE_CONFIG_DIR : path.join(os.homedir(), '.claude');
const PASTA_FORCADA = process.env.ESCRITHORIUS_CLAUDE_DIR || null; // só para testes: vale sempre
let CLAUDE = PASTA_FORCADA || PASTA_PADRAO;
const SEM_SINAL_MS = 2 * 60 * 1000;
const VISIVEL_MS = 24 * 60 * 60 * 1000;
const MAX_ATIVIDADE = 20;
const ENCERRADA_MS = 2 * 60 * 1000; // quanto tempo uma execução concluída continua na sala (no café) com "encerrou há Xs"
const MAX_RELATORIO = 20000; // caracteres mostrados
const UUID_AGENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/agent-[A-Za-z0-9_-]+$/; // id de tarefa: <uuid da sessão>/agent-<id>
const LEITURA_RELATORIO = 2 * 1024 * 1024; // só o fim do arquivo do agente
const arquivosAgentes = new Map(); // id da tarefa -> caminho do .jsonl (nunca vai para a tela)

const MAX_JSON = 256 * 1024; // sessions/*.json e *.meta.json são pequenos; maior que isso é ignorado (nunca trava o app)
function pastaExiste() { try { return fs.statSync(CLAUDE).isDirectory(); } catch { return false; } }

function lerJson(arquivo) {
  try {
    if (fs.statSync(arquivo).size > MAX_JSON) return null;
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch { return null; }
}

function vivo(pid) {
  // pid 0 ou inválido testaria o grupo de processos (kill(0, 0) devolve true): rejeitar antes.
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const ultimasBoas = new Map(); // arquivo de sessão -> última leitura boa (o arquivo pode estar sendo reescrito)

function sessoesVivas() {
  const dir = path.join(CLAUDE, 'sessions');
  let nomes = [];
  try { nomes = fs.readdirSync(dir); } catch { return new Map(); }
  const vivas = new Map();
  for (const k of Array.from(ultimasBoas.keys())) if (!nomes.includes(k)) ultimasBoas.delete(k);
  for (const n of nomes) {
    if (!/^\d+\.json$/.test(n)) continue; // nunca abrir os .key
    let s = lerJson(path.join(dir, n));
    if (s) ultimasBoas.set(n, s);
    else if (ultimasBoas.has(n)) s = ultimasBoas.get(n); // leitura falhou uma vez: usa a última boa em vez de sumir com a sala
    if (s && s.sessionId && vivo(Number(s.pid))) {
      const data = (x) => (Number.isFinite(x) && x > 0 ? x : null);
      vivas.set(String(s.sessionId), { cwd: String(s.cwd || ''), ocupada: s.status === 'busy', inicio: data(s.startedAt), desde: data(s.statusUpdatedAt) });
    }
  }
  return vivas;
}

// Nome do projeto (só a última pasta do cwd). O cwd vem do começo do .jsonl da sessão; fica em cache.
// Nome de pasta usa maskNome: pastas com nome longo e hífens são normais e não podem virar "[mascarado]".
// Se o nome não foi encontrado ("?"), tenta de novo só depois de 30 s, em vez de reler 32 KB por segundo.
const nomesProjeto = new Map(); // chave -> { nome, em }
function nomeProjeto(pastaProjeto, sessionId) {
  const chave = pastaProjeto + '/' + sessionId;
  const guardado = nomesProjeto.get(chave);
  if (guardado && (guardado.nome !== '?' || Date.now() - guardado.em < 30000)) return guardado.nome;
  let nome = '?';
  try {
    const fd = fs.openSync(path.join(pastaProjeto, sessionId + '.jsonl'), 'r');
    const buf = Buffer.alloc(32768);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const m = buf.toString('utf8', 0, n).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
    if (m) nome = path.basename(JSON.parse('"' + m[1] + '"'));
  } catch { /* sem nome: fica "?" */ }
  nome = maskNome(nome);
  nomesProjeto.set(chave, { nome, em: Date.now() }); // o cache só guarda o valor já mascarado
  return nome;
}

function agentesDaSessao(pastaProjeto, sessionId, estaViva, agora) {
  const dir = path.join(pastaProjeto, sessionId, 'subagents');
  // Sessão antiga e fechada: nem lista a pasta (com meses de histórico, isso roda a cada segundo).
  let st;
  try { st = fs.statSync(dir); } catch { return []; }
  if (!estaViva && agora - st.mtimeMs > VISIVEL_MS) return [];
  let nomes = [];
  try { nomes = fs.readdirSync(dir); } catch { return []; }
  const projeto = nomeProjeto(pastaProjeto, sessionId);
  const agentes = [];
  for (const n of nomes) {
    const m = n.match(/^(agent-.+)\.meta\.json$/);
    if (!m) continue;
    // Datas primeiro: só abre o JSON do que ainda é visível.
    let metaStat, jsonlStat;
    try { metaStat = fs.statSync(path.join(dir, n)); } catch { continue; }
    try { jsonlStat = fs.statSync(path.join(dir, m[1] + '.jsonl')); } catch { jsonlStat = null; }
    const ultima = jsonlStat ? Math.max(jsonlStat.mtimeMs, metaStat.mtimeMs) : metaStat.mtimeMs;
    if (agora - ultima > VISIVEL_MS) continue;
    const meta = lerJson(path.join(dir, n));
    if (!meta) continue;
    // O .meta.json é recriado ao terminar, então o início vem da criação do .jsonl.
    // Criação 0 ou depois da última atividade (arquivo copiado/restaurado) não é confiável: cai para a última atividade.
    const criacao = jsonlStat ? jsonlStat.birthtimeMs : metaStat.birthtimeMs;
    const inicio = criacao > 0 && criacao <= ultima ? criacao : ultima;
    let estado;
    if (!estaViva) estado = 'desligado';
    else if (meta.finished) estado = 'concluido';
    else if (agora - ultima > SEM_SINAL_MS) estado = 'semSinal';
    else estado = 'trabalhando';
    // Só "trabalhando" tem fim aberto; os demais congelam o cronômetro na última atividade.
    const fim = estado === 'trabalhando' ? null : ultima;
    const id = sessionId + '/' + m[1];
    arquivosAgentes.set(id, path.join(dir, m[1] + '.jsonl'));
    agentes.push({
      id,
      sessaoId: sessionId,
      tipo: maskNome(String(meta.agentType || 'desconhecido')).slice(0, 120), // igual ao nome do catálogo, senão a mesa fixa nunca casa
      descricao: mask(String(meta.description || '')).slice(0, 300), // corta depois de mascarar
      projeto,
      estado,
      inicio,
      fim,
    });
  }
  return agentes;
}

// --- Uso de skills: leitura incremental do .jsonl da sessão principal (só sessões vivas, só linhas novas) ---
const SKILL_ACESA_MS = 30 * 1000;
const MAX_LEITURA = 4 * 1024 * 1024; // se acumular mais que isso entre dois ciclos, pula para o fim
const USO_EXPIRA_MS = 10 * 60 * 1000; // depois disso a skill some da lista de "usadas"
const tails = new Map(); // arquivo -> { offset, resto: Buffer, ino, birth }
const usoSkills = new Map(); // nome da skill -> { em, projeto }

// Lê até `len` bytes a partir de `pos`; sempre fecha o arquivo.
function lerBytes(arquivo, pos, len) {
  const buf = Buffer.alloc(len);
  let fd;
  try {
    fd = fs.openSync(arquivo, 'r');
    const n = fs.readSync(fd, buf, 0, len, pos);
    return buf.subarray(0, n);
  } catch { return null; } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function novasLinhas(arquivo) {
  let st;
  try { st = fs.statSync(arquivo); } catch { return []; }
  let t = tails.get(arquivo);
  if (!t) { // primeira vez: começa do fim, sem histórico
    tails.set(arquivo, { offset: st.size, resto: Buffer.alloc(0), ino: st.ino, birth: st.birthtimeMs });
    return [];
  }
  // Arquivo recriado: menor que o offset, ou outro arquivo no mesmo caminho (ino/criação diferentes).
  if (st.size < t.offset || st.ino !== t.ino || st.birthtimeMs !== t.birth) {
    t.offset = 0; t.resto = Buffer.alloc(0); t.ino = st.ino; t.birth = st.birthtimeMs;
  }
  const len = st.size - t.offset;
  if (len === 0) return [];
  if (len > MAX_LEITURA) {
    // Pula para o fim. Se cair no meio de uma linha, o pedaço final dela não é JSON válido e o parse o ignora.
    t.offset = st.size; t.resto = Buffer.alloc(0);
    return [];
  }
  const buf = lerBytes(arquivo, t.offset, len);
  if (!buf) return [];
  t.offset += buf.length;
  const todo = Buffer.concat([t.resto, buf]);
  const i = todo.lastIndexOf(10);
  if (i < 0) { t.resto = todo; return []; }
  t.resto = todo.subarray(i + 1); // linha ainda incompleta
  return todo.subarray(0, i).toString('utf8').split('\n');
}

function processarLinha(linha, projeto) {
  // Filtro barato antes do parse; linhas api-request* e metadados nunca passam daqui.
  if (!linha.includes('"name":"Skill"')) return;
  let o;
  try { o = JSON.parse(linha); } catch { return; }
  if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) return;
  const ts = Date.parse(o.timestamp);
  for (const b of o.message.content) {
    if (b.type !== 'tool_use' || b.name !== 'Skill' || !b.input || typeof b.input.skill !== 'string') continue;
    const nome = maskNome(b.input.skill.slice(0, 64));
    usoSkills.set(nome, { em: Number.isFinite(ts) ? ts : Date.now(), projeto });
  }
}

function skillsComUso(skillsCatalogo, agora) {
  for (const [nome, uso] of usoSkills) if (agora - uso.em > USO_EXPIRA_MS) usoSkills.delete(nome);
  const lista = skillsCatalogo.map((s) => ({ ...s }));
  const conhecidas = new Set(lista.map((s) => s.nome));
  for (const nome of usoSkills.keys()) {
    // "plugin:skill" casa com a skill do catálogo pelo nome final
    const final = nome.includes(':') ? nome.split(':').pop() : nome;
    if (!conhecidas.has(nome) && !conhecidas.has(final)) lista.push({ nome, descricao: '' }); // skill nativa/de plugin
  }
  return lista.map((s) => {
    // Vários nomes podem casar ("a:foo", "b:foo", "foo"): vale o uso mais recente.
    let uso = null;
    for (const [n, u] of usoSkills) {
      if ((n === s.nome || n.endsWith(':' + s.nome)) && (!uso || u.em > uso.em)) uso = u;
    }
    return { ...s, acesa: !!uso && agora - uso.em < SKILL_ACESA_MS, projeto: uso ? uso.projeto : null };
  });
}

// --- Ferramenta em uso: só o NOME da ferramenta do último tool_use (nunca o input nem o conteúdo) ---
// Lê só o fim do .jsonl (96 KB) quando o arquivo mudou. "pendente" = esse tool_use ainda não tem tool_result.
const LEITURA_FERRAMENTA = 96 * 1024;
const ESPERA_MS = 8 * 1000; // ferramenta pendente por mais que isso, numa sessão ocupada: "possivelmente esperando você"
const SEM_ESPERA = new Set(['Agent', 'Task']); // delegar a um subagente demora de propósito: não é espera pelo usuário
const cacheFerramenta = new Map(); // arquivo -> { size, mtimeMs, valor }

// Devolve { ferr, linhas, conversa, mtimeMs }: a ferramenta, quantas linhas o fim do arquivo tem e quantas são de conversa
// (assistant/user, que o app usa). Muitas linhas e nenhuma de conversa = formato provavelmente mudou (ver `formatoSuspeito`).
function analisarFim(arquivo) {
  let st;
  try { st = fs.statSync(arquivo); } catch { return { ferr: null, linhas: 0, conversa: 0, mtimeMs: 0 }; }
  const guardado = cacheFerramenta.get(arquivo);
  if (guardado && guardado.size === st.size && guardado.mtimeMs === st.mtimeMs) return guardado.analise;
  const inicio = Math.max(0, st.size - LEITURA_FERRAMENTA);
  const buf = lerBytes(arquivo, inicio, st.size - inicio);
  let valor = null, total = 0, conversa = 0;
  if (buf) {
    const linhas = buf.toString('utf8').split('\n');
    if (inicio > 0) linhas.shift(); // a primeira linha pode estar cortada
    for (const l of linhas) { if (!l) continue; total++; if (l.includes('"type":"assistant"') || l.includes('"type":"user"')) conversa++; }
    const resultados = new Set(); // ids de tool_use que já têm resposta (as respostas vêm depois dos usos)
    for (let i = linhas.length - 1; i >= 0 && !valor; i--) {
      const l = linhas[i];
      if (!l.includes('"tool_use') || l.includes('"type":"api-request')) continue; // filtro barato antes do parse
      let o;
      try { o = JSON.parse(l); } catch { continue; }
      const c = o.message && o.message.content;
      if (!Array.isArray(c)) continue;
      if (o.type === 'user') {
        for (const b of c) if (b && b.type === 'tool_result' && typeof b.tool_use_id === 'string') resultados.add(b.tool_use_id);
      } else if (o.type === 'assistant') {
        const usos = c.filter((b) => b && b.type === 'tool_use' && typeof b.name === 'string');
        if (!usos.length) continue;
        const pendentes = usos.filter((b) => !resultados.has(b.id));
        const alvo = pendentes.length ? pendentes[pendentes.length - 1] : usos[usos.length - 1];
        const ts = Date.parse(o.timestamp);
        valor = { nome: maskNome(alvo.name.slice(0, 40)), desde: Number.isFinite(ts) ? ts : null, pendente: pendentes.length > 0 };
      }
    }
  }
  if (cacheFerramenta.size > 300) cacheFerramenta.clear();
  const analise = { ferr: valor, linhas: total, conversa, mtimeMs: st.mtimeMs };
  cacheFerramenta.set(arquivo, { size: st.size, mtimeMs: st.mtimeMs, analise });
  return analise;
}
const ferramentaAtual = (arquivo) => analisarFim(arquivo).ferr;
// Sessão com bastante atividade e nenhuma linha no formato que o app entende: o Claude Code provavelmente mudou o formato.
const formatoSuspeito = (a) => a.linhas >= 30 && a.conversa === 0;

const OBSOLETA_MS = 20 * 60 * 1000;
// PID reaproveitado por outro programa deixa uma sessão morta com status "busy" para sempre: se nem o arquivo da conversa
// nem o status mexem há 20 min (e nenhum subagente dela está trabalhando), não a trate como ocupada (aparece como aguardando, sem alertas de trabalho nem de espera).
function ocupadaDeVerdade(v, agora) {
  if (!v.ocupada) return false;
  const arquivoParado = v.mtime ? agora - v.mtime > OBSOLETA_MS : false;
  const statusAntigo = v.desde ? agora - v.desde > OBSOLETA_MS : true;
  return !(arquivoParado && statusAntigo);
}

function esperandoVoce(ocupado, ferr, agora) {
  return !!(ocupado && ferr && ferr.pendente && ferr.desde && !SEM_ESPERA.has(ferr.nome) && agora - ferr.desde > ESPERA_MS);
}

// Catálogo muda pouco: relê a cada 5 s.
let catalogo = { em: 0, dados: { agentes: [], skills: [] } };
function catalogoAtual(agora) {
  if (agora - catalogo.em > 5000) catalogo = { em: agora, dados: lerCatalogo(CLAUDE) };
  return catalogo.dados;
}

// Relatório final de um agente, lido sob demanda (clique na tela). O id vem da tela, então é validado
// e só serve para achar um caminho que o próprio monitor já descobriu; a tela nunca informa caminho.
function textoDoRelatorio(linha) {
  let o;
  try { o = JSON.parse(linha); } catch { return null; }
  if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) return null;
  return o.message.content;
}

function lerRelatorio(id) {
  if (typeof id !== 'string' || !UUID_AGENTE.test(id)) return null;
  const arquivo = arquivosAgentes.get(id);
  if (!arquivo) return null;
  let st;
  try { st = fs.statSync(arquivo); } catch { return null; }
  const inicio = Math.max(0, st.size - LEITURA_RELATORIO);
  const buf = lerBytes(arquivo, inicio, st.size - inicio);
  if (!buf) return null;
  const linhas = buf.toString('utf8').split('\n');
  if (inicio > 0) linhas.shift(); // primeira linha pode estar cortada
  let texto = null;
  let parcial = false; // true = não houve entrega final; é só o último texto do agente
  // 1º: a entrega final (SubagentHandback). 2º: o último texto do assistente.
  for (let i = linhas.length - 1; i >= 0 && texto === null; i--) {
    if (!linhas[i].includes('"SubagentHandback"')) continue;
    const c = textoDoRelatorio(linhas[i]);
    const b = c && c.find((x) => x.type === 'tool_use' && x.name === 'SubagentHandback' && x.input && typeof x.input.message === 'string');
    if (b) texto = b.input.message;
  }
  if (texto === null) parcial = true;
  for (let i = linhas.length - 1; i >= 0 && texto === null; i--) {
    if (!linhas[i].includes('"type":"assistant"') || linhas[i].includes('"type":"api-request')) continue;
    const c = textoDoRelatorio(linhas[i]);
    const t = c && c.filter((x) => x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n');
    if (t) texto = t;
  }
  if (texto === null) return { texto: '', truncado: false, parcial: false };
  texto = mask(texto); // primeiro mascara, depois corta (um segredo cortado ao meio escaparia da máscara)
  const truncado = texto.length > MAX_RELATORIO;
  return { texto: truncado ? texto.slice(0, MAX_RELATORIO) : texto, truncado, parcial };
}

// Comando para retomar a sessão de uma tarefa (vai para a área de transferência). Só vale para ids que o monitor conhece:
// nunca monta texto a partir de algo que a tela inventou. O id da sessão é um UUID (validado), sem caminho.
function comandoRetomada(id) {
  if (typeof id !== 'string' || !UUID_AGENTE.test(id) || !arquivosAgentes.has(id)) return null;
  return 'claude --resume ' + id.slice(0, 36);
}

// Mesa fixa por agente do catálogo. Com várias tarefas do mesmo agente, uma que ainda está ativa
// (trabalhando, senão sem sinal) vale mais que a mais recente; sem ativa, mostra a mais recente.
function montarMesas(agentesCatalogo, tarefas, haSessaoViva) {
  return agentesCatalogo.map((a) => {
    const doAgente = tarefas.filter((t) => t.tipo === a.nome); // já vêm da mais nova para a mais velha
    const ativa = doAgente.find((t) => t.estado === 'trabalhando') || doAgente.find((t) => t.estado === 'semSinal') || null;
    const ultima = ativa || doAgente[0] || null;
    const estado = ativa ? ativa.estado : (haSessaoViva ? 'parado' : 'desligado');
    return { nome: a.nome, descricao: a.descricao, estado, ultima };
  });
}

// Uma sala por projeto (só sessões vivas): as sessões ("Claude principal") e as execuções de agentes dela.
// Sessão: trabalhando (ocupada, sem subagente rodando), delegando (ocupada e com subagente rodando) ou aguardando (ociosa).
// Execução: em andamento, sem sinal, ou concluída há menos de ENCERRADA_MS (continua na sala só para mostrar "encerrou há Xs").
function montarSalas(vivas, tarefas, agora) {
  const porProjeto = new Map();
  for (const [id, v] of vivas) {
    const projeto = maskNome(path.basename(v.cwd) || '?'); // só a última pasta, nunca o caminho completo
    if (!porProjeto.has(projeto)) porProjeto.set(projeto, { projeto, sessoes: [], execucoes: [] });
    const comSubagente = tarefas.some((t) => t.sessaoId === id && t.estado === 'trabalhando'); // sessão pai calada enquanto o subagente trabalha
    const ocupada = ocupadaDeVerdade(v, agora) || (v.ocupada && comSubagente);
    const delegando = ocupada && tarefas.some((t) => t.sessaoId === id && t.estado === 'trabalhando');
    porProjeto.get(projeto).sessoes.push({ id, estado: delegando ? 'delegando' : (ocupada ? 'trabalhando' : 'aguardando'), inicio: v.inicio, desde: v.desde,
      ferramenta: v.ferr || null, esperando: esperandoVoce(ocupada, v.ferr, agora) });
  }
  let concluidas = 0;
  for (const t of tarefas) {
    const sala = [...porProjeto.values()].find((s) => s.sessoes.some((x) => x.id === t.sessaoId));
    if (!sala) continue; // sessão fechada: fora das salas
    if (t.estado === 'concluido') concluidas++;
    if (t.estado === 'trabalhando' || t.estado === 'semSinal' || (t.estado === 'concluido' && agora - t.fim < ENCERRADA_MS)) {
      t.esperando = esperandoVoce(t.estado === 'trabalhando', t.ferr, agora);
      sala.execucoes.push(t);
    }
  }
  const salas = [...porProjeto.values()].sort((a, b) => a.projeto.localeCompare(b.projeto, 'pt-BR'));
  for (const s of salas) s.sessoes.sort((a, b) => (a.inicio || 0) - (b.inicio || 0));
  const todasSessoes = salas.flatMap((s) => s.sessoes);
  const resumo = {
    trabalhando: todasSessoes.filter((x) => x.estado === 'trabalhando').length + salas.reduce((n, s) => n + s.execucoes.filter((e) => e.estado === 'trabalhando').length, 0),
    delegando: todasSessoes.filter((x) => x.estado === 'delegando').length,
    aguardando: todasSessoes.filter((x) => x.estado === 'aguardando').length,
    projetos: salas.length,
    sessoes: todasSessoes.length,
    concluidas,
  };
  return { salas, resumo };
}

// Sessões com subagentes recentes: vivas ou não (uma sessão fechada que for retomada "acorda" sozinha).
function lerEstado() {
  const agora = Date.now();
  const vivas = sessoesVivas();
  const raiz = path.join(CLAUDE, 'projects');
  const tarefas = [];
  const arquivosVivos = new Set();
  let formatoDesconhecido = 0; // sessões vivas cujo arquivo não tem nenhuma linha no formato esperado
  let projetos = [];
  try { projetos = fs.readdirSync(raiz); } catch { /* sem projetos */ }
  for (const p of projetos) {
    const pasta = path.join(raiz, p);
    let sessoes = [];
    try { sessoes = fs.readdirSync(pasta, { withFileTypes: true }); } catch { continue; }
    for (const s of sessoes) {
      if (s.isDirectory() && /^[0-9a-f-]{36}$/.test(s.name)) {
        tarefas.push(...agentesDaSessao(pasta, s.name, vivas.has(s.name), agora));
      } else if (s.isFile() && /^[0-9a-f-]{36}\.jsonl$/.test(s.name) && vivas.has(s.name.slice(0, -6))) {
        const arquivo = path.join(pasta, s.name);
        arquivosVivos.add(arquivo);
        const v = vivas.get(s.name.slice(0, -6));
        const an = analisarFim(arquivo);
        v.ferr = an.ferr; v.mtime = an.mtimeMs;
        if (formatoSuspeito(an)) formatoDesconhecido++;
        const projeto = maskNome(path.basename(v.cwd) || '?');
        for (const l of novasLinhas(arquivo)) processarLinha(l, projeto);
      }
    }
  }
  for (const f of [...tails.keys()]) if (!arquivosVivos.has(f)) tails.delete(f); // sessão fechou
  tarefas.sort((a, b) => b.inicio - a.inicio);
  for (const t of tarefas) if (t.estado === 'trabalhando') { const a = arquivosAgentes.get(t.id); t.ferr = a ? ferramentaAtual(a) : null; }
  const idsVistos = new Set(tarefas.map((t) => t.id));
  for (const id of [...arquivosAgentes.keys()]) if (!idsVistos.has(id)) arquivosAgentes.delete(id); // não acumula
  const cat = catalogoAtual(agora);
  const nomesCatalogo = new Set(cat.agentes.map((a) => a.nome));
  // Agente nativo (sem arquivo em agents/): mesa temporária enquanto roda e por 30 s depois de concluir.
  const temporarias = tarefas.filter((t) => !nomesCatalogo.has(t.tipo)
    && (t.estado === 'trabalhando' || t.estado === 'semSinal' || (t.estado === 'concluido' && agora - t.fim < 30000)));
  const chefes = [...vivas.entries()].map(([id, v]) => ({
    id,
    projeto: maskNome(path.basename(v.cwd) || '?'), // só a última pasta, nunca o caminho completo
    estado: v.ocupada ? 'trabalhando' : 'parado',
  }));
  const { salas, resumo } = montarSalas(vivas, tarefas, agora);
  return {
    agora,
    salas,
    resumo,
    alertas: { formato: formatoDesconhecido, pastaAusente: !pastaExiste() },
    chefes,
    mesas: montarMesas(cat.agentes, tarefas, vivas.size > 0),
    temporarias,
    skills: skillsComUso(cat.skills, agora),
    agentes: tarefas.slice(0, MAX_ATIVIDADE), // histórico curto; as mesas usam a lista completa
  };
}

// Troca a pasta lida (escolhida em Configurações; null = padrão). A variável de teste sempre vence. Limpa o que estava guardado.
function definirPasta(pasta) {
  CLAUDE = PASTA_FORCADA || (typeof pasta === 'string' && pasta ? pasta : PASTA_PADRAO);
  tails.clear(); ultimasBoas.clear(); cacheFerramenta.clear(); arquivosAgentes.clear(); usoSkills.clear(); nomesProjeto.clear();
  catalogo = { em: 0, dados: { agentes: [], skills: [] } };
}

// O que há na pasta lida (para a tela de Configurações): existe? quantos agentes, skills e sessões abertas.
function resumoDaPasta() {
  let existe = false;
  try { existe = fs.statSync(CLAUDE).isDirectory(); } catch { /* pasta ausente */ }
  const cat = existe ? lerCatalogo(CLAUDE) : { agentes: [], skills: [] };
  return { pasta: CLAUDE, padrao: CLAUDE === PASTA_PADRAO, forcada: !!PASTA_FORCADA, existe, agentes: cat.agentes.length, skills: cat.skills.length, sessoes: existe ? sessoesVivas().size : 0 };
}

// Só para testes: limpa o estado guardado entre chamadas.
function reiniciar() {
  tails.clear();
  ultimasBoas.clear();
  cacheFerramenta.clear();
  arquivosAgentes.clear();
  usoSkills.clear();
  nomesProjeto.clear();
  catalogo = { em: 0, dados: { agentes: [], skills: [] } };
}

module.exports = { lerEstado, lerRelatorio, comandoRetomada, definirPasta, resumoDaPasta, reiniciar, ESPERA_MS };
