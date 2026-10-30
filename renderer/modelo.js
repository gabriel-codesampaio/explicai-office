// Funções puras de apoio da tela: aparência estável a partir do nome, durações e os números do topo.
// Não tocam em canvas nem DOM (o layout das salas fica em salas.js).
(function (raiz) {
  const ROTULO = { trabalhando: 'trabalhando', concluido: 'concluído', semSinal: 'sem sinal', desligado: 'desligado', parado: 'parado' };

  function duracao(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // Hash FNV-1a de 32 bits: o mesmo nome sempre dá a mesma aparência.
  function hash(texto) {
    let h = 0x811c9dc5;
    const t = String(texto == null ? '' : texto);
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  const N_PELE = 3, N_CABELO = 5, N_CAMISA = 6, N_ESTILO = 3, N_ACESSORIO = 4, N_COR_SKILL = 12;

  // Aparência a partir do nome; a sessão ("Claude principal") usa o nome do projeto só para a camisa.
  function aparencia(nome, projeto) {
    const h = hash(nome);
    return {
      pele: h % N_PELE,
      cabelo: (h >>> 4) % N_CABELO,
      estilo: (h >>> 8) % N_ESTILO,
      acessorio: (h >>> 12) % N_ACESSORIO,
      camisa: (projeto !== undefined ? hash(projeto) : h >>> 16) % N_CAMISA,
    };
  }

  // Sigla de duas letras da skill: iniciais das duas primeiras palavras ("frontend-design" -> FD) ou as duas primeiras letras ("accessibility" -> AC).
  function siglaDe(nome) {
    const partes = String(nome == null ? '' : nome).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((p) => Array.from(p));
    if (!partes.length) return '?';
    const letras = partes.length > 1 ? [partes[0][0], partes[1][0]] : partes[0].slice(0, 2);
    return letras.join('').toLocaleUpperCase('pt-BR');
  }

  // Números do topo (4 cartões e a faixa "AO VIVO") a partir do estado do monitor; campos ausentes viram 0.
  function resumoTopo(estado) {
    const e = estado || {}, r = e.resumo || {};
    const n = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
    const execucoes = (e.salas || []).reduce((t, s) => t + (s.execucoes || []).filter((x) => x.estado === 'trabalhando' || x.estado === 'semSinal').length, 0);
    let ultimo = null; // instante da atividade mais recente
    for (const a of e.agentes || []) {
      const t = a.fim || a.inicio;
      if (Number.isFinite(t) && (ultimo === null || t > ultimo)) ultimo = t;
    }
    return { trabalhando: n(r.trabalhando), delegando: n(r.delegando), aguardando: n(r.aguardando), projetos: n(r.projetos), sessoes: n(r.sessoes), concluidas: n(r.concluidas), execucoes, ultimo };
  }

  const Modelo = { ROTULO, N_PELE, N_CABELO, N_CAMISA, N_ESTILO, N_ACESSORIO, N_COR_SKILL, duracao, hash, aparencia, siglaDe, resumoTopo };
  if (typeof module !== 'undefined' && module.exports) module.exports = Modelo;
  else raiz.Modelo = Modelo;
})(typeof window !== 'undefined' ? window : globalThis);
