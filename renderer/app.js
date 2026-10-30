const ROTULO = { trabalhando: 'trabalhando', concluido: 'concluído', semSinal: 'sem sinal', desligado: 'desligado', parado: 'à espera' };
let ultimo = { salas: [], mesas: [], skills: [], agentes: [] };

function duracao(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// Atualiza os itens existentes em vez de recriá-los: recriar a cada segundo derrubava o foco do teclado
// e podia perder um clique do mouse entre apertar e soltar. Só textContent: nunca HTML vindo dos registros.
function atualizarItem(li, { classe, texto, detalhe, tarefaId }) {
  if (li.className !== classe) li.className = classe;
  if (tarefaId) { // clicável: abre o relatório da tarefa
    if (li.dataset.tarefa !== tarefaId) li.dataset.tarefa = tarefaId;
    if (li.tabIndex !== 0) li.tabIndex = 0;
    if (li.getAttribute('role') !== 'button') li.setAttribute('role', 'button');
  } else if (li.dataset.tarefa !== undefined) {
    delete li.dataset.tarefa;
    li.removeAttribute('tabindex');
    li.removeAttribute('role');
  }
  if (!li.firstChild || li.firstChild.nodeType !== Node.TEXT_NODE) li.prepend(document.createTextNode(''));
  if (li.firstChild.nodeValue !== texto) li.firstChild.nodeValue = texto;
  let d = li.querySelector(':scope > .detalhe');
  if (detalhe) {
    if (!d) { d = document.createElement('div'); d.className = 'detalhe'; li.appendChild(d); }
    if (d.textContent !== detalhe) d.textContent = detalhe;
  } else if (d) d.remove();
}

function sincronizar(id, itens, vazio) {
  const ul = document.getElementById(id);
  const nos = ul._nos || (ul._nos = new Map());
  const lista = itens.length ? itens : [{ chave: '__vazio', classe: 'vazio', texto: vazio }];
  const vivos = new Set();
  lista.forEach((item, i) => {
    vivos.add(item.chave);
    let li = nos.get(item.chave);
    if (!li) { li = document.createElement('li'); nos.set(item.chave, li); }
    atualizarItem(li, item);
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null); // só move se a ordem mudou
  });
  for (const [chave, li] of nos) {
    if (!vivos.has(chave)) { li.remove(); nos.delete(chave); }
  }
}

function itemDeTarefa(a, agora) {
  const fim = a.fim || agora;
  return {
    chave: a.id,
    classe: a.estado,
    texto: `${a.tipo}: ${ROTULO[a.estado]}, ${duracao(fim - a.inicio)} (${a.projeto})`,
    detalhe: a.descricao,
    tarefaId: a.id,
  };
}

// Uma seção por projeto (título, resumo, agentes à espera e a lista de todas as sessões e execuções). Atualiza no lugar.
const secoesProjeto = new Map(); // projeto -> { el, sub, espera, ul }
function desenharProjetos(lista) {
  const raiz = document.getElementById('projetos-painel');
  document.getElementById('sem-projetos').hidden = lista.length > 0;
  const vivos = new Set();
  lista.forEach((p, i) => {
    vivos.add(p.projeto);
    let s = secoesProjeto.get(p.projeto);
    if (!s) {
      const el = document.createElement('section'); el.className = 'proj';
      const h = document.createElement('h3'); h.textContent = p.projeto;
      const sub = document.createElement('p'); sub.className = 'suave';
      const espera = document.createElement('p'); espera.className = 'suave espera';
      const ul = document.createElement('ul'); ul.id = 'proj-' + secoesProjeto.size + '-' + Math.random().toString(36).slice(2, 8);
      el.append(h, sub, espera, ul);
      s = { el, sub, espera, ul }; secoesProjeto.set(p.projeto, s);
    }
    if (raiz.children[i] !== s.el) raiz.insertBefore(s.el, raiz.children[i] || null);
    if (s.sub.textContent !== p.subtitulo) s.sub.textContent = p.subtitulo;
    const txt = p.espera.length ? 'À espera: ' + p.espera.join(', ') : '';
    if (s.espera.textContent !== txt) s.espera.textContent = txt;
    s.espera.hidden = !txt;
    sincronizar(s.ul.id, p.itens, 'Nada por aqui.');
  });
  for (const [nome, s] of secoesProjeto) if (!vivos.has(nome)) { s.el.remove(); secoesProjeto.delete(nome); }
}

