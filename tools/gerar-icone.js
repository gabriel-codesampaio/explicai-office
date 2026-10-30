// Gera o ícone do app (losango roxo da marca sobre fundo escuro) sem nenhuma imagem de terceiros nem dependência:
// escreve build/icone.png (256x256) e build/icone.ico (PNG embutido). Rodar: node tools/gerar-icone.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const N = 256, SS = 4; // tamanho e supersampling (suaviza as bordas)

// cor (r,g,b,a) do ponto (x, y) em [0, 1]
function cor(x, y) {
  const dx = Math.abs(x - 0.5), dy = Math.abs(y - 0.5);
  // fundo: quadrado de cantos arredondados
  const r = 0.18, cx = Math.max(0, dx - (0.5 - r)), cy = Math.max(0, dy - (0.5 - r));
  if (cx * cx + cy * cy > r * r) return [0, 0, 0, 0];
  let c = [20, 16, 31, 255];
  const d = dx + dy; // distância "de losango"
  if (d < 0.30) c = [139, 92, 246, 255]; // losango roxo
  if (d < 0.30 && d > 0.25) c = [167, 139, 250, 255]; // borda mais clara
  if (d < 0.12) c = [237, 233, 254, 255]; // miolo claro
  return c;
}

const px = Buffer.alloc(N * N * 4);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
      const [cr, cg, cb, ca] = cor((i + (si + 0.5) / SS) / N, (j + (sj + 0.5) / SS) / N);
      r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
    }
    const o = (j * N + i) * 4, n = SS * SS;
    px[o] = a ? Math.round(r / a) : 0; px[o + 1] = a ? Math.round(g / a) : 0; px[o + 2] = a ? Math.round(b / a) : 0; px[o + 3] = Math.round(a / n);
  }
}

// PNG mínimo (RGBA, 8 bits)
const crcTabela = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTabela[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii'), len = Buffer.alloc(4), cs = Buffer.alloc(4);
  len.writeUInt32BE(dados.length); cs.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, cs]);
}
const cab = Buffer.alloc(13); cab.writeUInt32BE(N, 0); cab.writeUInt32BE(N, 4); cab[8] = 8; cab[9] = 6;
const linhas = Buffer.alloc((N * 4 + 1) * N);
for (let j = 0; j < N; j++) { linhas[j * (N * 4 + 1)] = 0; px.copy(linhas, j * (N * 4 + 1) + 1, j * N * 4, (j + 1) * N * 4); }
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', cab), bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })), bloco('IEND', Buffer.alloc(0))]);

// ICO com o PNG embutido (256x256 usa largura/altura 0)
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; ico[8] = 0; ico[9] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);

const pasta = path.join(__dirname, '..', 'build');
fs.mkdirSync(pasta, { recursive: true });
fs.writeFileSync(path.join(pasta, 'icone.png'), png);
fs.writeFileSync(path.join(pasta, 'icone.ico'), Buffer.concat([ico, png]));
console.log('ok: build/icone.png e build/icone.ico (' + png.length + ' bytes)');
