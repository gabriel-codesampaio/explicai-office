// Avisos: percebe, a cada leitura do monitor, o que mudou de estado e que merece chamar a atenção do usuário.
// Só lógica (sem Electron nem disco). Nunca usa descrição nem relatório: só nome do agente, projeto e tipo de aviso
// (que já vêm mascarados do monitor), para não vazar nada na tela de bloqueio nem no histórico de notificações.
const { mask } = require('./mask');

const MAX_LINHAS = 4;
const MAX_TEXTO = 40;
const AGRUPA_MS = 1500; // o que muda dentro dessa janela vira um aviso só
const MIN_ENTRE_AVISOS_MS = 12000; // nunca mais de um aviso a cada 12 s (arquivo plantado em loop não vira enxurrada)
const MAX_PENDENTES = 50;
const REAVISO_ESPERANDO_MS = 5 * 60 * 1000; // a mesma sessão/execução não avisa "possivelmente espera você" de novo antes disso

// Nome seguro para a notificação: sem caracteres de controle, quebra de linha nem de inversão de texto (RLO etc.), cortado em
// MAX_TEXTO e, se a máscara completa (inclusive "sequência longa") o alteraria, troca por um texto genérico.
// Caracteres que não podem entrar no texto da notificação: controle (inclui quebra de linha), invisíveis e de inversão de texto.
const perigoso = (c) => c < 32 || (c >= 127 && c <= 159) || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
const corta = (t, generico = 'Agente') => {
  const bruto = String(t == null ? '' : t);
  const s = Array.from(bruto, (ch) => (perigoso(ch.codePointAt(0)) ? ' ' : ch)).join('').split(/\s+/).filter(Boolean).join(' ');
  if (!s || mask(s) !== s) return generico;
  return s.length > MAX_TEXTO ? s.slice(0, MAX_TEXTO - 1) + '…' : s;
};

// Quanto esperar para enviar o lote atual: a janela de agrupamento, ou mais, se o último aviso foi há pouco.
const atrasoDoEnvio = (agora, ultimoAviso) => Math.max(AGRUPA_MS, (ultimoAviso || 0) + MIN_ENTRE_AVISOS_MS - agora);
// Teto de itens guardados à espera do envio (fica com os mais recentes).
const limitar = (pendentes) => (pendentes.length > MAX_PENDENTES ? pendentes.slice(-MAX_PENDENTES) : pendentes);

function criarAvisos({ agora: relogio = Date.now } = {}) {
  const ultimoEsperando = new Map(); // chave -> quando avisou "possivelmente espera você" pela última vez
  const antes = new Map(); // chave -> estado na leitura anterior
  const antesEsperando = new Map(); // chave -> estava "possivelmente esperando você" na leitura anterior
  let primeira = true; // a primeira leitura (ao abrir o app) nunca avisa

  function podeAvisarEsperando(k) {
    const agoraMs = relogio(), ultimo = ultimoEsperando.get(k);
    if (ultimo !== undefined && agoraMs - ultimo < REAVISO_ESPERANDO_MS) return false;
    ultimoEsperando.set(k, agoraMs);
    for (const [c, quando] of ultimoEsperando) if (agoraMs - quando > REAVISO_ESPERANDO_MS) ultimoEsperando.delete(c); // não acumula
    return true;
  }

  // estado = o que lerEstado() devolve. Devolve os itens novos: { tipo: 'aguardando' | 'concluido' | 'semSinal' | 'esperando', projeto, rotulo, tarefaId }.
  function processar(estado) {
    const agora = new Map();
    const agoraEsperando = new Map();
    const itens = [];
    for (const sala of (estado && estado.salas) || []) {
      for (const s of sala.sessoes || []) {
        const k = 'sessao:' + s.id;
        agora.set(k, s.estado);
        const prev = antes.get(k);
        if (!primeira && s.estado === 'aguardando' && (prev === 'trabalhando' || prev === 'delegando')) {
          itens.push({ tipo: 'aguardando', projeto: sala.projeto, rotulo: 'Claude principal', tarefaId: null });
        }
        const esp = !!s.esperando && (s.estado === 'trabalhando' || s.estado === 'delegando');
        agoraEsperando.set(k, esp);
        if (!primeira && esp && antesEsperando.get(k) === false && podeAvisarEsperando(k)) itens.push({ tipo: 'esperando', projeto: sala.projeto, rotulo: 'Claude principal', tarefaId: null });
      }
      for (const e of sala.execucoes || []) {
        const k = 'exec:' + e.id;
        agora.set(k, e.estado);
        const prev = antes.get(k);
        const esp = !!e.esperando && e.estado === 'trabalhando';
        agoraEsperando.set(k, esp);
        if (!primeira && esp && antesEsperando.get(k) === false && podeAvisarEsperando(k)) itens.push({ tipo: 'esperando', projeto: sala.projeto, rotulo: e.tipo, tarefaId: null });
        if (primeira || prev === e.estado) continue;
        if (e.estado === 'concluido' && (prev === 'trabalhando' || prev === 'semSinal')) itens.push({ tipo: 'concluido', projeto: sala.projeto, rotulo: e.tipo, tarefaId: e.id });
        else if (e.estado === 'semSinal' && prev === 'trabalhando') itens.push({ tipo: 'semSinal', projeto: sala.projeto, rotulo: e.tipo, tarefaId: null });
      }
    }
    antes.clear();
    for (const [k, v] of agora) antes.set(k, v);
    antesEsperando.clear();
    for (const [k, v] of agoraEsperando) antesEsperando.set(k, v);
    primeira = false;
    return itens;
  }

  return { processar };
}

const FRASE = { aguardando: 'aguarda você', concluido: 'concluiu', semSinal: 'está sem sinal', esperando: 'possivelmente espera você' };
const linha = (i) => corta(i.rotulo) + ' ' + FRASE[i.tipo] + ' · ' + corta(i.projeto, 'projeto');

// Junta os itens do mesmo período num único aviso: { titulo, corpo, tarefaId } (tarefaId só quando é um único agente concluído).
function montarAviso(itens) {
  if (!itens || !itens.length) return null;
  if (itens.length === 1) {
    const i = itens[0];
    return { titulo: corta(i.rotulo) + ' ' + FRASE[i.tipo], corpo: 'Projeto ' + corta(i.projeto, 'oculto'), tarefaId: i.tipo === 'concluido' ? i.tarefaId : null, rotulo: corta(i.rotulo) };
  }
  const linhas = itens.slice(0, MAX_LINHAS).map(linha);
  if (itens.length > MAX_LINHAS) linhas.push('+' + (itens.length - MAX_LINHAS) + ' mais');
  return { titulo: itens.length + ' avisos do Escrithorius', corpo: linhas.join('\n'), tarefaId: null, rotulo: null };
}

module.exports = { criarAvisos, montarAviso, atrasoDoEnvio, limitar, AGRUPA_MS, MIN_ENTRE_AVISOS_MS, MAX_PENDENTES, REAVISO_ESPERANDO_MS };
