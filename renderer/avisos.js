// Botões "Avisos" e "Som" do topo. Quem decide e mostra a notificação é o processo principal (src/avisos.js); aqui só se liga e desliga.
// As escolhas ficam no config.json local (ver Configurações): ao abrir, o estado vem de lá.
(function () {
  const api = window.escrithorius;
  const botoes = [['op-avisos', 'avisos', (v) => api.definirAvisos(v)], ['op-som', 'som', (v) => api.definirSom(v)]];
  for (const [id, chave, enviar] of botoes) {
    const b = document.getElementById(id);
    b.addEventListener('click', () => {
      const novo = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(novo));
      window.Prefs[chave] = novo;
      enviar(novo);
    });
  }
  api.obterConfig().then((c) => window.Prefs.aplicar(c)).catch(() => { /* fica no padrão */ });
})();
