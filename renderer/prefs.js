// Preferências vividas na tela (liga/desliga). Quem decide e guarda é o processo principal (src/config.js); aqui fica só o espelho,
// para os botões do topo, a tela de Configurações e a cena concordarem entre si.
(function () {
  const Prefs = {
    avisos: true, som: false, falas: true,
    // Atualiza o espelho e os botões do topo com o que o processo principal devolveu.
    aplicar(c) {
      if (!c) return;
      for (const k of ['avisos', 'som', 'falas']) if (typeof c[k] === 'boolean') Prefs[k] = c[k];
      for (const [id, v] of [['op-avisos', Prefs.avisos], ['op-som', Prefs.som]]) {
        const b = document.getElementById(id);
        if (b && b.getAttribute('aria-pressed') !== String(v)) b.setAttribute('aria-pressed', String(v));
      }
    },
  };
  window.Prefs = Prefs;
})();
