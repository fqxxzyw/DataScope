import Papa from 'papaparse';
import type { Dataset, Settings } from './types';
export function parseDataset(
  text: string,
  name: string,
  size: number,
  delimiter: string,
  header: boolean,
  settings: Settings,
): Dataset {
  const warnings: string[] = [];
  text = text.replace(/^\uFEFF/, '');
  if (text.includes('\uFFFD'))
    warnings.push('发现 Unicode 替换字符，文件可能不是 UTF-8 编码。请核对原文件并转换编码。');
  if (!text.trim()) throw new Error('文件为空或仅包含空白字符。');
  let raw: string[][];
  if (name.toLowerCase().endsWith('.txt') && delimiter === 'auto') {
    raw = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((s) => [s.replace(/\r$/, '')]);
    if (raw.at(-1)?.[0] === '') raw.pop();
    header = false;
  } else {
    const result = Papa.parse<string[]>(text, {
      delimiter: delimiter === 'auto' ? '' : delimiter,
      skipEmptyLines: false,
    });
    const fatal = result.errors.filter((e) => e.code !== 'UndetectableDelimiter');
    if (fatal.length)
      throw new Error(
        `解析失败：${fatal[0].message}（记录 ${(fatal[0].row ?? 0) + 1}）。请检查引号或分隔符。`,
      );
    if (result.errors.some((e) => e.code === 'UndetectableDelimiter'))
      warnings.push('未检测到明确分隔符，按单列读取；可手动选择分隔符后重新导入。');
    raw = result.data;
    if (/\r?\n$/.test(text) && raw.at(-1)?.length === 1 && raw.at(-1)?.[0] === '') raw.pop();
  }
  const width = raw[0].length;
  if (raw.length * width > settings.maxCells)
    throw new Error(`超过 ${settings.maxCells.toLocaleString()} 单元格保护上限，请拆分文件。`);
  const mismatches = raw.map((r, i) => (r.length !== width ? i + 1 : 0)).filter(Boolean);
  if (mismatches.length)
    throw new Error(
      `有 ${mismatches.length} 条记录的字段数不一致，首个出现在记录 ${mismatches[0]}；请检查分隔符或补齐空字段。`,
    );
  const seen = new Set<string>();
  const headers = (
    header
      ? raw.shift()!
      : Array.from({ length: width }, (_, i) => (width === 1 ? 'text' : `column_${i + 1}`))
  ).map((s, i) => {
    const base = s.trim() || `column_${i + 1}`;
    let key = base,
      n = 2;
    while (seen.has(key)) key = `${base}_${n++}`;
    if (key !== s) warnings.push(`字段名 ${JSON.stringify(s)} 规范为 ${key}`);
    seen.add(key);
    return key;
  });
  if (!raw.length) throw new Error('只有表头，没有可分析的数据行。');
  return { name, size, headers, rows: raw, warnings };
}
