// Deterministic vector-style pulse mark; no binary assets or external image libraries needed.
const fs = require('node:fs');
const zlib = require('node:zlib');
const crc = (b) => {
  let n = 0xffffffff;
  for (const v of b) {
    n ^= v;
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  }
  return (n ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const type = Buffer.from(name),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  type.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([type, data])), data.length + 8);
  return out;
};
function png(size) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  const pts = [
    [49, 137],
    [90, 137],
    [110, 79],
    [143, 180],
    [165, 121],
    [207, 121],
  ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let sum = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) * 256) / size,
            py = ((y + (sy + 0.5) / 4) * 256) / size;
          const dx = Math.max(72 - px, 0, px - 184),
            dy = Math.max(72 - py, 0, py - 184);
          if (dx * dx + dy * dy > 3600) continue;
          let white = false;
          for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1],
              [bx, by] = pts[i],
              vx = bx - ax,
              vy = by - ay,
              t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
            if (Math.hypot(px - ax - t * vx, py - ay - t * vy) < 7.5) white = true;
          }
          const t = (px + py) / 512;
          const col = white ? [255, 255, 255] : [157 - 74 * t, 175 - 65 * t, 246 - 35 * t];
          for (let k = 0; k < 3; k++) sum[k] += col[k];
          sum[3]++;
        }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      if (sum[3]) for (let k = 0; k < 3; k++) pixels[i + k] = Math.round(sum[k] / sum[3]);
      pixels[i + 3] = Math.round((sum[3] / 16) * 255);
    }
  const h = Buffer.alloc(13);
  h.writeUInt32BE(size);
  h.writeUInt32BE(size, 4);
  h[8] = 8;
  h[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', h),
    chunk('IDAT', zlib.deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const sizes = [16, 24, 32, 48, 64, 128, 256],
  images = sizes.map(png),
  header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((b, i) => {
  const n = 6 + i * 16;
  header[n] = header[n + 1] = sizes[i] === 256 ? 0 : sizes[i];
  header.writeUInt16LE(1, n + 4);
  header.writeUInt16LE(32, n + 6);
  header.writeUInt32LE(b.length, n + 8);
  header.writeUInt32LE(offset, n + 12);
  offset += b.length;
});
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon.ico', Buffer.concat([header, ...images]));
fs.writeFileSync('electron/icon.png', images.at(-1));
