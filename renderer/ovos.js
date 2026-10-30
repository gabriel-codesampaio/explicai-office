// Easter eggs e ciclo dia/noite: só lógica (sem canvas nem DOM), para ser testável.
// Frase sorteada (frases.js) ao concluir uma tarefa, "Equipe completa" quando a sala inteira termina junta, faixa de combo
// (5 conclusões em 10 min) e o quanto é "noite" pela hora do relógio.
(function (raiz) {
  const Frases = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./frases.js') : raiz.Frases;
  const DURACAO_FALA = 4000;
  const DURACAO_COMBO = 8000;
  const JANELA_COMBO = 10 * 60 * 1000;
  const CONCLUSOES_COMBO = 5;

  // Quão escuro está (0 = dia, 1 = noite) para a hora local (0 a 24): escurece das 17h30 às 20h30 e clareia das 5h30 às 7h30.
  function noite(hora) {
    const h = ((Number(hora) % 24) + 24) % 24;
    if (!Number.isFinite(h)) return 0;
    if (h >= 20.5 || h < 5.5) return 1;
    if (h >= 7.5 && h <= 17.5) return 0;
    if (h > 17.5) return (h - 17.5) / 3;
    return 1 - (h - 5.5) / 2;
  }

  function criar({ rnd = Math.random } = {}) {
    let ultimaFala = -1; // índice da última frase sorteada (não repete em seguida)
    const conclusoes = []; // instantes das últimas conclusões
    const falas = new Map(); // chave -> { texto, ate }
    let comboAte = 0;

    // Chamar quando o item `chave` acabou de concluir; `slots` é o estado atual da sala (para saber se todos concluíram juntos).
    // Devolve { texto, autor }: uma frase aleatória com o nome do autor (a persona) ou "Equipe completa" (sem autor).
    function concluiu(slots, chave, agora) {
      const fixos = slots.filter((s) => s.zona === 'fixo');
      let fala;
      if (fixos.length >= 2 && fixos.every((s) => s.estado === 'concluido')) fala = { texto: 'Equipe completa: tudo entregue!', autor: '' };
      else { const f = Frases.sortear(rnd, ultimaFala); ultimaFala = f.indice; fala = { texto: f.frase, autor: f.autor }; }
      falas.set(chave, Object.assign({ ate: agora + DURACAO_FALA }, fala));
      conclusoes.push(agora);
      while (conclusoes.length && agora - conclusoes[0] > JANELA_COMBO) conclusoes.shift();
      if (conclusoes.length >= CONCLUSOES_COMBO) { comboAte = agora + DURACAO_COMBO; conclusoes.length = 0; }
      return fala;
    }

    function fala(chave, agora) {
      const f = falas.get(chave);
      if (!f) return null;
      if (agora >= f.ate) { falas.delete(chave); return null; }
      return { texto: f.texto, autor: f.autor };
    }

    return { concluiu, fala, combo: (agora) => agora < comboAte };
  }

  const Ovos = { criar, noite, DURACAO_FALA, DURACAO_COMBO };
  if (typeof module !== 'undefined' && module.exports) module.exports = Ovos;
  else raiz.Ovos = Ovos;
})(typeof window !== 'undefined' ? window : globalThis);
