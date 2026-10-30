// Tela de Configurações: preferências (avisos, som, falas), pasta do Claude Code lida pelo app e informações para quem recebeu o projeto.
// Só texto puro (textContent). A pasta nunca é digitada: só o seletor nativo de pastas (processo principal) ou "usar a padrão".
(function () {
  const api = window.escrithorius;
  const caixa = document.getElementById('config');
  const abrir = document.getElementById('op-config');
  const fechar = document.getElementById('config-fechar');
  const texto = (id, v) => { const el = document.getElementById(id); if (el.textContent !== v) el.textContent = v; };
  let focoAnterior = null;
  const FUNDO = ['topo', 'vista-cena', 'vista-compacta', 'vista-lista'];
  let atual = null;

  function mostrar(c) {
    if (!c) return;
    atual = c;
    window.Prefs.aplicar(c);
    for (const k of ['avisos', 'som', 'falas']) document.getElementById('cfg-' + k).checked = !!c[k];
    texto('cfg-pasta', c.pasta + (c.forcada ? ' (definida pelo ambiente)' : c.padrao ? ' (padrão)' : ''));
    const partes = c.existe
      ? [c.agentes + (c.agentes === 1 ? ' agente' : ' agentes'), c.skills + (c.skills === 1 ? ' skill' : ' skills'), c.sessoes + (c.sessoes === 1 ? ' sessão aberta' : ' sessões abertas')]
      : [];
    texto('cfg-status', c.existe ? 'Encontrada: ' + partes.join(' · ') + '.'
      : 'Pasta não encontrada. O Claude Code cria essa pasta na primeira execução: abra o Claude Code uma vez, ou escolha outra pasta.');
    document.getElementById('cfg-status').className = c.existe ? 'suave' : 'suave aviso-pasta';
    texto('cfg-erro', c.erro || '');
    document.getElementById('cfg-escolher').disabled = !!c.forcada;
    document.getElementById('cfg-padrao').disabled = !!c.forcada || !!c.padrao;
    texto('cfg-versao', 'Escrithorius ' + c.versao + ' · preferências em ' + c.arquivo);
  }

  async function recarregar() { try { mostrar(await api.obterConfig()); } catch { /* mantém o que está na tela */ } }

  function abrirConfig() {
    focoAnterior = document.activeElement;
    for (const k of ['avisos', 'som', 'falas']) document.getElementById('cfg-' + k).checked = !!window.Prefs[k]; // até a resposta chegar
    caixa.hidden = false;
    for (const id of FUNDO) { const el = document.getElementById(id); if (el) el.inert = true; } // o fundo não recebe foco nem leitor de tela
    recarregar();
    fechar.focus();
  }
  function fecharConfig() {
    if (caixa.hidden) return;
    caixa.hidden = true;
    for (const id of FUNDO) { const el = document.getElementById(id); if (el) el.inert = false; }
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
    focoAnterior = null;
  }

  abrir.addEventListener('click', abrirConfig);
  fechar.addEventListener('click', fecharConfig);
  caixa.addEventListener('click', (e) => { if (e.target === caixa) fecharConfig(); }); // clique fora da caixa
  document.addEventListener('keydown', (e) => {
    if (caixa.hidden) return;
    if (e.key === 'Escape') { fecharConfig(); e.stopPropagation(); return; }
    if (e.key === 'Tab') { // o foco não sai da caixa enquanto ela está aberta
      const itens = Array.from(caixa.querySelectorAll('button:not([disabled]), input:not([disabled])'));
      if (!itens.length) return;
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      else if (!caixa.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
    }
  }, true);

  for (const k of ['avisos', 'som', 'falas']) {
    document.getElementById('cfg-' + k).addEventListener('change', async (e) => {
      try { mostrar(await api.definirConfig({ [k]: e.target.checked })); } catch { recarregar(); }
    });
  }
  document.getElementById('cfg-escolher').addEventListener('click', async () => { try { mostrar(await api.escolherPasta()); } catch { recarregar(); } });
  document.getElementById('cfg-padrao').addEventListener('click', async () => { try { mostrar(await api.pastaPadrao()); } catch { recarregar(); } });
  setInterval(() => { if (!caixa.hidden && !document.hidden) recarregar(); }, 3000); // a contagem de sessões abertas acompanha
})();
