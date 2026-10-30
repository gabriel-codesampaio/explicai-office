// Modo Painel: uma seção por projeto (mesma ordem das salas) com TODAS as sessões e execuções, no estado real que o monitor
// informa (os cartões do topo e a sala dizem a mesma coisa), inclusive as que não cabem na sala. Só lógica, sem DOM.
(function (raiz) {
  const Salas = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./salas.js') : raiz.Salas;

  const ROTULO = { trabalhando: 'trabalhando', delegando: 'delegando', aguardando: 'aguardando', semSinal: 'sem sinal', concluido: 'encerrada' };
  const ativa = (e) => e.estado === 'trabalhando' || e.estado === 'semSinal';

  // estado = o que o monitor devolve; agora = Date.now(). Devolve [{ projeto, subtitulo, espera: [nomes], itens: [{ chave, classe, texto, detalhe, tarefaId }] }].
  function projetos(estado, agora) {
    const catalogo = ((estado && estado.mesas) || []).map((m) => m.nome);
    return ((estado && estado.salas) || []).map((s) => {
      const itens = [];
      for (const x of s.sessoes || []) {
        const ativo = x.estado === 'trabalhando' || x.estado === 'delegando';
        const esp = ativo && !!x.esperando;
        itens.push({ chave: 'sessao:' + x.id, classe: x.estado + (esp ? ' esperando' : ''), texto: 'Claude principal: ' + (ROTULO[x.estado] || x.estado) + ((x.desde || x.inicio) ? ' · ' + Salas.fmtTempo(agora - (x.desde || x.inicio)) : '') + (esp ? ' · possivelmente esperando você' : ''),
          detalhe: ativo ? Salas.linhaFerramenta(x.ferramenta, agora) : '', tarefaId: null });
      }
      const execs = (s.execucoes || []).slice().sort((a, b) => (ativa(b) - ativa(a)) || ((a.inicio || 0) - (b.inicio || 0)));
      for (const e of execs) {
        const tempo = e.estado === 'concluido' ? 'encerrou há ' + Salas.fmtTempo(agora - (e.fim || agora)) : Salas.fmtTempo(agora - (e.inicio || agora));
        const esp = e.estado === 'trabalhando' && !!e.esperando;
        const ferr = e.estado === 'trabalhando' ? Salas.linhaFerramenta(e.ferr, agora) : '';
        itens.push({ chave: 'exec:' + e.id, classe: e.estado + (esp ? ' esperando' : ''), texto: e.tipo + ': ' + (ROTULO[e.estado] || e.estado) + ' · ' + tempo + (esp ? ' · possivelmente esperando você' : ''),
          detalhe: [e.descricao || '', ferr].filter(Boolean).join(' · '), tarefaId: e.id });
      }
      const emUso = new Set(execs.filter(ativa).map((e) => e.tipo));
      const ativas = execs.filter(ativa).length;
      const encerradas = execs.length - ativas;
      return {
        projeto: s.projeto,
        subtitulo: ativas + (ativas === 1 ? ' execução ativa' : ' execuções ativas') + ' · ' + encerradas + (encerradas === 1 ? ' encerrada' : ' encerradas'),
        espera: catalogo.filter((n) => !emUso.has(n)),
        itens,
      };
    });
  }

  const Painel = { projetos, ROTULO };
  if (typeof module !== 'undefined' && module.exports) module.exports = Painel;
  else raiz.Painel = Painel;
})(typeof window !== 'undefined' ? window : globalThis);
