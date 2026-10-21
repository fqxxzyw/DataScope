// ZIP STORE with UTF-8 names and CRC32. No compression worker or external dependency.
export function makeZip(files: { name: string; content: string }[]): Uint8Array {
  const encode = new TextEncoder(),
    parts: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  const crc = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of data) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    const name = encode.encode(file.name),
      content = encode.encode(file.content),
      hash = crc(content);
    const local = new Uint8Array(30 + name.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, hash, true);
    v.setUint32(18, content.length, true);
    v.setUint32(22, content.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, content);
    const central = new Uint8Array(46 + name.length),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, hash, true);
    c.setUint32(20, content.length, true);
    c.setUint32(24, content.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    directory.push(central);
    centralSize += central.length;
    offset += local.length + content.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const p of [...parts, ...directory, end]) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}
