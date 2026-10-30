# Testes de interface (janela real do Electron)

Abrem o app de verdade contra uma pasta `~/.claude` **falsa** (nunca tocam na sua) e conferem mouse, teclado e avisos.

- `npm run test:ui`: `interface.js` (hover, clique, teclado, escala, áreas) e `avisos.js` (notificação com `Notification` de teste).
- `npm run test:exe`: `exe.js` abre o `.exe` portátil de `dist/` e confere que lista dados e abre o relatório (rode `npm run dist` antes).
- `captura.js <modo> <saida.png>`: salva capturas da janela (modos: ocupado, desligado, vazio, lista; variáveis: `DPR`, `CHAMAR`, `SCROLL`, `FRAMES`...).
- `cpu.js`: mede o uso de CPU em 3 situações.

Precisam da janela **em foco** (os scripts chamam `show()` e `focus()`); não use o computador durante a execução.
