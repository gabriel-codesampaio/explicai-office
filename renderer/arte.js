// Arte original em pixel art, vista de cima, desenhada em código (nada copiado de jogo, imagem ou pacote algum).
// A sala é desenhada numa tela lógica pequena (Salas.LARGURA x Salas.ALTURA) e ampliada em escala inteira sem suavizar;
// os textos (etiquetas) são desenhados depois, em vetor, na resolução real da tela.
(function (raiz) {
  const Salas = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./salas.js') : raiz.Salas;
  const { LARGURA: W, ALTURA: H, PAREDE, MESAS, CAFE, ESTAR, CELULA } = Salas;
  const CAFE_X_VIZINHO = 206; // no café, quem fica à direita deste x tem a etiqueta mais abaixo (as etiquetas largas se sobreporiam)
  const FONTE = '"Segoe UI", system-ui, sans-serif';

  const P = {
    peles: ['#f6cfa5', '#d9a066', '#8d5a3b'],
    cabelos: ['#3b2418', '#8a5a34', '#e2b04a', '#c0502d', '#aab4ba'],
    camisas: ['#d64a3a', '#3a8fd1', '#34a56a', '#9b59b6', '#eb9a2a', '#27a8a4'],
    skills: ['#4f7fe0', '#e0584f', '#e5a92e', '#2fa36b', '#8a5ad6', '#2aa1b8', '#d9528f', '#7fa6d6', '#f0813a', '#d9785a', '#4aa3df', '#3ed68a'],
    losango: { verde: '#4ade80', azul: '#60a5fa', laranja: '#fbbf24', cinza: '#8d88a8' },
    roxo: '#8b5cf6', roxoClaro: '#a78bfa', fundoEtiqueta: 'rgba(14,10,28,0.92)', suave: '#a79fc4', zona: '#8a7fb5',
  };

  function escurecer(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const r = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

  // ---------- sala estática (cacheada) ----------
  function janelaNoite(ctx, x, y, w, h, semente) {
    r(ctx, x - 1, y - 1, w + 2, h + 2, '#4a3d7a');
    for (let j = 0; j < h; j++) r(ctx, x, y + j, w, 1, j < h / 2 ? '#0e1230' : '#1a2050');
    let s = semente;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let px = x;
    while (px < x + w - 1) { // prédios ao fundo, com janelinhas acesas
      const bw = 3 + Math.floor(rnd() * 4), bh = 3 + Math.floor(rnd() * 6);
      const largura = Math.min(bw, x + w - px);
      r(ctx, px, y + h - bh, largura, bh, '#090c22');
      for (let k = 0; k < 3; k++) if (rnd() > 0.45) r(ctx, px + Math.floor(rnd() * Math.max(1, largura - 1)), y + h - bh + 1 + Math.floor(rnd() * Math.max(1, bh - 2)), 1, 1, '#ffd86b');
      px += largura + 1;
    }
    r(ctx, x + w - 6, y + 2, 3, 3, '#f4f0d0'); // lua
    r(ctx, x + Math.floor(w / 2), y, 1, h, '#4a3d7a'); // divisória
  }

  function paredeEMoveis(ctx) {
    r(ctx, 0, 0, W, PAREDE, '#1d1730');
    for (let y = 0; y < PAREDE - 2; y += 6) {
      r(ctx, 0, y, W, 1, '#271f3f');
      for (let x = (y / 6) % 2 ? 6 : 0; x < W; x += 12) r(ctx, x, y, 1, 6, '#271f3f');
    }
    r(ctx, 0, PAREDE - 2, W, 2, '#7c4dff'); // rodapé violeta
    r(ctx, 0, PAREDE, W, 1, '#3c2a86');

    // quadro branco
    r(ctx, 12, 6, 36, 17, '#8b8aa8'); r(ctx, 13, 7, 34, 15, '#dcd8ee');
    r(ctx, 16, 10, 16, 2, '#b04a6a'); r(ctx, 16, 14, 22, 2, '#6b5fb5'); r(ctx, 16, 18, 10, 2, '#9a96b8'); r(ctx, 38, 9, 7, 10, '#b8b3d4');
    // estante de livros
    r(ctx, 58, 4, 34, 24, '#3a2c56');
    const livros = ['#d14a6e', '#f0a030', '#4aa8e0', '#6bd17a', '#9b6cff', '#e8e0a0'];
    for (const [i, y] of [[0, 6], [1, 17]]) {
      r(ctx, 60, y + 9, 30, 1, '#5a4685');
      for (let k = 0; k < 10; k++) r(ctx, 61 + k * 3, y + 1 + ((k + i) % 3), 2, 8 - ((k + i) % 3), livros[(k * 2 + i * 3) % livros.length]);
    }
    // relógio
    r(ctx, 104, 8, 10, 10, '#e9e4f7'); r(ctx, 108, 10, 1, 5, '#1d1730'); r(ctx, 108, 14, 4, 1, '#1d1730');
    // pôster de um mapa (rio entre as margens) e um troféu dourado
    r(ctx, 128, 6, 22, 18, '#8b8aa8'); r(ctx, 129, 7, 20, 16, '#2f5d3a'); r(ctx, 129, 7, 20, 3, '#3d7a4a');
    for (let k = 0; k < 14; k++) r(ctx, 130 + Math.floor(k * 1.2), 8 + k, 4, 1, '#4aa8e0');
    r(ctx, 141, 13, 3, 3, '#ffd86b');
    r(ctx, 160, 10, 10, 8, '#e8b82e'); r(ctx, 158, 11, 2, 4, '#e8b82e'); r(ctx, 170, 11, 2, 4, '#e8b82e'); r(ctx, 162, 11, 2, 5, '#fff0a0');
    r(ctx, 163, 18, 4, 3, '#c98a22'); r(ctx, 160, 21, 10, 3, '#7a5a1a');
    // café: bancada com cafeteira, copos e geladeira
    r(ctx, 188, 14, 30, 17, '#3b3057'); r(ctx, 188, 14, 30, 3, '#52447a');
    r(ctx, 192, 6, 10, 10, '#1a1530'); r(ctx, 194, 9, 3, 2, '#ffb13b'); r(ctx, 198, 8, 3, 4, '#4ade80');
    r(ctx, 206, 11, 3, 3, '#e8e0f0'); r(ctx, 210, 11, 3, 3, '#e8506a');
    r(ctx, 220, 4, 11, 27, '#d9d6e8'); r(ctx, 220, 15, 11, 1, '#8d88a8'); r(ctx, 222, 8, 1, 4, '#8d88a8'); r(ctx, 222, 19, 1, 5, '#8d88a8');
    // janelas com a cidade à noite
    janelaNoite(ctx, 242, 7, 30, 15, 11);
    janelaNoite(ctx, 284, 7, 30, 15, 23);
  }

  function piso(ctx) {
    // estações: tijolos escuros
    r(ctx, 0, PAREDE, 184, H - PAREDE, '#241d39');
    for (let y = PAREDE + 1; y < H; y += 8) {
      r(ctx, 0, y, 184, 1, '#2c2447');
      for (let x = ((y - PAREDE) / 8) % 2 ? 8 : 0; x < 184; x += 16) r(ctx, x, y, 1, 8, '#2c2447');
    }
    // café: xadrez
    for (let y = PAREDE; y < H; y += 8) for (let x = 186; x < 230; x += 8) r(ctx, x, y, 8, 8, ((x - 186) / 8 + (y - PAREDE) / 8) % 2 ? '#241c3b' : '#1c1630');
    // sala de estar: carpete com borda
    r(ctx, 232, PAREDE, W - 232, H - PAREDE, '#2e2250');
    r(ctx, 236, 34, 112, 98, '#3a2a63'); r(ctx, 236, 34, 112, 1, '#4b3585'); r(ctx, 236, 131, 112, 1, '#4b3585'); r(ctx, 236, 34, 1, 98, '#4b3585'); r(ctx, 347, 34, 1, 98, '#4b3585');
    // divisórias entre as zonas
    for (const x of [183, 230]) { // com passagens nos corredores (meio e de baixo)
      for (const [y0, y1] of [[PAREDE + 1, 66], [86, 120]]) { r(ctx, x, y0, 3, y1 - y0, '#14101f'); r(ctx, x + 3, y0, 1, y1 - y0, '#2b2347'); }
    }
    r(ctx, 200, H - 4, 16, 4, '#14101f'); r(ctx, 201, H - 3, 14, 3, '#3b2f66'); // porta, por onde entra quem é chamado
  }

  function moveisFixos(ctx) {
    for (const x of [196, 220]) { // mesinhas do café (quem senta fica de frente para nós, com a mesa à frente)
      r(ctx, x - 6, 104, 12, 7, '#4a3d66'); r(ctx, x - 6, 110, 12, 1, '#33294d'); r(ctx, x - 1, 111, 2, 3, '#33294d');
      r(ctx, x - 1, 101, 3, 3, '#e8e0f0');
    }
    // cogumelo no canto do carpete (easter egg: "Não pise.")
    // chapéu verde com bolinhas roxas e caule creme
    r(ctx, 337, 119, 7, 1, '#5fcf5a'); r(ctx, 335, 120, 11, 1, '#4cb84a'); r(ctx, 334, 121, 13, 3, '#4cb84a'); r(ctx, 335, 124, 11, 1, '#38933a');
    r(ctx, 336, 120, 3, 1, '#7fe07a'); // brilho
    r(ctx, 336, 121, 2, 2, '#9b59d6'); r(ctx, 341, 120, 2, 1, '#9b59d6'); r(ctx, 342, 122, 2, 2, '#9b59d6'); r(ctx, 339, 123, 1, 1, '#9b59d6'); r(ctx, 345, 121, 1, 1, '#9b59d6');
    r(ctx, 338, 125, 5, 5, '#f4ead6'); r(ctx, 342, 125, 1, 5, '#d9ccb3'); r(ctx, 337, 130, 7, 1, '#f4ead6'); r(ctx, 343, 130, 1, 1, '#d9ccb3');
    // sofá grande
    r(ctx, 238, 36, 108, 6, '#5b3f9a'); r(ctx, 240, 42, 104, 16, '#7d58cf');
    r(ctx, 274, 42, 1, 16, '#5b3f9a'); r(ctx, 309, 42, 1, 16, '#5b3f9a');
    r(ctx, 236, 36, 5, 24, '#4d3490'); r(ctx, 343, 36, 5, 24, '#4d3490'); r(ctx, 240, 58, 104, 3, '#4d3490');
    // poltronas
    for (const cx of [257, 292, 327]) {
      r(ctx, cx - 14, 90, 28, 8, '#a13a68'); r(ctx, cx - 12, 98, 24, 16, '#c85a86');
      r(ctx, cx - 14, 92, 4, 22, '#8f3558'); r(ctx, cx + 10, 92, 4, 22, '#8f3558'); r(ctx, cx - 12, 114, 24, 3, '#8f3558');
    }
  }

  let cacheFundo = null;
  function fundo() {
    if (cacheFundo) return cacheFundo;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    piso(ctx); paredeEMoveis(ctx); moveisFixos(ctx);
    cacheFundo = c;
    return c;
  }

  // ---------- personagens ----------
  // Cabelo, acessório e cabeça vistos de frente. y0 = topo da cabeça; cx = centro.
  function cabecaFrente(ctx, ap, cx, y0, piscando) {
    const pele = P.peles[ap.pele], cabelo = P.cabelos[ap.cabelo];
    r(ctx, cx - 3, y0, 6, 1, pele); r(ctx, cx - 4, y0 + 1, 8, 6, pele); r(ctx, cx - 3, y0 + 7, 6, 1, pele);
    if (ap.estilo === 1) { r(ctx, cx - 5, y0 + 1, 1, 10, cabelo); r(ctx, cx + 4, y0 + 1, 1, 10, cabelo); }
    if (ap.estilo === 2) { r(ctx, cx - 3, y0 - 2, 1, 2, cabelo); r(ctx, cx - 1, y0 - 3, 1, 3, cabelo); r(ctx, cx + 1, y0 - 2, 1, 2, cabelo); r(ctx, cx + 3, y0 - 1, 1, 1, cabelo); }
    r(ctx, cx - 4, y0, 8, 3, cabelo); r(ctx, cx - 3, y0 - 1, 6, 1, cabelo);
    r(ctx, cx - 4, y0 + 3, 1, 2, cabelo); r(ctx, cx + 3, y0 + 3, 1, 2, cabelo);
    if (ap.acessorio === 1) r(ctx, cx - 4, y0 + 2, 8, 1, '#d14a6e');
    if (ap.acessorio === 2) { r(ctx, cx - 4, y0 - 1, 8, 4, '#e8a838'); r(ctx, cx - 5, y0 + 3, 10, 1, '#c98a22'); r(ctx, cx - 1, y0 - 3, 2, 2, '#fff3d6'); }
    if (piscando) { r(ctx, cx - 2, y0 + 5, 1, 1, '#1d1730'); r(ctx, cx + 1, y0 + 5, 1, 1, '#1d1730'); }
    else { r(ctx, cx - 2, y0 + 4, 1, 2, '#1d1730'); r(ctx, cx + 1, y0 + 4, 1, 2, '#1d1730'); }
    if (ap.acessorio === 3) { r(ctx, cx - 3, y0 + 3, 3, 1, '#2a2438'); r(ctx, cx, y0 + 3, 3, 1, '#2a2438'); r(ctx, cx - 3, y0 + 6, 3, 1, '#2a2438'); r(ctx, cx, y0 + 6, 3, 1, '#2a2438'); }
    r(ctx, cx - 1, y0 + 6, 2, 1, '#b5655a');
  }

  // Cabeça vista de costas (cabelo cobre tudo): para quem anda para cima.
  function cabecaCostas(ctx, ap, cx, y0) {
    const pele = P.peles[ap.pele], cabelo = P.cabelos[ap.cabelo];
    if (ap.estilo === 1) r(ctx, cx - 5, y0 + 2, 10, 9, cabelo);
    r(ctx, cx - 4, y0 + 1, 8, 7, cabelo); r(ctx, cx - 3, y0, 6, 1, cabelo); r(ctx, cx - 3, y0 + 8, 6, 1, cabelo);
    if (ap.estilo === 2) { r(ctx, cx - 3, y0 - 2, 1, 2, cabelo); r(ctx, cx - 1, y0 - 3, 1, 3, cabelo); r(ctx, cx + 1, y0 - 2, 1, 2, cabelo); r(ctx, cx + 3, y0 - 1, 1, 1, cabelo); }
    r(ctx, cx - 5, y0 + 3, 1, 3, pele); r(ctx, cx + 4, y0 + 3, 1, 3, pele);
    if (ap.acessorio === 1) r(ctx, cx - 4, y0 + 3, 8, 1, '#d14a6e');
    if (ap.acessorio === 2) { r(ctx, cx - 4, y0, 8, 4, '#e8a838'); r(ctx, cx - 1, y0 - 2, 2, 2, '#fff3d6'); }
  }

  // Pessoa em pé ou sentada (café, sala de estar e quem anda). y0 = topo da cabeça; ocupa 20 px em pé, 15 sentada.
  // o = { sentado, costas, perna (0 ou 1 enquanto anda; ausente = parado), caneca, piscando }
  function pessoa(ctx, ap, cx, y0, o) {
    cx = Math.round(cx); y0 = Math.round(y0);
    const pele = P.peles[ap.pele], camisa = P.camisas[ap.camisa];
    if (!o.sentado) {
      const alto = [5, 5];
      if (o.perna === 0) alto[1] = 3; else if (o.perna === 1) alto[0] = 3; // a perna levantada fica mais curta
      r(ctx, cx - 4, y0 + 15, 3, alto[0], '#2b2a4a'); r(ctx, cx + 1, y0 + 15, 3, alto[1], '#2b2a4a');
      r(ctx, cx - 4, y0 + 14 + alto[0], 3, 1, '#14101f'); r(ctx, cx + 1, y0 + 14 + alto[1], 3, 1, '#14101f');
    }
    r(ctx, cx - 5, y0 + 8, 10, 7, camisa); r(ctx, cx - 5, y0 + 14, 10, 1, escurecer(camisa, 0.75));
    const braco = o.perna === undefined ? [0, 0] : (o.perna === 0 ? [1, -1] : [-1, 1]); // braços balançam ao andar
    r(ctx, cx - 7, y0 + 9 + braco[0], 2, 6, camisa); r(ctx, cx + 5, y0 + 9 + braco[1], 2, 6, camisa);
    r(ctx, cx - 7, y0 + 15 + braco[0], 2, 2, pele); r(ctx, cx + 5, y0 + 15 + braco[1], 2, 2, pele);
    if (o.caneca) { r(ctx, cx + 7, y0 + 13, 3, 3, '#f4f0ff'); r(ctx, cx + 10, y0 + 14, 1, 1, '#f4f0ff'); }
    if (o.costas) cabecaCostas(ctx, ap, cx, y0); else cabecaFrente(ctx, ap, cx, y0, o.piscando);
  }

  // Sentado de costas, olhando a mesa. top = topo da célula da mesa.
  function pessoaCostas(ctx, ap, cx, top, digitando) {
    const pele = P.peles[ap.pele], cabelo = P.cabelos[ap.cabelo], camisa = P.camisas[ap.camisa];
    r(ctx, cx - 9, top + 27, 18, 9, '#2e2650'); // encosto da cadeira
    r(ctx, cx - 6, top + 26, 12, 9, camisa); r(ctx, cx - 7, top + 27, 1, 6, camisa); r(ctx, cx + 6, top + 27, 1, 6, camisa);
    r(ctx, cx - 6, top + 34, 12, 1, escurecer(camisa, 0.75));
    r(ctx, cx - 2, top + 25, 4, 1, pele);
    if (ap.estilo === 1) r(ctx, cx - 5, top + 22, 10, 9, cabelo);
    r(ctx, cx - 4, top + 17, 8, 8, cabelo);
    if (ap.estilo === 2) { r(ctx, cx - 3, top + 15, 1, 2, cabelo); r(ctx, cx, top + 14, 1, 3, cabelo); r(ctx, cx + 2, top + 15, 1, 2, cabelo); }
    r(ctx, cx - 5, top + 20, 1, 3, pele); r(ctx, cx + 4, top + 20, 1, 3, pele);
    if (ap.acessorio === 1) r(ctx, cx - 4, top + 20, 8, 1, '#d14a6e');
    if (ap.acessorio === 2) { r(ctx, cx - 4, top + 16, 8, 4, '#e8a838'); r(ctx, cx - 1, top + 14, 2, 2, '#fff3d6'); }
    r(ctx, cx - 5, top + 22 + (digitando ? 1 : 0), 2, 2, pele); r(ctx, cx + 3, top + 22 + (digitando ? 0 : 1), 2, 2, pele); // mãos no teclado
  }

  // ---------- mesas ----------
  const LINHAS_CODIGO = [[6, 3, 8, 5, 7], [4, 8, 3, 7, 4], [7, 5, 6, 3, 8], [5, 7, 4, 8, 3]];
  function mesa(ctx, cx, top, ocupada, trabalhando, quadroTela) {
    r(ctx, cx - 21, top + 8, 3, 10, ocupada ? '#8b5cf6' : '#4b3a8a'); r(ctx, cx + 18, top + 8, 3, 10, ocupada ? '#8b5cf6' : '#4b3a8a'); // luminárias
    r(ctx, cx - 10, top + 1, 20, 11, '#171229'); // monitor
    r(ctx, cx - 9, top + 2, 18, 8, trabalhando ? '#4a35c4' : (ocupada ? '#352a70' : '#1d1736'));
    if (trabalhando) for (let k = 0; k < 4; k++) r(ctx, cx - 7, top + 3 + k * 2, LINHAS_CODIGO[quadroTela % 4][k], 1, k % 2 ? '#ffd86b' : '#d4c4ff');
    r(ctx, cx - 2, top + 12, 4, 2, '#171229');
    r(ctx, cx - 17, top + 12, 34, 12, '#4a3d66'); r(ctx, cx - 17, top + 24, 34, 2, '#33294d'); // tampo
    r(ctx, cx - 7, top + 17, 14, 3, '#2b2548'); r(ctx, cx + 11, top + 16, 3, 4, '#e8e0f0'); // teclado e caneca
    if (!ocupada) r(ctx, cx - 9, top + 30, 18, 8, '#2e2650'); // cadeira vazia
  }

  function losango(ctx, cx, cy, cor, oco) {
    const larg = [1, 3, 5, 7, 5, 3, 1];
    larg.forEach((w, i) => {
      if (!oco) r(ctx, cx - (w - 1) / 2, cy - 3 + i, w, 1, cor);
      else { r(ctx, cx - (w - 1) / 2, cy - 3 + i, 1, 1, cor); if (w > 1) r(ctx, cx + (w - 1) / 2, cy - 3 + i, 1, 1, cor); if (i === 0 || i === 6) r(ctx, cx, cy - 3 + i, 1, 1, cor); }
    });
  }

  // Quem está andando: pernas alternam a cada 4 px andados; de costas ao subir.
  function andando(ctx, ap, v) {
    pessoa(ctx, ap, v.x, v.y, { costas: v.dir === 'n', perna: Math.floor(v.passo / 4) % 2 });
  }

  // Marcadores sobre a cabeça: losango do estado e "!" de quem acabou de ser chamado e corre.
  const INTERROGACAO = ['01110', '10001', '00001', '00110', '00100', '00000', '00100'];
  function marcadores(ctx, x, y, cor, correndo, balanco, esperando) {
    losango(ctx, Math.round(x), Math.round(y) - 6 + balanco, P.losango[cor], cor === 'cinza');
    if (esperando) INTERROGACAO.forEach((linha, j) => { for (let k = 0; k < 5; k++) if (linha[k] === '1') r(ctx, Math.round(x) + 5 + k, Math.round(y) - 14 + balanco + j, 1, 1, '#fbbf24'); }); // "?": possivelmente esperando você
    if (correndo) { r(ctx, Math.round(x), Math.round(y) - 18, 2, 5, '#ff6b6b'); r(ctx, Math.round(x), Math.round(y) - 12, 2, 2, '#ff6b6b'); }
  }

  // Bichinho de enfeite na parede (easter egg): pula e solta um coração quando é feito carinho.
  function mascote(ctx, pulo, coracao) {
    const x = 93, y = 18 - pulo; // 12 x 12: bolinha verde-menta peluda, orelhas redondas, olhos escuros e língua rosa para fora
    const corpo = '#a8e6cf', claro = '#d9f7ea', sombra = '#7ccbb0', orelha = '#f4a6c0', escuro = '#1a2540', lingua = '#e8607f';
    r(ctx, x + 1, y + 3, 10, 7, corpo); r(ctx, x + 2, y + 2, 8, 1, corpo); r(ctx, x + 2, y + 10, 8, 1, sombra);
    r(ctx, x, y + 5, 1, 3, corpo); r(ctx, x + 11, y + 5, 1, 3, claro); r(ctx, x + 3, y + 3, 4, 1, claro); // pelo nas laterais
    r(ctx, x + 1, y, 3, 3, corpo); r(ctx, x + 8, y, 3, 3, corpo); r(ctx, x + 2, y + 1, 1, 2, orelha); r(ctx, x + 9, y + 1, 1, 2, orelha); // orelhas
    r(ctx, x + 3, y + 5, 2, 2, escuro); r(ctx, x + 7, y + 5, 2, 2, escuro); r(ctx, x + 3, y + 5, 1, 1, '#fff'); r(ctx, x + 7, y + 5, 1, 1, '#fff');
    r(ctx, x + 6, y + 8, 4, 1, '#3a2a4a'); r(ctx, x, y + 8, 7, 2, lingua); r(ctx, x, y + 8, 7, 1, '#f58aa3'); // boca e língua
    r(ctx, x + 2, y + 11, 2, 1, '#5b8f7e'); r(ctx, x + 8, y + 11, 2, 1, '#5b8f7e'); // patinhas
    if (coracao) {
      const hx = x + 3, hy = y - 7, c = '#ff6b8a';
      r(ctx, hx + 1, hy, 2, 1, c); r(ctx, hx + 4, hy, 2, 1, c); r(ctx, hx, hy + 1, 7, 1, c); r(ctx, hx + 1, hy + 2, 5, 1, c); r(ctx, hx + 2, hy + 3, 3, 1, c); r(ctx, hx + 3, hy + 4, 1, 1, c);
    }
  }

  // Arcos de trajeto: pontilhado azul da sessão principal até cada execução dela (opcional, botão "Mostrar trajeto").
  function arcos(ctx, sala, vistas) {
    const pos = (i) => {
      const v = vistas.get(i.chave);
      if (v && v.modo !== 'parado') return { x: v.x, y: v.y + 2 };
      return { x: i.vaga.x, y: i.vaga.y + (i.zona === 'mesa' ? 8 : 2) };
    };
    for (const [pai, filho] of Salas.arcosDe(sala)) {
      const a = pos(pai), b = pos(filho);
      const subida = Math.hypot(b.x - a.x, b.y - a.y) * 0.3 + 6;
      const cx = (a.x + b.x) / 2, cy = Math.max(2, Math.min(a.y, b.y) - subida);
      const n = 36;
      for (let k = 0; k <= n; k += 2) {
        const t = k / n, u = 1 - t;
        r(ctx, u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y, 1, 1, '#60a5fa');
      }
      r(ctx, b.x - 1, b.y - 1, 3, 3, '#60a5fa'); r(ctx, a.x - 1, a.y - 1, 3, 3, '#a78bfa');
    }
  }

  // Parte pixelada da sala: mesas, personagens e losangos.
  // an = { quadroTela, quadroDig, balanco, piscando(chave), vistas: Map chave -> posição de quem anda, saindo: [] }.
  function quadro(ctx, sala, an) {
    const vistas = an.vistas || new Map();
    const sentadoNaMesa = (i) => i.zona === 'mesa' && (!vistas.get(i.chave) || vistas.get(i.chave).modo === 'parado');
    const porVaga = new Map(sala.itens.filter(sentadoNaMesa).map((i) => [i.vaga, i]));
    for (const v of MESAS) {
      const item = porVaga.get(v);
      const trabalha = !!item && (item.estado === 'trabalhando' || item.estado === 'delegando');
      mesa(ctx, v.x, v.y, !!item, trabalha, an.quadroTela);
      if (item) pessoaCostas(ctx, item.aparencia, v.x, v.y, trabalha && an.quadroDig);
    }
    const fora = [];
    for (const i of sala.itens) {
      if (sentadoNaMesa(i)) continue;
      const v = vistas.get(i.chave);
      if (v && v.modo !== 'parado') fora.push({ y: v.y, desenho: () => andando(ctx, i.aparencia, v) });
      else fora.push({ y: i.vaga.y, desenho: () => pessoa(ctx, i.aparencia, i.vaga.x, i.vaga.y, { sentado: i.sentado, piscando: an.piscando(i.chave), caneca: i.zona === 'cafe' && !i.sentado }) });
    }
    for (const v of an.saindo || []) fora.push({ y: v.y, desenho: () => (v.modo === 'parado' ? pessoa(ctx, v.aparencia, v.x, v.y, { sentado: v.sentado, caneca: v.zona === 'cafe' && !v.sentado }) : andando(ctx, v.aparencia, v)) });
    fora.sort((a, b) => a.y - b.y);
    for (const p of fora) p.desenho();
    for (const i of sala.itens) {
      const v = vistas.get(i.chave);
      const mexendo = v && v.modo !== 'parado';
      const x = mexendo ? v.x : i.vaga.x;
      const y = mexendo ? v.y : (i.zona === 'mesa' ? i.vaga.y + 14 : i.vaga.y); // sobre a cabeça (na mesa, acima do monitor)
      const ativo = i.estado === 'trabalhando' || i.estado === 'delegando';
      marcadores(ctx, x, mexendo || i.zona !== 'mesa' ? y : i.vaga.y + 3, i.losango, !!v && v.modo === 'correndo', ativo && !mexendo ? an.balanco : 0, !!i.esperando);
    }
    for (const v of an.saindo || []) marcadores(ctx, v.x, v.y, v.losango || 'cinza', false, 0);
    if (an.trajeto) arcos(ctx, sala, vistas);
    mascote(ctx, an.mascotePulo || 0, !!an.coracao);
  }

  // ---------- textos e realces (vetor, na resolução real) ----------
  function pilula(ctx, x, y, w, h, borda, tracejada) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = P.fundoEtiqueta; ctx.fill();
    ctx.setLineDash(tracejada ? [3, 2] : []);
    ctx.strokeStyle = borda; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.setLineDash([]);
  }

  // Etiqueta de nome (e o tempo embaixo) centrada em (cx, yTag), em pixels da tela.
  function etiqueta(ctx, s, fs, i, cx, yTag, tempo, tracejada, cor) {
    ctx.font = '600 ' + fs + 'px ' + FONTE;
    const max = 42 * s - fs * 1.8;
    const t = Array.from(i.rotulo);
    let nome = t.join('');
    while (t.length > 1 && ctx.measureText(nome).width > max) { t.pop(); nome = t.join('') + '…'; }
    const larg = ctx.measureText(nome).width + fs * 1.9, alt = fs + 5;
    const x0 = cx - larg / 2, y0 = yTag - alt / 2;
    pilula(ctx, x0, y0, larg, alt, cor, tracejada);
    if (i.tipo === 'sessao') { // estrelinha: é a sessão principal
      ctx.fillStyle = P.roxoClaro; ctx.beginPath();
      const sx = x0 + fs * 0.75, sy = y0 + alt / 2, a = fs * 0.4;
      ctx.moveTo(sx, sy - a); ctx.lineTo(sx + a * 0.3, sy - a * 0.3); ctx.lineTo(sx + a, sy); ctx.lineTo(sx + a * 0.3, sy + a * 0.3);
      ctx.lineTo(sx, sy + a); ctx.lineTo(sx - a * 0.3, sy + a * 0.3); ctx.lineTo(sx - a, sy); ctx.lineTo(sx - a * 0.3, sy - a * 0.3); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = P.roxoClaro; ctx.fillRect(x0 + fs * 0.45, y0 + alt / 2 - fs * 0.28, fs * 0.55, fs * 0.55);
    }
    ctx.fillStyle = '#f1eeff'; ctx.textAlign = 'left';
    ctx.fillText(nome, x0 + fs * 1.25, y0 + alt / 2 + 0.5);
    if (tempo) {
      ctx.font = '400 ' + (fs - 1) + 'px ' + FONTE; ctx.fillStyle = P.suave; ctx.textAlign = 'center';
      ctx.fillText(tempo, cx, y0 + alt + fs * 0.7);
    }
  }

  // Balão de fala amarelo acima da cabeça (frases de easter egg), centrado em cx e com a base em yBase (pixels da tela).
  function balao(ctx, fs, fala, cx, yBase, larguraTela) {
    const texto = fala.texto, autor = fala.autor ? '— ' + fala.autor : '';
    ctx.font = '700 ' + (fs + 1) + 'px ' + FONTE;
    let larg = ctx.measureText(texto).width + fs * 1.6;
    ctx.font = '600 ' + (fs - 1) + 'px ' + FONTE;
    if (autor) larg = Math.max(larg, ctx.measureText(autor).width + fs * 1.6);
    larg = Math.min(larg, larguraTela - 4); // frase muito longa: o texto é encolhido pelo maxWidth do fillText
    const alt = fs + 8 + (autor ? fs : 0);
    const x0 = Math.max(2, Math.min(cx - larg / 2, larguraTela - larg - 2)), y0 = yBase - alt;
    ctx.beginPath(); ctx.roundRect(x0, y0, larg, alt, 6); ctx.fillStyle = '#fde68a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 3, yBase); ctx.lineTo(cx + 3, yBase); ctx.lineTo(cx, yBase + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1d1730'; ctx.textAlign = 'center';
    ctx.font = '700 ' + (fs + 1) + 'px ' + FONTE;
    ctx.fillText(texto, x0 + larg / 2, y0 + (autor ? (fs + 8) / 2 : alt / 2) + 0.5, larg - 6);
    if (autor) { ctx.font = '600 ' + (fs - 1) + 'px ' + FONTE; ctx.fillStyle = '#5b4b8a'; ctx.fillText(autor, x0 + larg / 2, y0 + fs + 8 + fs / 2 - 3, larg - 6); }
  }

  // `s` = pixels da tela por pixel lógico; o contexto já está em unidades de pixel CSS. falas: Map chave -> texto (opcional).
  function sobreposicao(ctx, sala, s, hoverChave, vistas, saindo, falas) {
    const fs = Math.max(9, Math.round(3.3 * s));
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.max(8, Math.round(2.7 * s)) + 'px ' + FONTE; // nomes das zonas
    ctx.fillStyle = P.zona; ctx.textAlign = 'left';
    for (const [t, x] of [['ESTAÇÕES DE TRABALHO', 10], ['CAFÉ', 190], ['SALA DE ESTAR', 242]]) ctx.fillText(t, x * s, (H - 4) * s);
    for (const i of sala.itens) {
      const v = vistas && vistas.get(i.chave);
      const mexendo = v && v.modo !== 'parado';
      const cx = (mexendo ? v.x : i.vaga.x) * s;
      const degrau = !mexendo && i.zona === 'cafe' && i.vaga.x > CAFE_X_VIZINHO ? 10 : 0; // vizinho do café: etiqueta mais abaixo
      const yTag = mexendo ? (v.y + 25) * s : (i.zona === 'mesa' ? i.vaga.y + 43 : i.vaga.y + (i.sentado ? 22 : 25) + degrau) * s;
      etiqueta(ctx, s, fs, i, cx, yTag, i.esperando ? 'esperando você?' : i.tempo, i.estado === 'concluido', P.losango[i.losango]);
      if (hoverChave === i.chave) { // realce da área do item
        ctx.strokeStyle = P.roxoClaro; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(i.area.x * s, i.area.y * s, i.area.w * s, i.area.h * s, 6); ctx.stroke();
      }
    }
    for (const v of saindo || []) etiqueta(ctx, s, fs, v, v.x * s, (v.y + (v.modo === 'parado' && v.sentado ? 22 : 25) + (v.modo === 'parado' && v.zona === 'cafe' && v.x > CAFE_X_VIZINHO ? 10 : 0)) * s, v.res && v.modo === 'parado' ? 'à espera' : '', true, P.losango.cinza);
    if (falas) {
      for (const i of sala.itens) {
        const f = falas.get(i.chave);
        if (!f) continue;
        const v = vistas && vistas.get(i.chave), mexendo = v && v.modo !== 'parado';
        const cx = (mexendo ? v.x : i.vaga.x) * s, topo = mexendo ? v.y : (i.zona === 'mesa' ? i.vaga.y + 3 : i.vaga.y);
        balao(ctx, fs, f, cx, (topo - 14) * s, W * s);
      }
    }
  }

  const Arte = { P, fundo, quadro, sobreposicao };
  if (typeof module !== 'undefined' && module.exports) module.exports = Arte;
  else raiz.Arte = Arte;
})(typeof window !== 'undefined' ? window : globalThis);
