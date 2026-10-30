// Teste de fumaça do desenho: monta salas com muitos estados e desenha com um contexto de mentira.
// Pega erros que só aparecem na tela (uma exceção aqui deixaria a sala inteira em branco).
const test = require('node:test');
const assert = require('node:assert');
const Salas = require('../renderer/salas.js');
const Mov = require('../renderer/movimento.js');
const Arte = require('../renderer/arte.js');
const Modelo = require('../renderer/modelo.js');

const AGORA = 1_700_000_000_000;
const exec = (id, tipo, estado, extra = {}) => ({ id: 's1/agent-' + id, sessaoId: 's1', tipo, estado, descricao: 'faz ' + id, inicio: AGORA - 9000, fim: estado === 'concluido' ? AGORA - 5000 : null, ...extra });
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })), set: (t, k, v) => { t[k] = v; return true; } });

function cenario(nome, sessoes, execucoes, catalogo = ['qa', 'seguranca', 'planejador', 'banco']) {
  test('desenho sem erro: ' + nome, () => {
    const estado = { salas: [{ projeto: 'p', sessoes, execucoes }], mesas: catalogo.map((n) => ({ nome: n })), agentes: [] };
    const lugares = Salas.criarLugares(), mov = Mov.criar();
    let t = AGORA;
    for (let rodada = 0; rodada < 3; rodada++) {
      const dados = Salas.montarSalas(estado, t, lugares);
      for (const sala of dados.salas) {
        for (const i of sala.itens) assert.ok(i.aparencia && i.rotulo && i.area && i.vaga, 'item completo: ' + i.chave); // um item sem aparência derruba o desenho da sala inteira
        mov.sincronizar(sala.projeto, sala.itens, rodada === 0);
        mov.residentes(sala.projeto, catalogo.map((n) => ({ rotulo: n, aparencia: Modelo.aparencia(n) })), rodada === 0);
      }
      for (let k = 0; k < 30; k++) {
        t += 100; mov.avancar(t);
        for (const sala of dados.salas) {
          const vistas = mov.vistas(sala.projeto), saindo = mov.saindo(sala.projeto).concat(mov.ociosos(sala.projeto));
          const c = ctx();
          Arte.quadro(c, sala, { quadroTela: k % 4, quadroDig: k % 2, balanco: 0, piscando: () => k % 3 === 0, vistas, saindo, trajeto: true, mascotePulo: 2, coracao: true });
          Arte.sobreposicao(c, sala, 3, sala.itens[0] && sala.itens[0].chave, vistas, saindo, new Map(sala.itens.map((i) => [i.chave, { texto: 'frase', autor: 'autor' }])));
        }
      }
    }
  });
}

const sess = (estado, extra = {}) => ({ id: 's1', estado, inicio: AGORA - 1e6, desde: AGORA - 5000, ...extra });
cenario('sessão sozinha', [sess('trabalhando')], []);
cenario('sessão aguardando (sofá) e várias execuções', [sess('aguardando')], [exec('1', 'qa', 'trabalhando'), exec('2', 'Explore', 'semSinal')]);
cenario('12 execuções: 4 trabalhando e 8 encerradas (mais do que cabe no café)', [sess('delegando')],
  [...['qa', 'seguranca', 'planejador', 'banco'].map((t, k) => exec('t' + k, t, 'trabalhando')), ...['qa', 'seguranca', 'planejador', 'Explore', 'qa', 'seguranca', 'planejador', 'banco'].map((t, k) => exec('c' + k, t, 'concluido'))]);
cenario('mais execuções do que mesas (excedente "+N")', [sess('delegando')], Array.from({ length: 14 }, (_, k) => exec('m' + k, 'Explore', 'trabalhando')));
cenario('esperando você, ferramenta em uso e catálogo grande', [sess('trabalhando', { esperando: true, ferramenta: { nome: 'Bash', desde: AGORA - 20000, pendente: true } })],
  [exec('1', 'qa', 'trabalhando', { esperando: true, ferr: { nome: 'Read', desde: AGORA - 3000, pendente: false } })], Array.from({ length: 8 }, (_, k) => 'agente' + k));
cenario('sem nenhum agente no catálogo', [sess('trabalhando')], [exec('1', 'qa', 'concluido')], []);