function desenhar() {
  const agora = Date.now();
  desenharProjetos(Painel.projetos(ultimo, agora));
  sincronizar('mesas', ultimo.mesas.map((m) => {
    let texto = `${m.nome}: ${ROTULO[m.estado]}`;
    if (m.ultima && (m.estado === 'trabalhando' || m.estado === 'semSinal')) {
      texto += `, ${duracao((m.ultima.fim || agora) - m.ultima.inicio)} (${m.ultima.projeto})`;
    }
    const detalhe = m.ultima && m.estado !== 'trabalhando' ? `última tarefa: ${m.ultima.descricao}` : m.descricao;
    return { chave: m.nome, classe: m.estado, texto, detalhe, tarefaId: m.ultima && m.ultima.id };
  }), 'Nenhum agente em ~/.claude/agents.');
  sincronizar('skills', ultimo.skills.map((s) => ({
    chave: s.nome,
    classe: s.acesa ? 'skill acesa' : 'skill',
    texto: s.acesa ? `${s.nome}: em uso (${s.projeto})` : s.nome,
    detalhe: s.descricao,
  })), 'Nenhuma skill em ~/.claude/skills.');
  const c = Compacto.resumir(ultimo, agora);
  if (document.getElementById('compacto-resumo').textContent !== c.resumo) document.getElementById('compacto-resumo').textContent = c.resumo;
  sincronizar('compacto-lista', c.linhas, 'Nenhuma sessão aberta.');
  sincronizar('atividade', ultimo.agentes.map((a) => itemDeTarefa(a, agora)), 'Nenhum agente por aqui ainda.');
}

window.escrithorius.aoReceberEstado((estado) => { ultimo = estado; desenhar(); });
setInterval(desenhar, 1000);

// --- Painel do relatório (texto puro, nunca HTML) ---
const painel = document.getElementById('painel');
const painelTitulo = document.getElementById('painel-titulo');
const painelTexto = document.getElementById('painel-texto');
let abertoId = null;
let focoAnterior = null; // quem tinha o foco antes de abrir (volta para lá ao fechar)

async function abrirRelatorio(li) {
  const id = li.dataset.tarefa;
  abertoId = id;
  if (painel.hidden) focoAnterior = document.activeElement;
  painelTitulo.textContent = li.dataset.titulo || li.firstChild.nodeValue; // botões da cena trazem o título no dataset
  painelTexto.textContent = 'Carregando...';
  painel.hidden = false;
  document.getElementById('fechar').focus();
  let r = null;
  try { r = await window.escrithorius.pedirRelatorio(id); } catch { /* mostra "indisponível" */ }
  if (abertoId !== id) return; // abriu outro enquanto carregava
  if (!r) painelTexto.textContent = 'Relatório indisponível.';
  else if (!r.texto) painelTexto.textContent = 'Este agente ainda não entregou um relatório.';
  else {
    const aviso = r.parcial ? '[parcial: o agente ainda não entregou o relatório final; este é o último texto dele]\n\n' : '';
    painelTexto.textContent = aviso + r.texto + (r.truncado ? '\n\n[texto cortado em 20 mil caracteres]' : '');
  }
}

function fecharRelatorio() {
  if (painel.hidden) return;
  copiarAviso.textContent = '';
  abertoId = null; painel.hidden = true;
  if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
  focoAnterior = null;
}

document.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-tarefa]'); // item da lista ou botão da cena
  if (alvo) abrirRelatorio(alvo);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharRelatorio();
  else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('li[data-tarefa], .cartao[data-tarefa]')) {
    e.preventDefault();
    abrirRelatorio(e.target);
  }
});
document.getElementById('fechar').addEventListener('click', fecharRelatorio);
// "Copiar comando de retomada": o processo principal valida o id e copia "claude --resume <sessão>".
const copiarAviso = document.getElementById('copiar-aviso');
let copiarTimer = null;
document.getElementById('copiar').addEventListener('click', async () => {
  let ok = false;
  try { ok = abertoId ? await window.escrithorius.copiarRetomada(abertoId) : false; } catch { ok = false; }
  copiarAviso.textContent = ok ? 'Copiado! Cole no terminal, na pasta do projeto.' : 'Não foi possível copiar.';
  clearTimeout(copiarTimer);
  copiarTimer = setTimeout(() => { copiarAviso.textContent = ''; }, 2500);
});
// Clique numa notificação do Windows: abre o relatório do agente que concluiu (o id só vale se o monitor o reconhecer).
window.escrithorius.aoAbrirRelatorio((d) => {
  if (d && typeof d.id === 'string') abrirRelatorio({ dataset: { tarefa: d.id, titulo: typeof d.titulo === 'string' && d.titulo ? d.titulo : 'Relatório' } });
});
