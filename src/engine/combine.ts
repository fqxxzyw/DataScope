import type { Dataset } from './types';
export interface CombineConfig {
  mode: 'append' | 'rows' | 'key';
  leftKey: string;
  rightKey: string;
  confirmOrder: boolean;
}
export function combineDatasets(
  left: Dataset,
  right: Dataset,
  c: CombineConfig,
  maxCells = 2000000,
): Dataset {
  const sources = [...(left.sources || [left.name]), ...(right.sources || [right.name])];
  if (c.mode === 'append') {
    if (
      left.headers.length !== right.headers.length ||
      left.headers.some((h) => !right.headers.includes(h))
    )
      throw new Error('追加要求列名一致，请先核对或重命名列。');
    if ((left.rows.length + right.rows.length) * left.headers.length > maxCells)
      throw new Error('合并后超过单元格保护上限');
    const indexes = left.headers.map((h) => right.headers.indexOf(h));
    return {
      ...left,
      name: `${left.name} + ${right.name}`,
      size: left.size + right.size,
      sources,
      rows: [...left.rows, ...right.rows.map((row) => indexes.map((i) => row[i]))],
      warnings: [...left.warnings, ...right.warnings, `已按相同列名追加 ${right.rows.length} 行。`],
      generatedHeaders: [
        ...new Set([...(left.generatedHeaders || []), ...(right.generatedHeaders || [])]),
      ],
    };
  }
  if (left.rows.length * (left.headers.length + right.headers.length) > maxCells)
    throw new Error('关联后超过单元格保护上限');
  const li = left.headers.indexOf(c.leftKey),
    ri = right.headers.indexOf(c.rightKey);
  const lookup = new Map<string, string[]>();
  if (c.mode === 'rows') {
    if (!c.confirmOrder) throw new Error('请确认两个文件的行顺序一一对应。');
    if (left.rows.length !== right.rows.length)
      throw new Error('按行关联要求行数完全一致，不会截断或自动补标签。');
  } else {
    if (li < 0 || ri < 0) throw new Error('请选择两个文件用于匹配的列。');
    for (const row of right.rows) {
      const key = row[ri];
      if (!key.trim()) throw new Error('标签文件匹配键存在空值。');
      if (lookup.has(key))
        throw new Error(`标签文件匹配键重复：${key}；请先去重，避免一对多扩展。`);
      lookup.set(key, row);
    }
  }
  const used = new Set(left.headers);
  const added = right.headers.map((h) => {
    let name = h;
    let i = 2;
    while (used.has(name)) name = `${h}_${i++}`;
    used.add(name);
    return name;
  });
  let matched = 0;
  const rows = left.rows.map((row, i) => {
    const other = c.mode === 'rows' ? right.rows[i] : lookup.get(row[li]);
    if (other) matched++;
    return [...row, ...(other || right.headers.map(() => ''))];
  });
  return {
    name: `${left.name} + ${right.name}`,
    size: left.size + right.size,
    sources,
    headers: [...left.headers, ...added],
    rows,
    generatedHeaders: [
      ...(left.generatedHeaders || []),
      ...added.filter((_, i) => right.generatedHeaders?.includes(right.headers[i])),
    ],
    warnings: [
      ...left.warnings,
      ...right.warnings,
      `关联完成：匹配 ${matched} 行，未匹配 ${left.rows.length - matched} 行。保留主表所有行；未匹配字段为空白。匹配按原字符串精确比较。`,
    ],
  };
}
