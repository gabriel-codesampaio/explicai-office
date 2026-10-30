// Layout das salas (uma por projeto): estado do monitor -> quem fica em qual lugar, com textos e áreas clicáveis.
// Só lógica, sem canvas nem DOM. Coordenadas em pixels lógicos da sala (LARGURA x ALTURA); a tela amplia em escala inteira.
(function (raiz) {
  const Modelo = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./modelo.js') : raiz.Modelo;

  const LARGURA = 352;
  const ALTURA = 136;
  const MAX_SALAS = 12;

  // Zonas da sala (faixas verticais): estações de trabalho, café e sala de estar.
  const ZONAS = { estacoes: { x0: 0, x1: 184 }, cafe: { x0: 184, x1: 232 }, estar: { x0: 232, x1: 352 } };
  const PAREDE = 32; // altura da parede; o piso começa depois

  // 8 mesas (4 colunas x 2 fileiras): x = centro da mesa, y = topo da célula (44 x 50).
  const CELULA = { w: 44, h: 50 };
  const MESAS = [];
  for (const y of [34, 86]) for (const x of [22, 67, 112, 157]) MESAS.push({ x, y });
  // Café: 2 lugares em pé (junto à bancada) e 2 sentados às mesinhas. Sala de estar: 3 assentos no sofá e 3 poltronas.
  // y = topo da cabeça; x = centro. Entre as fileiras há um corredor livre (por onde todo mundo anda).
  const CAFE = [{ x: 196, y: 38 }, { x: 216, y: 38 }, { x: 196, y: 88, sentado: true }, { x: 220, y: 88, sentado: true }];
  const ESTAR = [{ x: 257, y: 40, sentado: true }, { x: 292, y: 40, sentado: true }, { x: 327, y: 40, sentado: true }, { x: 257, y: 94, sentado: true }, { x: 292, y: 94, sentado: true }, { x: 327, y: 94, sentado: true }];
  const VAGAS = { mesa: MESAS, cafe: CAFE, estar: ESTAR };

  const ROTULO_ESTADO = { trabalhando: 'trabalhando', delegando: 'delegando', aguardando: 'aguardando', semSinal: 'sem sinal', concluido: 'encerrada' };
  const LOSANGO = { trabalhando: 'verde', delegando: 'azul', aguardando: 'laranja', semSinal: 'laranja', concluido: 'cinza' };

  function fmtTempo(ms) {
    const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' h ' + r + ' min' : h + ' h';
  }

  // Onde cada um fica: quem trabalha ou delega senta à mesa; sessão aguardando vai à sala de estar; execução encerrada vai ao café.
  function zonaDe(tipo, estado) {
    if (tipo === 'sessao') return estado === 'aguardando' ? 'estar' : 'mesa';
    return estado === 'concluido' ? 'cafe' : 'mesa';
  }

  // Cada pessoa mantém o mesmo lugar enquanto continuar na zona (senão todos "pulariam" de mesa quando alguém sai).
  function criarAlocador(capacidade) {
    const mapa = new Map();
    return {
      atribuir(chaves) {
        const vivos = new Set(chaves);
        for (const k of Array.from(mapa.keys())) if (!vivos.has(k)) mapa.delete(k);
        const usados = new Set(mapa.values());
        const saida = new Map();
        for (const k of chaves) {
          if (!mapa.has(k)) {
            let i = 0;
            while (i < capacidade && usados.has(i)) i++;
            if (i < capacidade) { mapa.set(k, i); usados.add(i); }
          }
          saida.set(k, mapa.has(k) ? mapa.get(k) : -1); // -1 = não coube (vira "+N")
        }
        return saida;
      },
    };
  }

  function criarLugares() {
    const alocadores = new Map();
    return {
      alocar(projeto, zona, chaves) {
        const k = projeto + '|' + zona;
        if (!alocadores.has(k)) alocadores.set(k, criarAlocador(VAGAS[zona].length));
        return alocadores.get(k).atribuir(chaves);
      },
      manter(projetos) { // esquece salas que sumiram
        const vivos = new Set(projetos);
        for (const k of Array.from(alocadores.keys())) if (!vivos.has(k.slice(0, k.lastIndexOf('|')))) alocadores.delete(k);
      },
    };
  }

  // Área clicável do item (pixels lógicos).
  function areaDe(zona, v) {
    if (zona === 'mesa') return { x: v.x - CELULA.w / 2, y: v.y, w: CELULA.w, h: CELULA.h };
    return { x: v.x - 10, y: v.y - 2, w: 20, h: 26 };
  }

  // Pares [sessão, execução] para os arcos de trajeto: só execuções ainda em andamento cuja sessão está na sala.
  function arcosDe(sala) {
    const porChave = new Map(sala.itens.map((i) => [i.chave, i]));
    const pares = [];
    for (const i of sala.itens) {
      if (i.tipo !== 'execucao' || i.estado === 'concluido') continue;
      const pai = porChave.get(i.sessaoChave);
      if (pai) pares.push([pai, i]);
    }
    return pares;
  }

  // Escala da sala: quantos pixels DO DISPOSITIVO por pixel lógico (sempre inteiro, para a pixel art não ficar com fileiras
  // desiguais com zoom do Windows em 125%/150%) e o equivalente em pixels CSS. larguraCss = largura útil da janela.
  const ESPACO_LATERAL = 58; // padding da vista e da sala, bordas e barra de rolagem
  function escalaDaTela(larguraCss, dpr) {
    const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    const k = Math.max(1, Math.min(Math.floor(4 * d + 1e-9), Math.floor(((larguraCss - ESPACO_LATERAL) * d + 1e-9) / LARGURA)));
    return { k, escala: k / d };
  }

  // "Usando Bash há 9 s" (ferramenta pendente) ou "Última ferramenta: Read há 3 s" (recente). Só o nome: o monitor nunca envia o conteúdo.
  function linhaFerramenta(f, agora) {
    if (!f || typeof f.nome !== 'string' || !f.nome) return '';
    const idade = Number.isFinite(f.desde) ? agora - f.desde : null;
    if (f.pendente) return 'Usando ' + f.nome + (idade !== null ? ' há ' + fmtTempo(idade) : '');
    if (idade !== null && idade < 120000) return 'Última ferramenta: ' + f.nome + ' há ' + fmtTempo(idade);
    return '';
  }
  const ESPERANDO = 'Possivelmente esperando você (permissão ou resposta)';

  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

  // Easter eggs fixos da sala (áreas em pixels lógicos). Nada aqui vem dos dados.
  const OVOS = {
    mascote: { x: 93, y: 17, w: 12, h: 13, dica: ['Bichinho', 'Clique para fazer carinho.'], aria: 'Bichinho de enfeite. Clique para fazer carinho.' },
    cogumelo: { x: 334, y: 119, w: 13, h: 12, dica: ['Cogumelo', 'Não pise.'], aria: 'Cogumelo de enfeite: não pise.' },
  };

  // Duração das últimas execuções concluídas do mesmo tipo (só o que o app já tem em memória), da mais nova para a mais velha.
  function historicoDoTipo(estado, e, max) {
    const feitas = ((estado && estado.agentes) || []).filter((t) => t.tipo === e.tipo && t.estado === 'concluido' && t.id !== e.id && t.inicio > 0 && t.fim >= t.inicio);
    feitas.sort((a, b) => b.fim - a.fim);
    return feitas.slice(0, max).map((t) => fmtTempo(t.fim - t.inicio));
  }

  // estado = o que o monitor devolve; agora = Date.now(); lugares = criarLugares() (guardado entre chamadas).
  function montarSalas(estado, agora, lugares) {
    const todas = ((estado && estado.salas) || []).slice(0, MAX_SALAS);
    const salas = todas.map((s) => {
      const projeto = s.projeto;
      const itens = [];
      for (const x of s.sessoes || []) {
        itens.push({
          chave: 'sessao:' + x.id, tipo: 'sessao', rotulo: 'Claude principal', estado: x.estado,
          tempo: (x.desde || x.inicio) ? fmtTempo(agora - (x.desde || x.inicio)) : '', // há quanto tempo está neste estado
          aparencia: Modelo.aparencia('chefe', projeto),
          tarefaId: null, descricao: '', inicio: x.inicio || 0, ferramenta: x.ferramenta || null, esperando: !!x.esperando,
        });
      }
      const execs = (s.execucoes || []).slice().sort((a, b) => (a.inicio || 0) - (b.inicio || 0));
      for (const e of execs) {
        const encerrada = e.estado === 'concluido';
        itens.push({
          chave: 'exec:' + e.id, tipo: 'execucao', rotulo: e.tipo, estado: e.estado,
          tempo: encerrada ? 'encerrou há ' + fmtTempo(agora - (e.fim || agora)) : fmtTempo(agora - (e.inicio || agora)),
          aparencia: Modelo.aparencia(e.tipo), tarefaId: e.id, descricao: e.descricao || '', inicio: e.inicio || 0,
          sessaoChave: 'sessao:' + e.sessaoId, anteriores: historicoDoTipo(estado, e, 3), ferramenta: e.ferr || null, esperando: !!e.esperando,
        });
      }
      const extras = { mesa: 0, cafe: 0, estar: 0 };
      for (const zona of ['mesa', 'cafe', 'estar']) {
        const daZona = itens.filter((i) => zonaDe(i.tipo, i.estado) === zona);
        const vagas = lugares.alocar(projeto, zona, daZona.map((i) => i.chave));
        for (const i of daZona) {
          const n = vagas.get(i.chave);
          i.zona = zona;
          i.sentado = zona === 'estar' || !!(VAGAS[zona][n] && VAGAS[zona][n].sentado);
          i.vaga = n >= 0 ? VAGAS[zona][n] : null;
          i.area = i.vaga ? areaDe(zona, i.vaga) : null;
          if (!i.vaga) extras[zona]++;
        }
      }
      const visiveis = itens.filter((i) => i.vaga);
      for (const i of visiveis) {
        i.losango = LOSANGO[i.estado] || 'cinza';
        const est = ROTULO_ESTADO[i.estado] || i.estado;
        const situacao = i.estado === 'concluido' ? i.tempo : est + (i.tempo ? ' · ' + i.tempo : ''); // "encerrou há 14 s" já diz tudo
        const anteriores = i.anteriores && i.anteriores.length ? 'Últimas execuções: ' + i.anteriores.join(' · ') : '';
        const ativo = i.estado === 'trabalhando' || i.estado === 'delegando';
        const ferr = ativo ? linhaFerramenta(i.ferramenta, agora) : '';
        if (!ativo) i.esperando = false;
        i.dica = [i.rotulo, situacao, 'Projeto ' + projeto, i.descricao, ferr, i.esperando ? ESPERANDO : '', anteriores].filter(Boolean);
        i.aria = (i.tipo === 'sessao' ? 'Sessão do projeto ' + projeto : 'Agente ' + i.rotulo + ' no projeto ' + projeto) + ': ' + situacao.replace(' · ', ', ') + (i.esperando ? ', possivelmente esperando você' : '');
      }
      const conta = (f) => itens.filter(f).length;
      const resumo = [
        conta((i) => i.estado === 'trabalhando') + ' trabalhando',
        conta((i) => i.estado === 'delegando') + ' delegando',
        conta((i) => i.estado === 'aguardando') + ' aguardando',
        plural(conta((i) => i.estado === 'concluido'), 'encerrada', 'encerradas'),
      ].join(' · ');
      const ativas = conta((i) => i.tipo === 'execucao' && (i.estado === 'trabalhando' || i.estado === 'semSinal'));
      return { projeto, subtitulo: plural(ativas, 'execução ativa', 'execuções ativas'), resumo, itens: visiveis, extras };
    });
    lugares.manter(salas.map((s) => s.projeto));
    return { salas, maisSalas: Math.max(0, (((estado && estado.salas) || []).length) - MAX_SALAS) };
  }

  const Salas = { LARGURA, ALTURA, MAX_SALAS, ZONAS, PAREDE, CELULA, VAGAS, MESAS, CAFE, ESTAR, OVOS, arcosDe, escalaDaTela, linhaFerramenta, fmtTempo, zonaDe, criarAlocador, criarLugares, montarSalas };
  if (typeof module !== 'undefined' && module.exports) module.exports = Salas;
  else raiz.Salas = Salas;
})(typeof window !== 'undefined' ? window : globalThis);
