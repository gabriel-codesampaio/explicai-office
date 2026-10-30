// Modo compacto (mini-janela sempre no topo): uma linha por projeto com o estado que mais pede atenção. Só lógica, sem DOM.
(function (raiz) {
  const Salas = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./salas.js') : raiz.Salas;

  const ativa = (e) => e.estado === 'trabalhando' || e.estado === 'semSinal';

  // estado = o que o monitor devolve; agora = Date.now(). Devolve { resumo, linhas: [{ chave, classe, texto, detalhe, tarefaId }] }.
  function resumir(estado, agora) {
    const salas = (estado && estado.salas) || [];
    const linhas = salas.map((s) => {
      const sessoes = s.sessoes || [], execs = s.execucoes || [];
      const ativas = execs.filter(ativa).length;
      const esperando = sessoes.some((x) => x.esperando && (x.estado === 'trabalhando' || x.estado === 'delegando')) || execs.some((e) => e.estado === 'trabalhando' && e.esperando);
      const delegando = sessoes.some((x) => x.estado === 'delegando');
      const trabalhando = sessoes.some((x) => x.estado === 'trabalhando') || ativas > 0;
      let classe, rotulo;
      if (esperando) { classe = 'esperando'; rotulo = 'esperando você?'; }
      else if (delegando) { classe = 'delegando'; rotulo = 'delegando'; }
      else if (trabalhando) { classe = 'trabalhando'; rotulo = 'trabalhando'; }
      else { classe = 'aguardando'; rotulo = 'aguardando'; }
      const desde = sessoes.map((x) => x.desde || x.inicio || 0).filter(Boolean).sort((a, b) => a - b).pop(); // a mudança de estado mais recente
      const partes = [rotulo];
      if (ativas) partes.push(ativas + (ativas === 1 ? ' agente' : ' agentes'));
      if (desde) partes.push(Salas.fmtTempo(agora - desde));
      return { chave: 'proj:' + s.projeto, classe, texto: s.projeto + ': ' + partes.join(' · '), detalhe: '', tarefaId: null };
    });
    const r = (estado && estado.resumo) || {};
    const n = (v) => (Number.isFinite(v) ? v : 0);
    const resumo = (n(r.trabalhando) + n(r.delegando)) + ' em atividade · ' + n(r.aguardando) + ' aguardando';
    return { resumo, linhas };
  }

  const Compacto = { resumir };
  if (typeof module !== 'undefined' && module.exports) module.exports = Compacto;
  else raiz.Compacto = Compacto;
})(typeof window !== 'undefined' ? window : globalThis);
