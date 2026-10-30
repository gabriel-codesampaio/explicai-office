// Relógio de animação da cena: funções puras que, dado o tempo (ms), dizem em que quadro cada coisa está.
// Não conhece canvas nem arte: quando o visual mudar, isto continua valendo.
(function (raiz) {
  const FPS = 20;
  const PASSO_MS = 1000 / FPS;

  // Mãos digitando: 2 quadros, trocando a cada 140 ms.
  const quadroDigitando = (t) => Math.floor(t / 140) % 2;
  // Texto na tela do monitor: 4 quadros, a cada 250 ms.
  const quadroTela = (t) => Math.floor(t / 250) % 4;

  // Piscar: 140 ms a cada 4,2 s, defasado por personagem (a semente vem do nome) para não piscarem todos juntos.
  const CICLO_PISCAR = 4200;
  function piscando(t, semente) {
    const f = (t + (Math.abs(semente) % 1000) * 7) % CICLO_PISCAR;
    return f < 140;
  }

  // "ZZZ" subindo: 3 letras defasadas; cada uma sobe até 6 px e some no fim do ciclo.
  const CICLO_Z = 2400;
  function zzz(t) {
    const letras = [];
    for (let i = 0; i < 3; i++) {
      const f = ((t + (i * CICLO_Z) / 3) % CICLO_Z) / CICLO_Z;
      letras.push({ dx: i * 4 + Math.floor(f * 3), dy: -Math.floor(f * 6), visivel: f < 0.85 });
    }
    return letras;
  }

  // "?" balançando de leve (sem sinal).
  const duvidaDy = (t) => [0, 0, -1, -1][Math.floor(t / 200) % 4];

  // Visto de concluído: pula por 600 ms, fica parado até 4 s e some. `desde` = quando o estado virou "concluído".
  const PULO_VISTO = [-3, -5, -5, -3, -1, 0];
  function visto(desde, t) {
    const dt = t - desde;
    if (!Number.isFinite(dt) || dt < 0 || dt > 4000) return null;
    return { dy: dt < 600 ? PULO_VISTO[Math.floor(dt / 100)] : 0 };
  }

  const Anim = { FPS, PASSO_MS, quadroDigitando, quadroTela, piscando, zzz, duvidaDy, visto };
  if (typeof module !== 'undefined' && module.exports) module.exports = Anim;
  else raiz.Anim = Anim;
})(typeof window !== 'undefined' ? window : globalThis);
