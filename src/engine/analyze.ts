import {
  defaults,
  type Settings,
  type Dataset,
  type Column,
  type ColumnType,
  type Report,
  type DataIssue,
  type IssueType,
} from './types';
import { numeric, stats, quantile, validDate, pearson } from './statistics';
import { wordFrequency } from './text';
const missingTokens = new Set(['null', 'none', 'nan', 'n/a', 'na', 'undefined']);
export function normalizeSettings(input: Partial<Settings>): Settings {
  const s = { ...defaults };
  for (const k of Object.keys(s) as (keyof Settings)[])
    if (Number.isFinite(input[k])) s[k] = input[k]!;
  s.shortText = Math.max(0, Math.min(100, s.shortText));
  s.longPercentile = Math.max(50, Math.min(100, s.longPercentile));
  s.categoryRatio = Math.max(0.001, Math.min(1, s.categoryRatio));
  s.idRatio = Math.max(0.5, Math.min(1, s.idRatio));
  s.imbalance = Math.max(1, Math.min(1000, s.imbalance));
  s.numericRatio = Math.max(0.5, Math.min(1, s.numericRatio));
  s.maxCells = defaults.maxCells;
  s.maxFileMB = defaults.maxFileMB;
  s.correlationColumns = defaults.correlationColumns;
  return s;
}
export function infer(name: string, values: string[], settings: Settings): ColumnType {
  const a = values.filter((v) => v.trim() !== ''),
    n = a.length;
  if (!n) return 'Unknown';
  const unique = new Set(a).size,
    ratio = unique / n;
  if (a.every((v) => /^(true|false|yes|no)$/i.test(v.trim()))) return 'Boolean';
  if (a.every((v) => validDate(v.trim()))) return 'Date';
  if (/(^id$|[_-]id$|编号|序号|编码)/i.test(name) && ratio >= settings.idRatio) return 'ID';
  if (a.some((v) => /^0\d+$/.test(v)) && ratio >= settings.idRatio) return 'ID';
  if (/label|target|class|category|类别|标签/i.test(name)) return 'Categorical';
  if (a.filter((v) => numeric(v) !== null).length / n >= settings.numericRatio) return 'Numeric';
  if (/text|sentence|review|content|评论|文本|正文/i.test(name)) return 'Text';
  if (/label|target|class|category|类别|标签/i.test(name)) return 'Categorical';
  if (unique <= settings.maxCategories || ratio <= settings.categoryRatio) return 'Categorical';
  if (ratio >= settings.idRatio && a.every((v) => /^[\w-]{6,64}$/.test(v))) return 'ID';
  return 'Text';
}
export function analyze(
  data: Dataset,
  input: Settings,
  overrides: Record<string, ColumnType> = {},
  target?: string,
  progress?: (value: number, message: string) => void,
): Report {
  const settings = normalizeSettings(input),
    N = data.rows.length,
    issues: DataIssue[] = [];
  const add = (
    type: IssueType,
    title: string,
    description: string,
    suggestion: string,
    rows: number[],
    column?: string,
    severity: DataIssue['severity'] = 'warning',
  ) =>
    issues.push({
      id: JSON.stringify([type, column]),
      type,
      severity,
      column,
      affectedRows: rows.length,
      ratio: rows.length / N,
      title,
      description,
      suggestion,
      rows,
    });
  const columns: Column[] = data.headers.map((name, j) => {
    progress?.(
      35 + Math.round((j / data.headers.length) * 45),
      `分析字段 ${j + 1} / ${data.headers.length}`,
    );
    const values = data.rows.map((r) => r[j]);
    const type = overrides[name] || infer(name, values, settings);
    const counts = new Map<string, number>(),
      tokens = new Map<string, number>();
    const missingRows: number[] = [],
      tokenRows: number[] = [];
    values.forEach((v, i) => {
      if (!v.trim()) missingRows.push(i);
      else {
        counts.set(v, (counts.get(v) || 0) + 1);
        if (missingTokens.has(v.trim().toLowerCase())) {
          tokens.set(v, (tokens.get(v) || 0) + 1);
          tokenRows.push(i);
        }
      }
    });
    const nonNull = N - missingRows.length;
    const c: Column = {
      name,
      type,
      missing: missingRows.length,
      nonNull,
      unique: counts.size,
      duplicateValues: nonNull - counts.size,
      tokens: [...tokens],
      counts: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 100),
      outliers: [],
      short: [],
      long: [],
      invalid: [],
      missingRows,
      tokenRows,
    };
    if (c.missing)
      add(
        'missing_value',
        '存在空白单元格',
        `${c.missing} 行为空白；占全部行 ${((100 * c.missing) / N).toFixed(1)}%。`,
        '建议检查缺失原因；标签缺失可优先回查标注，数值填补方案应只在训练集上拟合。',
        missingRows,
        name,
        'error',
      );
    if (tokenRows.length)
      add(
        'missing_token',
        '疑似缺失标记',
        `${tokenRows.length} 行包含 N/A、null 等字符串；尚未转换为空值。`,
        '建议确认这些标记的业务含义，再决定是否统一为缺失值。',
        tokenRows,
        name,
      );
    if (counts.size === 1)
      add(
        'constant',
        '常量字段',
        '非空值只有一种。',
        '可以考虑核实采集逻辑；确认无业务价值后再决定是否保留。',
        values.flatMap((v, i) => (v.trim() ? [i] : [])),
        name,
        'info',
      );
    if (type === 'ID')
      add(
        'potential_id',
        '可能是标识符',
        '唯一值比例高，可能标识样本而非描述样本。',
        '建议确认是否作为分组依据；划分训练/测试集时避免同一实体泄漏。',
        values.flatMap((v, i) => (v.trim() ? [i] : [])),
        name,
        'info',
      );
    if (
      type === 'Categorical' &&
      counts.size > settings.maxCategories &&
      counts.size / nonNull > settings.categoryRatio
    )
      add(
        'high_cardinality',
        '高基数类别',
        '类别数较多，可能接近标识符。',
        '建议检查类别定义及稀有类别；编码时注意未知类别和数据泄漏。',
        values.flatMap((v, i) => (v.trim() ? [i] : [])),
        name,
      );
    const valid = values.map(numeric);
    const numericCount = valid.filter((v) => v !== null).length;
    if (type === 'Numeric') {
      c.stats = stats(valid.filter((v): v is number => v !== null));
      c.invalid = values.flatMap((v, i) => (v.trim() && valid[i] === null ? [i] : []));
      const { q1, q3 } = c.stats;
      if (q1 !== null && q3 !== null) {
        const iqr = q3 - q1;
        c.outliers = valid.flatMap((v, i) =>
          v !== null && (v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr) ? [i] : [],
        );
      }
      if (c.outliers.length)
        add(
          'numeric_outlier',
          'IQR 潜在异常值',
          '超过 Q1−1.5×IQR 或 Q3+1.5×IQR；不代表数据一定错误。',
          '建议检查单位、量程与录入记录；真实极端值可能需要保留。',
          c.outliers,
          name,
        );
    } else if (type === 'Date')
      c.invalid = values.flatMap((v, i) => (v.trim() && !validDate(v.trim()) ? [i] : []));
    else if (type === 'Boolean')
      c.invalid = values.flatMap((v, i) =>
        v.trim() && !/^(true|false|yes|no)$/i.test(v.trim()) ? [i] : [],
      );
    else if (numericCount > 0 && numericCount < nonNull)
      c.invalid = values.flatMap((v, i) => (v.trim() && valid[i] === null ? [i] : []));
    if (c.invalid.length)
      add(
        'mixed_type',
        '类型或格式需要复核',
        `${c.invalid.length} 行不符合当前类型或数值格式；疑似混合类型并不一定是错误。`,
        '建议检查单位后缀、小数符号和缺失标记；必要时手动更改字段类型。',
        c.invalid,
        name,
      );
    if (type === 'Text') {
      const lengths = values.map((v) => Array.from(v).length);
      c.length = stats(lengths);
      const threshold = quantile(
        [...lengths].sort((a, b) => a - b),
        settings.longPercentile / 100,
      )!;
      c.short = lengths.flatMap((v, i) => (v <= settings.shortText ? [i] : []));
      c.long = lengths.flatMap((v, i) => (v > threshold ? [i] : []));
      if (c.short.length)
        add(
          'short_text',
          '空白或过短文本',
          `字符数 ≤ ${settings.shortText}；按 Unicode 码点计数。`,
          '建议抽查语义是否完整；短文本可能有效，不建议仅按长度删除。',
          c.short,
          name,
        );
      if (c.long.length)
        add(
          'long_text',
          '超长文本',
          `超过 P${settings.longPercentile}（${threshold.toFixed(1)} 字符）。`,
          '建议核对是否拼接异常；结合模型上下文长度决定截断或分段策略。',
          c.long,
          name,
        );
    }
    return c;
  });
  const groups = new Map<string, number[]>();
  data.rows.forEach((r, i) => {
    const key = JSON.stringify(r);
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  });
  const duplicates = [...groups.values()].filter((g) => g.length > 1),
    duplicateCount = duplicates.reduce((s, g) => s + g.length - 1, 0);
  if (duplicates.length)
    add(
      'duplicate',
      '完全重复样本',
      `${duplicateCount} 条为首条以外的重复副本；${duplicates.flat().length} 条记录属于重复组。`,
      '建议检查是否为合法重复观测；若是重复采集，可考虑去重，并在数据划分前检查泄漏。',
      duplicates.flat(),
    );
  const label = columns.find((c) => c.name === target && c.type === 'Categorical');
  if (label) {
    const j = data.headers.indexOf(label.name),
      counts = new Map<string, number>();
    data.rows.forEach((r) => {
      if (r[j].trim()) counts.set(r[j], (counts.get(r[j]) || 0) + 1);
    });
    const a = [...counts.values()];
    if (a.length > 1) {
      const ratio =
        a.reduce((m, v) => Math.max(m, v), 0) / a.reduce((m, v) => Math.min(m, v), Infinity);
      if (ratio >= settings.imbalance)
        add(
          'class_imbalance',
          '标签分布不均衡',
          `最大/最小类别比 ${ratio.toFixed(2)}×。${N < 100 ? '样本少于 100，比例可能不稳定。' : ''}`,
          '建议先检查标签质量与业务基率；考虑分层划分、宏平均 F1 和类别召回率，再评估类别权重。',
          data.rows.flatMap((r, i) => (r[j].trim() ? [i] : [])),
          label.name,
        );
    }
  }
  progress?.(85, '计算相关性与建议');
  const numericCols = columns
      .filter((c) => c.type === 'Numeric')
      .slice(0, settings.correlationColumns),
    correlations: Report['correlations'] = [];
  for (const x of numericCols)
    for (const y of numericCols) {
      const xi = data.headers.indexOf(x.name),
        yi = data.headers.indexOf(y.name);
      const pairs = data.rows.flatMap((r) => {
        const a = numeric(r[xi]),
          b = numeric(r[yi]);
        return a === null || b === null ? [] : [[a, b] as [number, number]];
      });
      correlations.push({ x: x.name, y: y.name, ...pearson(pairs) });
    }
  const missing = columns.reduce((s, c) => s + c.missing, 0),
    invalid = columns
      .filter((c) => ['Numeric', 'Date', 'Boolean'].includes(c.type))
      .reduce((s, c) => s + c.invalid.length, 0);
  const penalties = [
    { label: '空白单元格：50 × 缺失率', value: (50 * missing) / (N * columns.length) },
    { label: '重复副本：30 × 重复率', value: (30 * duplicateCount) / N },
    {
      label: '目标严重不均衡：固定 10 分',
      value: issues.some((i) => i.type === 'class_imbalance') ? 10 : 0,
    },
    { label: '类型无效值：10 × 无效比例', value: (10 * invalid) / (N * columns.length) },
  ];
  const wordSummary: Report['wordSummary'] = Object.create(null);
  for (const c of columns.filter((c) => c.type === 'Text'))
    wordSummary[c.name] = wordFrequency(
      data.rows.map((r) => r[data.headers.indexOf(c.name)]),
      'word',
      true,
      100,
    ).words;
  return {
    generatedHeaders: data.generatedHeaders,
    sources: data.sources,
    name: data.name,
    size: data.size,
    createdAt: new Date().toISOString(),
    rowCount: N,
    columns,
    duplicates,
    duplicateCount,
    missing,
    issues: issues.sort(
      (a, b) =>
        ({ error: 0, warning: 1, info: 2 })[a.severity] -
        { error: 0, warning: 1, info: 2 }[b.severity],
    ),
    score: Math.max(0, Math.round(100 - penalties.reduce((s, p) => s + p.value, 0))),
    penalties,
    correlations,
    target: label?.name,
    settings,
    warnings: [
      ...data.warnings,
      ...(columns.filter((c) => c.type === 'Numeric').length > settings.correlationColumns
        ? [`相关性仅计算前 ${settings.correlationColumns} 个数值字段。`]
        : []),
    ],
    wordSummary,
  };
}
