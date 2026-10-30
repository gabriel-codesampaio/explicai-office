// Topo da tela: os 4 cartões de resumo e a faixa "AO VIVO". Só lê o estado; nunca grava nada.
// Atualiza também no modo Painel (os números valem nos dois modos).
(function () {
  const { Modelo } = window;
  let estado = {};

  const defina = (id, v) => {
    const el = document.getElementById(id);
    if (el.textContent !== v) el.textContent = v;
  };
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour12: false });

  function atualizar() {
    if (document.hidden) return;
    const r = Modelo.resumoTopo(estado);
    defina('c-trabalhando', String(r.trabalhando));
    defina('c-delegando', String(r.delegando));
    defina('c-aguardando', String(r.aguardando));
    defina('c-projetos', String(r.projetos));
    const nf = (estado.alertas && estado.alertas.formato) || 0;
    const semPasta = !!(estado.alertas && estado.alertas.pastaAusente);
    const alerta = document.getElementById('alerta-formato');
    const txtAlerta = semPasta ? 'Não encontrei a pasta do Claude Code. Abra o Claude Code uma vez ou escolha a pasta em Configurações.'
      : nf ? 'Formato dos arquivos do Claude Code não reconhecido em ' + plural(nf, 'sessão', 'sessões') + ': algumas informações podem faltar (o Escrithorius pode precisar de atualização).' : '';
    if (alerta.textContent !== txtAlerta) alerta.textContent = txtAlerta;
    alerta.hidden = !txtAlerta;
    defina('vivo-texto', [
      plural(r.sessoes, 'sessão ativa', 'sessões ativas'),
      plural(r.execucoes, 'execução em andamento', 'execuções em andamento'),
      plural(r.concluidas, 'concluída', 'concluídas'),
      'último evento ' + (r.ultimo === null ? '—' : hora(r.ultimo)),
      'atualiza a cada 1 s',
    ].join(' · '));
  }

  window.office.aoReceberEstado((e) => { estado = e; atualizar(); });
  setInterval(atualizar, 1000);
  document.addEventListener('visibilitychange', atualizar);
  atualizar();
})();
