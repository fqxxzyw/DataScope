import Papa from 'papaparse';
import { LIMITS } from './defaults';
import type { Parsed, TextDocument } from './types';
export function parseText(text: string, name: string, header = true, whole = false): Parsed {
  text = text.replace(/^\uFEFF/, '');
  if (text.length > LIMITS.characters) throw new Error('文件超过 200 万字符，请先抽样');
  if (/\.txt$/i.test(name)) {
    const rows = (whole ? [text] : text.split(/\r?\n/)).filter((t) => t.trim()).map((t) => [t]);
    if (rows.length > LIMITS.documents) throw new Error('最多支持 10,000 条文本');
    return { name, headers: ['Text（自动命名）'], rows, generated: true };
  }
  if (!/\.(csv|tsv)$/i.test(name)) throw new Error('支持 TXT、CSV、TSV');
  const parsed = Papa.parse<string[]>(text, {
    delimiter: /\.tsv$/i.test(name) ? '\t' : ',',
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length) throw new Error('表格解析失败：' + parsed.errors[0].message);
  const rows = parsed.data;
  if (rows.length > LIMITS.documents + (header ? 1 : 0)) throw new Error('最多支持 10,000 条文本');
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (width > 200) throw new Error('最多 200 列，请先选择需要的字段');
  const first = header ? rows.shift() : undefined;
  const headers = Array.from(
    { length: width },
    (_, i) => `${first?.[i]?.trim() || `Column ${i + 1}（自动命名）`} [${i + 1}]`,
  );
  if (rows.length > LIMITS.documents) throw new Error('最多支持 10,000 条文本');
  if (rows.some((r) => r.length !== width))
    throw new Error('表格行的列数不一致，请检查分隔符与引号');
  return { name, headers, rows, generated: !header || !!first?.some((v) => !v.trim()) };
}
export function selectDocuments(
  parsed: Parsed,
  textColumn: number,
  labelColumn: number,
): TextDocument[] {
  if (textColumn < 0 || textColumn >= parsed.headers.length) throw new Error('请选择正文列');
  if (textColumn === labelColumn) throw new Error('正文列和标签列不能相同');
  return parsed.rows
    .filter((r) => r[textColumn]?.trim())
    .map((r) => ({ text: r[textColumn], ...(labelColumn >= 0 ? { label: r[labelColumn] } : {}) }));
}
