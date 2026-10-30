// Frases de comemoração (originais, irônicas) sorteadas quando uma execução termina (balão acima da pessoa).
// Todas escritas para este projeto: nada de material de jogos, filmes ou marcas. O "autor" é só uma persona engraçada.
// Para acrescentar frases, inclua itens em LISTA (autor + frase, até 70 caracteres). Nada aqui é lido do disco do usuário.
(function (raiz) {
  const LISTA = [
    { autor: 'Estagiário', frase: 'Terminei! Posso ser promovido a sênior agora?' },
    { autor: 'Estagiário', frase: 'Pronto! Agora só falta o que pediram de verdade.' },
    { autor: 'Estagiário', frase: 'Funcionou de primeira. Desconfio de mim mesmo.' },
    { autor: 'Agente discreto', frase: 'Terminei. Não olhe o diff com muita atenção.' },
    { autor: 'Agente discreto', frase: 'Dei um jeito. Não pergunte qual.' },
    { autor: 'Agente cuidadoso', frase: 'Feito. E sem mexer em produção. Acho.' },
    { autor: 'Agente independente', frase: 'Revisão de código? Fiz sozinho, aprovei sozinho.' },
    { autor: 'Agente exausto', frase: 'Missão cumprida. Próxima missão: fingir que descansei.' },
    { autor: 'Agente exausto', frase: 'Mais uma tarefa riscada. A lista cresceu, mas tudo bem.' },
    { autor: 'Agente otimista', frase: 'Zero bugs encontrados. Ainda não procurei direito.' },
    { autor: 'Agente otimista', frase: 'Quase perfeito. O "quase" é esse detalhe aqui.' },
    { autor: 'Testador', frase: 'O teste passou. O teste também é bem camarada.' },
    { autor: 'Testador', frase: 'Bugs: 0. Surpresas: infinitas.' },
    { autor: 'Cache', frase: 'Se quebrar, a culpa é do cache.' },
    { autor: 'Cache', frase: 'Eu poderia ter atualizado, mas fiquei com preguiça.' },
    { autor: 'Suporte técnico', frase: 'Era só reiniciar. Sempre era só reiniciar.' },
    { autor: 'Gerente de produto', frase: 'Isso não é um bug, é um comportamento emergente.' },
    { autor: 'Gerente de produto', frase: 'Entreguei o que você pediu, não o que queria.' },
    { autor: 'Café', frase: 'A tarefa acabou antes de eu esfriar.' },
    { autor: 'Café', frase: 'Terminou? Então você merece mais uma xícara.' },
    { autor: 'Linter', frase: 'Sem erros. Só 400 avisos, mas quem lê avisos?' },
    { autor: 'Compilador', frase: 'Compilou. Não prometo mais nada.' },
    { autor: 'Deploy de sexta', frase: 'Terminei. Que ousadia, mas ok.' },
    { autor: 'Documentação', frase: 'A documentação é este balão. De nada.' },
    { autor: 'Git blame', frase: 'Commitei e fui. Não me procurem.' },
    { autor: 'Sênior', frase: 'Resolvi o problema. Criei três novos, mas são menores.' },
    { autor: 'Sênior', frase: 'Em tese está pronto. Em prática, também.' },
    { autor: 'Servidor', frase: 'Tudo certo por aqui. Pelo menos até o próximo pedido.' },
    { autor: 'Reunião', frase: 'Isso podia ter sido um e-mail. Mas terminou.' },
    { autor: 'Prazo', frase: 'Entregue antes de mim. Que raro.' },
  ];

  // Sorteia uma fala; nunca repete a anterior (indiceAnterior) quando há mais de uma. `rnd` devolve [0, 1).
  function sortear(rnd = Math.random, indiceAnterior = -1) {
    let i = Math.floor(rnd() * LISTA.length) % LISTA.length;
    if (LISTA.length > 1 && i === indiceAnterior) i = (i + 1) % LISTA.length;
    return { indice: i, autor: LISTA[i].autor, frase: LISTA[i].frase };
  }

  const Frases = { LISTA, sortear };
  if (typeof module !== 'undefined' && module.exports) module.exports = Frases;
  else raiz.Frases = Frases;
})(typeof window !== 'undefined' ? window : globalThis);
