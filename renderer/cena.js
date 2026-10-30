// Cena: uma sala por projeto (canvas em pixel art + botões invisíveis por cima para mouse, teclado e leitor de tela)
// e a faixa de skills. Só lê o estado; nunca grava nada.
(function () {
  const { Modelo, Salas, Arte, Anim, Movimento, Ovos } = window;
  const L = Salas.LARGURA, A = Salas.ALTURA;

  const container = document.getElementById('salas');
  const semSalas = document.getElementById('sem-salas');
  const maisSalasEl = document.getElementById('mais-salas');
  const chips = document.getElementById('skills-chips');
  const dica = document.getElementById('dica');
  const botaoPainel = document.getElementById('modo-painel');
  const botaoEscritorio = document.getElementById('modo-escritorio');
  const vistaCena = document.getElementById('vista-cena');
  const vistaLista = document.getElementById('vista-lista');
  const vistaCompacta = document.getElementById('vista-compacta');
  const botaoCompacto = document.getElementById('op-compacto');
  const combo = document.getElementById('combo');

  let estado = { salas: [], skills: [] };
  const lugares = Salas.criarLugares();
  const mov = Movimento.criar(); // quem muda de lugar anda até lá (quem é chamado corre)
  let recebeuEstado = false; // a primeira leitura do monitor põe todos já no lugar, sem entrar pela porta
  let dados = { salas: [], maisSalas: 0 };
  const nos = new Map(); // projeto -> { el, canvas, ctx, areas, botoes, ... }
  let escala = 3; // pixels da tela por pixel lógico (sempre inteiro: pixel art nítida)
  let hover = null; // chave do item sob o mouse/foco
  let geracao = 0; // muda a cada atualização dos dados (força um redesenho)
  const ovos = Ovos.criar(); // frases ao concluir e faixa de combo
  const estadosAntes = new Map(); // 'projeto|chave' -> estado na leitura anterior (só uma transição real dispara frase)
  // prefers-reduced-motion: nada de animação contínua; cada um aparece direto no lugar.
  const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduzido = semMovimento.matches;
  mov.reduzir(reduzido);
  let quadros = 0; // quantos quadros foram desenhados (os testes conferem que a animação roda e que pausa)

  const logico = document.createElement('canvas');
  logico.width = L; logico.height = A;
  const lctx = logico.getContext('2d');

  function ajustar() {
    if (vistaCena.hidden) return;
    escala = Salas.escalaDaTela(document.documentElement.clientWidth, window.devicePixelRatio || 1).escala; // inteiro em pixels do dispositivo
    for (const no of nos.values()) dimensionar(no);
    posicionarAreas();
  }

  function dimensionar(no) {
    const dpr = window.devicePixelRatio || 1;
    const w = L * escala, h = A * escala;
    if (no.escalaAtual === escala && no.dprAtual === dpr) return;
    no.escalaAtual = escala; no.dprAtual = dpr;
    no.palco.style.width = w + 'px'; no.palco.style.height = h + 'px';
    no.canvas.style.width = w + 'px'; no.canvas.style.height = h + 'px';
    no.canvas.width = Math.round(w * dpr); no.canvas.height = Math.round(h * dpr);
    no.ultimaChave = null; // o canvas foi limpo
  }

  // ---------- desenho ----------
  const piscando = (chave) => !reduzido && Anim.piscando(Date.now(), Modelo.hash(chave));

  function desenharSala(no, sala, t) {
    const r = no.canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return; // fora da tela: não gasta tempo
    const vistas = mov.vistas(sala.projeto), saindo = mov.saindo(sala.projeto).concat(mov.ociosos(sala.projeto)); // quem sai pela porta e quem está à toa
    // Só redesenha quando algo visível mudou: quadro da animação, piscar, dados novos (1x por segundo), hover ou alguém andando.
    const andando = saindo.some((v) => v.modo !== 'parado') || Array.from(vistas.values()).some((v) => v.modo !== 'parado');
    const piscadas = sala.itens.map((i) => (i.zona === 'mesa' ? '' : (piscando(i.chave) ? 1 : 0))).join('');
    const tA = reduzido ? 0 : t; // com movimento reduzido a animação fica parada no primeiro quadro
    const falas = new Map();
    if (Prefs.falas) for (const i of sala.itens) { const f = ovos.fala(i.chave, t); if (f) falas.set(i.chave, f); }
    const coracao = no.mascoteAte > t;
    const pulo = coracao && !reduzido ? Math.round(Math.abs(Math.sin((no.mascoteAte - t) / 900 * Math.PI * 4)) * 4) : 0;
    const chave = [Anim.quadroTela(tA), Anim.quadroDigitando(tA), Anim.duvidaDy(tA), geracao, hover, piscadas, escala, andando ? t : 0,
      Array.from(falas.values()).map((f) => f.texto).join('/'), no.trajeto ? 1 : 0, pulo, coracao ? 1 : 0].join('|');
    if (no.ultimaChave === chave) return;
    no.ultimaChave = chave;
    const an = { quadroTela: Anim.quadroTela(tA), quadroDig: Anim.quadroDigitando(tA), balanco: Anim.duvidaDy(tA) < 0 ? -1 : 0, piscando,
      vistas, saindo, trajeto: no.trajeto, mascotePulo: pulo, coracao };
    lctx.clearRect(0, 0, L, A);
    lctx.drawImage(Arte.fundo(), 0, 0);
    Arte.quadro(lctx, sala, an);
    const ctx = no.ctx, dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, no.canvas.width, no.canvas.height);
    ctx.drawImage(logico, 0, 0, no.canvas.width, no.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Arte.sobreposicao(ctx, sala, escala, hover, an.vistas, an.saindo, falas);
  }

  function desenhar() {
    if (document.hidden || vistaCena.hidden) return;
    quadros++;
    const t = Date.now();
    mov.avancar(t);
    const pent = Prefs.falas && ovos.combo(t);
    if (combo.hidden === pent) combo.hidden = !pent;
    for (const sala of dados.salas) { const no = nos.get(sala.projeto); if (no) desenharSala(no, sala, t); }
  }

  // ---------- dica (fora do canvas, posicionada junto ao botão) ----------
  function mostrarDica(item, botao) {
    hover = item.chave;
    dica.replaceChildren(...item.dica.map((linha, i) => {
      const d = document.createElement('div');
      if (i === 0) d.className = 'dica-titulo';
      d.textContent = linha; // texto puro, nunca HTML
      return d;
    }));
    dica.hidden = false;
    const b = botao.getBoundingClientRect();
    const x = b.left + b.width / 2 - dica.offsetWidth / 2;
    let y = b.bottom + 6;
    if (y + dica.offsetHeight > window.innerHeight) y = b.top - dica.offsetHeight - 6;
    dica.style.left = Math.max(4, Math.min(x, window.innerWidth - dica.offsetWidth - 4)) + 'px';
    dica.style.top = Math.max(4, y) + 'px';
    desenhar();
  }

  function esconderDica(chave) {
    if (hover !== chave) return;
    hover = null;
    dica.hidden = true;
    desenhar();
  }

  // ---------- salas e botões ----------
  function criarSala(projeto) {
    const el = document.createElement('section');
    el.className = 'sala';
    const topoEl = document.createElement('header'); topoEl.className = 'sala-topo';
    const esq = document.createElement('div');
    const titulo = document.createElement('h2'); titulo.className = 'sala-nome';
    const sub = document.createElement('p'); sub.className = 'sala-sub';
    esq.append(titulo, sub);
    const resumo = document.createElement('p'); resumo.className = 'sala-resumo';
    const trajeto = document.createElement('button'); trajeto.type = 'button'; trajeto.className = 'trajeto';
    trajeto.textContent = 'Mostrar trajeto'; trajeto.setAttribute('aria-pressed', 'false'); trajeto.hidden = true;
    const dir = document.createElement('div'); dir.className = 'sala-dir';
    dir.append(resumo, trajeto);
    topoEl.append(esq, dir);
    const palco = document.createElement('div'); palco.className = 'palco';
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    const areas = document.createElement('div'); areas.className = 'areas'; areas.setAttribute('role', 'group');
    palco.append(canvas, areas);
    el.append(topoEl, palco);
    container.appendChild(el);
    const no = { el, titulo, sub, resumo, botaoTrajeto: trajeto, trajeto: false, ovoBotoes: new Map(), palco, canvas, ctx: canvas.getContext('2d'), areas, botoes: new Map(), escalaAtual: 0, dprAtual: 0, projeto };
    titulo.textContent = projeto;
    trajeto.addEventListener('click', () => {
      no.trajeto = !no.trajeto;
      trajeto.setAttribute('aria-pressed', String(no.trajeto));
      trajeto.textContent = no.trajeto ? 'Ocultar trajeto' : 'Mostrar trajeto';
      no.ultimaChave = null; desenhar();
    });
    for (const nome of Object.keys(Salas.OVOS)) { // bichinho e cogumelo (enfeites)
      const b = document.createElement('button'); b.type = 'button'; b.className = 'area';
      b._item = { chave: 'ovo:' + nome, dica: Salas.OVOS[nome].dica };
      b.setAttribute('aria-label', Salas.OVOS[nome].aria);
      b.addEventListener('mouseenter', () => mostrarDica(b._item, b));
      b.addEventListener('mouseleave', () => esconderDica(b._item.chave));
      b.addEventListener('focus', () => mostrarDica(b._item, b));
      b.addEventListener('blur', () => esconderDica(b._item.chave));
      if (nome === 'cogumelo') b.tabIndex = -1; // só enfeite: dica no mouse, sem parada no Tab
      if (nome === 'mascote') b.addEventListener('click', () => { no.mascoteAte = Date.now() + 900; no.ultimaChave = null; desenhar(); });
      no.ovoBotoes.set(nome, b); areas.appendChild(b);
    }
    areas.setAttribute('aria-label', 'Sala do projeto ' + projeto); areas.tabIndex = -1;
    dimensionar(no);
    return no;
  }

  function criarBotao(no) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'area item'; // o anel de foco é desenhado na sala (não duplicar com o do navegador)
    b.addEventListener('mouseenter', () => mostrarDica(b._item, b));
    b.addEventListener('mouseleave', () => esconderDica(b._item.chave));
    b.addEventListener('focus', () => mostrarDica(b._item, b));
    b.addEventListener('blur', () => esconderDica(b._item.chave));
    no.areas.insertBefore(b, no.ovoBotoes.get('mascote')); // os enfeites ficam por último na ordem do Tab
    return b;
  }

  // Atualiza o que existe em vez de recriar (recriar derrubaria o foco do teclado e cliques no meio do gesto).
  function posicionarAreas() {
    const projetos = new Set(dados.salas.map((s) => s.projeto));
    for (const [p, no] of nos) if (!projetos.has(p)) { no.el.remove(); nos.delete(p); }
    let anterior = null;
    for (const sala of dados.salas) {
      let no = nos.get(sala.projeto);
      if (!no) { no = criarSala(sala.projeto); nos.set(sala.projeto, no); }
      if (no.el.previousElementSibling !== anterior) container.insertBefore(no.el, anterior ? anterior.nextSibling : container.firstChild); // só move se a ordem mudou
      anterior = no.el;
      dimensionar(no);
      const defina = (el, v) => { if (el.textContent !== v) el.textContent = v; };
      defina(no.sub, sala.subtitulo);
      const extras = sala.extras.mesa + sala.extras.cafe + sala.extras.estar;
      defina(no.resumo, sala.resumo + (extras ? ' · +' + extras + ' não cabem (veja o Painel)' : ''));
      const temArcos = Salas.arcosDe(sala).length > 0;
      if (no.botaoTrajeto.hidden === temArcos) {
        no.botaoTrajeto.hidden = !temArcos;
        if (!temArcos) { // sem arcos: volta ao estado inicial (e o foco não se perde no botão escondido)
          if (document.activeElement === no.botaoTrajeto) no.areas.focus({ preventScroll: true });
          no.trajeto = false; no.botaoTrajeto.setAttribute('aria-pressed', 'false'); no.botaoTrajeto.textContent = 'Mostrar trajeto'; no.ultimaChave = null;
        }
      }
      for (const [nome, b] of no.ovoBotoes) {
        const a = Salas.OVOS[nome];
        const css = [a.x, a.y, a.w, a.h].map((v) => v * escala + 'px');
        if (b.style.left !== css[0]) b.style.left = css[0];
        if (b.style.top !== css[1]) b.style.top = css[1];
        if (b.style.width !== css[2]) b.style.width = css[2];
        if (b.style.height !== css[3]) b.style.height = css[3];
      }
      const vivos = new Set();
      for (const item of sala.itens) {
        vivos.add(item.chave);
        let b = no.botoes.get(item.chave);
        if (!b) { b = criarBotao(no); no.botoes.set(item.chave, b); }
        b._item = item;
        const css = [item.area.x * escala, item.area.y * escala, item.area.w * escala, item.area.h * escala].map((v) => v + 'px');
        if (b.style.left !== css[0]) b.style.left = css[0];
        if (b.style.top !== css[1]) b.style.top = css[1];
        if (b.style.width !== css[2]) b.style.width = css[2];
        if (b.style.height !== css[3]) b.style.height = css[3];
        if (b.getAttribute('aria-label') !== item.aria) b.setAttribute('aria-label', item.aria);
        b.tabIndex = item.tarefaId ? 0 : -1; // só quem abre relatório entra no Tab
        if (item.tarefaId) { // clicável: abre o relatório (o clique é tratado em app.js)
          if (b.dataset.tarefa !== item.tarefaId) b.dataset.tarefa = item.tarefaId;
          if (b.dataset.titulo !== item.rotulo) b.dataset.titulo = item.rotulo;
        } else if (b.dataset.tarefa !== undefined) { delete b.dataset.tarefa; delete b.dataset.titulo; }
      }
      for (const [chave, b] of no.botoes) {
        if (!vivos.has(chave)) { b.remove(); no.botoes.delete(chave); if (hover === chave) { hover = null; dica.hidden = true; } }
      }
    }
    semSalas.hidden = dados.salas.length > 0;
    maisSalasEl.hidden = dados.maisSalas === 0;
    if (dados.maisSalas) maisSalasEl.textContent = '+' + dados.maisSalas + (dados.maisSalas === 1 ? ' projeto não cabe' : ' projetos não cabem') + ' na tela (veja o Painel).';
  }

  // ---------- faixa de skills ----------
  let assinaturaSkills = null;
  function atualizarSkills(lista) {
    const ass = lista.map((s) => s.nome + (s.acesa ? '*' + (s.projeto || '') : '')).join('|');
    if (ass === assinaturaSkills) return;
    assinaturaSkills = ass;
    chips.replaceChildren(...lista.map((s) => {
      const li = document.createElement('li');
      li.className = 'chip' + (s.acesa ? ' acesa' : '');
      if (s.descricao) li.title = s.descricao;
      const sigla = document.createElement('span'); sigla.className = 'sigla'; sigla.setAttribute('aria-hidden', 'true');
      sigla.textContent = Modelo.siglaDe(s.nome);
      sigla.style.background = Arte.P.skills[Modelo.hash('skill:' + s.nome) % Modelo.N_COR_SKILL];
      const nome = document.createElement('span'); nome.textContent = s.nome;
      li.append(sigla, nome);
      if (s.acesa) { const u = document.createElement('span'); u.className = 'uso'; u.textContent = s.projeto ? 'em uso · ' + s.projeto : 'em uso'; li.append(u); }
      return li;
    }));
    document.getElementById('skills-vazio').hidden = lista.length > 0;
  }

  // O tema já é escuro; à noite (hora local) a sala só perde um pouco de brilho.
  function tomNoturno() {
    const d = new Date();
    const f = 'brightness(' + (1 - 0.14 * Ovos.noite(d.getHours() + d.getMinutes() / 60)).toFixed(2) + ')';
    for (const no of nos.values()) if (no.canvas.style.filter !== f) no.canvas.style.filter = f;
  }

  function atualizar(novo) {
    if (novo) estado = novo;
    dados = Salas.montarSalas(estado, Date.now(), lugares);
    geracao++;
    const inicial = !recebeuEstado;
    if (novo) recebeuEstado = true;
    // Frase de vitória só quando uma execução passa de "trabalhando" (ou "sem sinal") para "encerrada" diante de nós:
    // quem já aparece encerrada ao abrir o app, ou volta de uma lista incompleta, não dispara nada.
    const agora = Date.now();
    // Vale para todas as execuções, mesmo as que não cabem na sala (dados brutos, antes do corte por vagas).
    const presentes = new Set();
    for (const sala of (estado.salas || [])) {
      const execs = sala.execucoes || [];
      for (const e of execs) {
        const k = sala.projeto + '|exec:' + e.id, antes = estadosAntes.get(k);
        presentes.add(k);
        if (!inicial && Prefs.falas && e.estado === 'concluido' && (antes === 'trabalhando' || antes === 'semSinal')) {
          // "Equipe completa" só se todas as da sala encerraram juntas (até 10 s uma da outra)
          const slots = execs.map((x) => ({ zona: 'fixo', estado: x.estado === 'concluido' && Math.abs((x.fim || 0) - (e.fim || 0)) <= 10000 ? 'concluido' : 'trabalhando' }));
          ovos.concluiu(slots, 'exec:' + e.id, agora);
        }
        estadosAntes.set(k, e.estado);
      }
    }
    for (const k of Array.from(estadosAntes.keys())) if (!presentes.has(k)) estadosAntes.delete(k);
    const moradores = (estado.mesas || []).slice(0, 8).map((m) => ({ rotulo: m.nome, aparencia: Modelo.aparencia(m.nome) })); // agentes do catálogo esperam em todas as salas
    for (const sala of dados.salas) { mov.sincronizar(sala.projeto, sala.itens, inicial); mov.residentes(sala.projeto, moradores, inicial); }
    mov.manter(dados.salas.map((s) => s.projeto));
    posicionarAreas();
    tomNoturno();
    atualizarSkills(estado.skills || []);
    desenhar();
  }

  // ---------- modo Painel / Escritório ----------
  let modo = 'cena';
  function definirModo(novo) {
    if (novo === modo) return;
    modo = novo;
    vistaCena.hidden = compacto || modo !== 'cena';
    vistaLista.hidden = compacto || modo !== 'lista';
    botaoEscritorio.setAttribute('aria-pressed', String(modo === 'cena'));
    botaoPainel.setAttribute('aria-pressed', String(modo === 'lista'));
    ajustar();
    atualizar();
  }
  const alternar = () => { if (!compacto) definirModo(modo === 'cena' ? 'lista' : 'cena'); };

  // Modo compacto: mini-janela sempre no topo com uma linha por projeto. A sala não é desenhada enquanto ele estiver ligado.
  let compacto = false;
  function definirCompacto(ligado) {
    if (ligado === compacto) return;
    compacto = ligado;
    if (compacto) { // a mini-janela não comporta o relatório nem as Configurações: fecha os dois
      for (const [caixa, botao] of [['painel', 'fechar'], ['config', 'config-fechar']]) if (!document.getElementById(caixa).hidden) document.getElementById(botao).click();
    }
    document.body.classList.toggle('compacto', compacto);
    botaoCompacto.setAttribute('aria-pressed', String(compacto));
    vistaCompacta.hidden = !compacto;
    vistaCena.hidden = compacto || modo !== 'cena';
    vistaLista.hidden = compacto || modo !== 'lista';
    window.escrithorius.definirCompacto(compacto); // o processo principal ajusta o tamanho e o "sempre no topo"
    ajustar();
    atualizar();
  }
  botaoCompacto.addEventListener('click', () => definirCompacto(!compacto));
  botaoEscritorio.addEventListener('click', () => definirModo('cena'));
  botaoPainel.addEventListener('click', () => definirModo('lista'));
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('config').hidden) return; // com as Configurações abertas os atalhos não valem
    if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey) alternar();
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) definirCompacto(!compacto);
  });

  semMovimento.addEventListener('change', () => { reduzido = semMovimento.matches; mov.reduzir(reduzido); geracao++; desenhar(); });
  function fecharDica() { if (hover !== null) { hover = null; dica.hidden = true; desenhar(); } }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharDica(); });
  window.addEventListener('scroll', fecharDica, { passive: true });
  window.addEventListener('resize', () => { ajustar(); desenhar(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(); });
  window.escrithorius.aoReceberEstado((e) => atualizar(e));
  setInterval(() => { if (!document.hidden) { ajustar(); atualizar(); } }, 1000); // recalcula a cena (tempos, estados) e acompanha mudança de zoom/monitor
  // Animação: ~20 quadros por segundo, parada quando a janela está escondida/minimizada ou no modo Painel.
  setInterval(desenhar, Anim.PASSO_MS);
  window.Cena = { quadros: () => quadros };

  ajustar();
  atualizar();
})();
