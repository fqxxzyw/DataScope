import type { Dataset } from './types';
export interface CombineConfig {
  mode: 'append' | 'rows' | 'key' | 'classes';
  indexBase?: 0 | 1;
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
  if (c.mode === 'classes') return mapClassList(left, right, c, maxCells);
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
  const leftNames = left.headers.map((h) => `${left.name} · ${h}`);
  const used = new Set(leftNames);
  const added = right.headers.map((h) => {
    let name = `${right.name} · ${h}`;
    let i = 2;
    while (used.has(name)) name = `${right.name} · ${h}_${i++}`;
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
    headers: [...leftNames, ...added],
    rows,
    generatedHeaders: [
      ...leftNames.filter((_, i) => left.generatedHeaders?.includes(left.headers[i])),
      ...added.filter((_, i) => right.generatedHeaders?.includes(right.headers[i])),
    ],
    warnings: [
      ...left.warnings,
      ...right.warnings,
      `关联完成：匹配 ${matched} 行，未匹配 ${left.rows.length - matched} 行。保留主表所有行；未匹配字段为空白。匹配按原字符串精确比较。`,
    ],
  };
}

/** Class-list order is an explicit ID convention, never a row-wise sample join. */
export function mapClassList(
  left: Dataset,
  right: Dataset,
  c: CombineConfig,
  maxCells = 2000000,
): Dataset {
  if (!c.confirmOrder) throw new Error('请确认类别编号起点及 class 文件的类别顺序。');
  if (right.headers.length !== 1)
    throw new Error('类别列表应为一列类别名称；有编号列的字典请使用按键匹配。');
  const li = left.headers.indexOf(c.leftKey);
  if (li < 0) throw new Error('请选择主数据中的类别编号列。');
  if ((left.headers.length + 1) * left.rows.length > maxCells)
    throw new Error('映射后超过单元格保护上限');
  const classes = right.rows.map((r) => r[0].trim());
  if (!classes.length || classes.some((v) => !v)) throw new Error('类别列表不能包含空类别。');
  if (new Set(classes).size !== classes.length)
    throw new Error('类别列表存在重复名称，请检查类别顺序。');
  const base = c.indexBase ?? 0;
  const names = left.headers.map((h) => `${left.name} · ${h}`);
  let label = `${right.name} · Label`;
  while (names.includes(label)) label += '_class';
  const rows = left.rows.map((row, i) => {
    const raw = row[li].trim();
    const index = Number(raw) - base;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(index) || index < 0 || index >= classes.length)
      throw new Error(
        `第 ${i + 1} 行的编号「${raw}」不在 ${base}–${classes.length - 1 + base} 范围，请检查编号起点。`,
      );
    return [...row, classes[index]];
  });
  return {
    ...left,
    name: `${left.name} + ${right.name}`,
    headers: [...names, label],
    rows,
    sources: [...(left.sources || [left.name]), right.name],
    size: left.size + right.size,
    generatedHeaders: [
      ...names.filter((_, i) => left.generatedHeaders?.includes(left.headers[i])),
      label,
    ],
    warnings: [
      ...left.warnings,
      `已映射 ${rows.length} 条样本：${base} → ${classes[0]}；保留原编号，并新增 ${label}。未合并其他训练/验证/测试文件。`,
    ],
  };
}
