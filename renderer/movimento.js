// Movimento das pessoas entre os lugares da sala: quem muda de lugar (conclui, passa a aguardar, é chamado) anda até lá
// pelos corredores; quem é chamado corre. Só lógica (posições em pixels lógicos da sala), sem canvas nem DOM.
// Posição = (x do centro, y do topo da cabeça), a mesma convenção das vagas em salas.js.
(function (raiz) {
  const Salas = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./salas.js') : raiz.Salas;
  // Corredores (y do topo da cabeça): o do meio, entre as duas fileiras de mesas, e o de baixo. Passagens verticais:
  // junto às mesas (LANE_ESTACOES) e no café (LANE_CAFE). A porta fica abaixo da sala, no café.
  const HUB_MEIO = 58;
  const HUB_BAIXO = 108;
  const LANE_ESTACOES = 178;
  const LANE_CAFE = 208;
  const PORTA = { x: 208, y: 142 };
  const FIM_ESTACOES = 184;
  const ASSENTO_MESA = 17; // a cabeça de quem está sentado à mesa fica 17 px abaixo do topo da célula
  const VEL = { anda: 28, corre: 70 }; // pixels lógicos por segundo
  const DT_MAX = 0.25; // depois de uma pausa (janela escondida) ninguém "teleporta"
  const ESPACO_NA_PORTA = 16;
  const FILA_BAIXO = 86; // topo da célula das mesas da fileira de baixo

  // Quem terminou e já saiu dos dados continua na sala, "à toa": passeia entre o café, a sala de estar e os corredores.
  const MAX_OCIOSOS = 6; // por sala; passando disso o mais antigo vai embora pela porta
  const chaveSpot = (s) => s.zona + '|' + s.x + ',' + s.y;
  const SPOTS = [];
  for (const v of Salas.CAFE) SPOTS.push({ x: v.x, y: v.y, zona: 'cafe', sentado: !!v.sentado });
  for (const v of Salas.CAFE) if (!v.sentado) SPOTS.push({ x: v.x, y: v.y, zona: 'cafe', sentado: false }); // junto à cafeteira: mais visitado
  for (const v of Salas.ESTAR) SPOTS.push({ x: v.x, y: v.y, zona: 'estar', sentado: true });
  for (const x of [45, 90, 135]) SPOTS.push({ x, y: HUB_MEIO, zona: 'livre', sentado: false });

  const maisPerto = (y) => (Math.abs(y - HUB_MEIO) <= Math.abs(y - HUB_BAIXO) ? HUB_MEIO : HUB_BAIXO);

  // Ponta de uma rota: { x, y, zona } com zona 'mesa' | 'cafe' | 'estar' | 'porta' | 'livre'; mesa traz `baixo` (fileira de baixo).
  function ponte(p) {
    let hub;
    if (p.zona === 'mesa') hub = p.baixo ? HUB_BAIXO : HUB_MEIO;
    else if (p.zona === 'porta') hub = HUB_BAIXO;
    else if (p.zona === 'livre') hub = maisPerto(p.y);
    else hub = HUB_MEIO;
    return { hub, ponto: { x: p.x, y: hub } };
  }

  // Caminho de `de` até `para`: sempre trechos retos (horizontais e verticais) pelos corredores.
  function rota(de, para) {
    const a = ponte(de), b = ponte(para);
    const pts = [{ x: de.x, y: de.y }, a.ponto];
    if (a.hub !== b.hub) {
      const lane = de.x < FIM_ESTACOES || para.x < FIM_ESTACOES ? LANE_ESTACOES : LANE_CAFE;
      pts.push({ x: lane, y: a.hub }, { x: lane, y: b.hub });
    }
    pts.push(b.ponto, { x: para.x, y: para.y });
    return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6);
  }

  // Ponta do item: a vaga dele (na mesa, a cabeça fica ASSENTO_MESA abaixo do topo da célula).
  function pontaDoItem(it) {
    const v = it.vaga;
    if (it.zona === 'mesa') return { x: v.x, y: v.y + ASSENTO_MESA, zona: 'mesa', baixo: v.y === FILA_BAIXO };
    return { x: v.x, y: v.y, zona: it.zona };
  }
  const infoDe = (it) => ({ aparencia: it.aparencia, rotulo: it.rotulo, tipo: it.tipo, losango: it.losango });
  const chaveAlvo = (it) => it.zona + '|' + it.vaga.x + ',' + it.vaga.y;

  function criar({ rnd = Math.random } = {}) {
    let ordem = 0; // quem virou ocioso primeiro
    const nomesResidentes = new Set(); // 'projeto|nome' dos agentes do catálogo que moram na sala
    const ents = new Map(); // 'projeto|chave' -> estado de quem anda
    let ultimo = null;
    let reduzido = false; // prefers-reduced-motion: ninguém anda, cada um aparece direto no lugar

    function novo(it, instantaneo) {
      const alvo = pontaDoItem(it);
      const e = { projeto: null, chave: it.chave, alvo, alvoChave: chaveAlvo(it), zona: it.zona, sentado: !!it.sentado,
        x: alvo.x, y: alvo.y, rota: null, i: 0, modo: 'parado', passo: 0, dir: 's', saindo: false, info: infoDe(it) };
      if (!instantaneo) { // chamado agora: entra pela porta e corre até o lugar (para a mesa); senão só anda
        const naPorta = Array.from(ents.values()).filter((o) => o.modo !== 'parado' && Math.abs(o.x - PORTA.x) < 8 && o.y > PORTA.y - 12).length;
        e.x = PORTA.x; e.y = PORTA.y + ESPACO_NA_PORTA * naPorta; // quem chega junto entra em fila, não um em cima do outro
        iniciar(e, rota({ x: e.x, y: e.y, zona: 'porta' }, alvo), it.zona === 'mesa');
      }
      return e;
    }

    function iniciar(e, pts, correndo) {
      e.rota = pts; e.i = 1; e.modo = correndo ? 'correndo' : 'andando';
      if (pts.length < 2) { e.modo = 'parado'; e.rota = null; }
    }

    function redirecionar(e, it) {
      const alvo = pontaDoItem(it);
      const origem = e.modo === 'parado' ? { x: e.x, y: e.y, zona: e.zona === 'mesa' ? 'mesa' : e.zona, baixo: e.alvo.baixo } : { x: e.x, y: e.y, zona: 'livre' };
      const era = e.modo === 'parado';
      e.alvo = alvo; e.alvoChave = chaveAlvo(it); e.zona = it.zona; e.sentado = !!it.sentado;
      const pts = rota(origem, alvo);
      iniciar(e, pts, it.zona === 'mesa' && !(era && origem.zona === 'mesa')); // corre ao ser chamado para a mesa
    }

    // Sincroniza com os itens atuais de uma sala (chamar quando os dados mudam). `inicial` = primeira leitura do app:
    // todos aparecem já no lugar, sem entrar pela porta.
    function sincronizar(projeto, itens, inicial) {
      const vivos = new Set();
      for (const it of itens) {
        if (!it.vaga) continue;
        const k = projeto + '|' + it.chave;
        vivos.add(k);
        let e = ents.get(k);
        if (e) e.info = infoDe(it);
        const res = !e && !inicial && it.tipo === 'execucao' ? ents.get(projeto + '|res:' + it.rotulo) : null;
        if (res && !res.saindo) { // o agente que esperava na sala é quem foi chamado: corre de onde está até a mesa
          ents.delete(projeto + '|res:' + it.rotulo);
          res.chave = it.chave; res.ocioso = false; res.res = false; res.info = infoDe(it);
          ents.set(k, res);
          redirecionar(res, it);
        } else if (!e) { e = novo(it, !!inicial); e.projeto = projeto; ents.set(k, e); }
        else if (e.saindo) { e.saindo = false; redirecionar(e, it); }
        else if (e.alvoChave !== chaveAlvo(it)) redirecionar(e, it);
        else e.sentado = !!it.sentado;
      }
      // Quem está à toa num lugar que um item dos dados acabou de ganhar (ex.: concluiu e foi ao café) cede o lugar.
      const usados = new Set(itens.filter((it) => it.vaga).map(chaveAlvo));
      for (const o of Array.from(ents.values())) {
        if (o.projeto === projeto && o.ocioso && !o.saindo && o.modo === 'parado' && usados.has(o.alvoChave)) passear(o);
      }
      for (const [k, e] of Array.from(ents)) {
        if (e.projeto !== projeto || vivos.has(k) || e.saindo || e.ocioso) continue;
        if (e.zona === 'cafe') { // quem terminou (foi ao café) fica na sala à toa; os outros somem na hora
          e.ocioso = true; e.espera = 4 + rnd() * 8; e.ordem = ++ordem;
          const rk = projeto + '|res:' + e.info.rotulo;
          if (nomesResidentes.has(projeto + '|' + e.info.rotulo) && !ents.has(rk)) { ents.delete(k); e.chave = 'res:' + e.info.rotulo; e.res = true; ents.set(rk, e); } // volta a ser o residente
          const doProjeto = Array.from(ents.values()).filter((o) => o.projeto === projeto && o.ocioso && !o.res && !o.saindo).sort((a, b) => a.ordem - b.ordem);
          if (doProjeto.length > MAX_OCIOSOS) sair(doProjeto[0]);
        } else ents.delete(k);
      }
    }

    function origemDe(e) { return e.modo === 'parado' ? { x: e.x, y: e.y, zona: e.zona === 'mesa' ? 'mesa' : e.zona, baixo: e.alvo.baixo } : { x: e.x, y: e.y, zona: 'livre' }; }

    function sair(e) { // vai embora pela porta
      e.saindo = true;
      iniciar(e, rota(origemDe(e), { x: PORTA.x, y: PORTA.y, zona: 'porta' }), false);
    }

    // Um lugar livre da sala (fora os de quem já está lá e o atual de `e`), ou null.
    function lugarLivre(projeto, e) {
      const ocupados = new Set(Array.from(ents.values()).filter((o) => o !== e && o.projeto === projeto && !o.saindo).map((o) => o.alvoChave));
      const livres = SPOTS.filter((s) => !ocupados.has(chaveSpot(s)) && !(e && chaveSpot(s) === e.alvoChave));
      return livres.length ? livres[Math.floor(rnd() * livres.length) % livres.length] : null;
    }

    // Escolhe outro lugar livre da sala para quem está à toa.
    function passear(e) {
      const s = lugarLivre(e.projeto, e);
      if (!s) { e.espera = 5; return; }
      const origem = origemDe(e);
      e.alvo = { x: s.x, y: s.y, zona: s.zona }; e.alvoChave = chaveSpot(s); e.zona = s.zona; e.sentado = s.sentado;
      iniciar(e, rota(origem, e.alvo), false);
    }

    // Residentes: os agentes do catálogo esperam em todas as salas (sala de estar, café, corredores) até serem chamados.
    // lista = [{ rotulo, aparencia }]. Quem já está na sala (esperando, trabalhando ou no café) não ganha cópia.
    function residentes(projeto, lista, inicial) {
      for (const k of Array.from(nomesResidentes)) if (k.startsWith(projeto + '|')) nomesResidentes.delete(k);
      for (const r of lista) nomesResidentes.add(projeto + '|' + r.rotulo);
      for (const [k, e] of Array.from(ents)) if (e.res && e.projeto === projeto && !nomesResidentes.has(projeto + '|' + e.info.rotulo)) ents.delete(k); // saiu do catálogo
      for (const r of lista) {
        if (Array.from(ents.values()).some((o) => o.projeto === projeto && !o.saindo && o.info.rotulo === r.rotulo)) continue;
        const s = lugarLivre(projeto, null);
        if (!s) continue; // sem lugar agora: tenta de novo na próxima leitura
        const e = { projeto, chave: 'res:' + r.rotulo, alvo: { x: s.x, y: s.y, zona: s.zona }, alvoChave: chaveSpot(s), zona: s.zona, sentado: s.sentado,
          x: s.x, y: s.y, rota: null, i: 0, modo: 'parado', passo: 0, dir: 's', saindo: false, ocioso: true, res: true, espera: 3 + rnd() * 8, ordem: ++ordem,
          info: { aparencia: r.aparencia, rotulo: r.rotulo, tipo: 'execucao', losango: 'cinza' } };
        if (!inicial) { // chega pela porta
          const naPorta = Array.from(ents.values()).filter((o) => o.modo !== 'parado' && Math.abs(o.x - PORTA.x) < 8 && o.y > PORTA.y - 12).length;
          e.x = PORTA.x; e.y = PORTA.y + ESPACO_NA_PORTA * naPorta;
          iniciar(e, rota({ x: e.x, y: e.y, zona: 'porta' }, e.alvo), false);
        }
        ents.set(projeto + '|res:' + r.rotulo, e);
      }
    }

    // Avança o tempo (chamar uma vez por quadro).
    function avancar(agora) {
      const dt = ultimo === null ? 0 : Math.min(DT_MAX, Math.max(0, (agora - ultimo) / 1000));
      ultimo = agora;
      for (const [k, e] of Array.from(ents)) {
        if (e.modo === 'parado' && e.ocioso && !e.saindo && !reduzido) { e.espera -= dt; if (e.espera <= 0) passear(e); } // à toa: de tempos em tempos vai a outro lugar
        if (e.modo === 'parado') continue;
        let resta = reduzido ? Infinity : (e.modo === 'correndo' ? VEL.corre : VEL.anda) * dt; // movimento reduzido: chega na hora
        while (resta > 0 && e.rota) {
          const alvo = e.rota[e.i];
          const dx = alvo.x - e.x, dy = alvo.y - e.y, d = Math.hypot(dx, dy);
          if (d > 1e-9) e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy < 0 ? 'n' : 's');
          if (d > resta) { e.x += (dx / d) * resta; e.y += (dy / d) * resta; e.passo += resta; break; }
          e.x = alvo.x; e.y = alvo.y; resta -= d; e.passo += d;
          if (e.i === e.rota.length - 1) {
            e.modo = 'parado'; e.rota = null;
            if (e.saindo) ents.delete(k);
            else if (e.ocioso) e.espera = 6 + rnd() * 10;
            break;
          }
          e.i++;
        }
      }
    }

    function vista(e) {
      return { x: e.x, y: e.y, modo: e.modo, dir: e.dir, passo: e.passo, saindo: e.saindo, zona: e.zona, sentado: e.sentado };
    }
    // chave do item -> como desenhar (só quem está na sala).
    function vistas(projeto) {
      const m = new Map();
      for (const e of ents.values()) if (e.projeto === projeto && !e.saindo && !e.ocioso) m.set(e.chave, vista(e));
      return m;
    }
    // Quem está saindo pela porta (já não faz parte dos itens da sala).
    function saindo(projeto) {
      return Array.from(ents.values()).filter((e) => e.projeto === projeto && e.saindo).map((e) => Object.assign(vista(e), { chave: e.chave }, e.info));
    }
    // Quem terminou e passeia pela sala (já não é um item dos dados).
    function ociosos(projeto) {
      return Array.from(ents.values()).filter((e) => e.projeto === projeto && e.ocioso && !e.saindo).map((e) => Object.assign(vista(e), { chave: e.chave, res: !!e.res }, e.info));
    }
    function manter(projetos) { // esquece salas que sumiram
      const vivos = new Set(projetos);
      for (const [k, e] of Array.from(ents)) if (!vivos.has(e.projeto)) ents.delete(k);
      for (const k of Array.from(nomesResidentes)) if (!vivos.has(k.slice(0, k.indexOf('|')))) nomesResidentes.delete(k);
    }

    return { sincronizar, residentes, avancar, vistas, saindo, ociosos, manter, reduzir: (v) => { reduzido = !!v; } };
  }

  const Movimento = { criar, rota, MAX_OCIOSOS, HUB_MEIO, HUB_BAIXO, LANE_ESTACOES, LANE_CAFE, PORTA, VEL, ASSENTO_MESA };
  if (typeof module !== 'undefined' && module.exports) module.exports = Movimento;
  else raiz.Movimento = Movimento;
})(typeof window !== 'undefined' ? window : globalThis);
