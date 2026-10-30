const { contextBridge, ipcRenderer } = require('electron');

// Canais expostos: receber o estado (já mascarado), pedir o relatório de uma tarefa pelo id, ligar/desligar avisos e som.
contextBridge.exposeInMainWorld('office', {
  aoReceberEstado: (fn) => ipcRenderer.on('estado', (_e, estado) => fn(estado)),
  pedirRelatorio: (id) => ipcRenderer.invoke('relatorio', String(id)),
  copiarRetomada: (id) => ipcRenderer.invoke('retomada', String(id)),
  definirCompacto: (ligado) => ipcRenderer.send('compacto', ligado === true),
  obterConfig: () => ipcRenderer.invoke('config:obter'),
  definirConfig: (mudancas) => ipcRenderer.invoke('config:definir', mudancas),
  escolherPasta: () => ipcRenderer.invoke('config:escolher-pasta'),
  pastaPadrao: () => ipcRenderer.invoke('config:pasta-padrao'),
  definirAvisos: (ligado) => ipcRenderer.send('avisos', ligado === true),
  definirSom: (ligado) => ipcRenderer.send('som', ligado === true),
  aoAbrirRelatorio: (fn) => ipcRenderer.on('abrir-relatorio', (_e, d) => fn(d)), // clique numa notificação
});
