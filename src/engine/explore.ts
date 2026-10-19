import type { Dataset } from './types';
import { numeric, stats, pearson } from './statistics';
export interface ExploreConfig {
  chart: 'bar' | 'histogram' | 'scatter' | 'line' | 'box' | 'missing' | 'crosstab';
  x: string;
  y: string;
  group: string;
  aggregate: 'count' | 'mean' | 'sum';
  limit: number;
}
export interface ExploreResult {
  kind: ExploreConfig['chart'];
  categories: string[];
  series: { name: string; data: number[] | [number, number][] }[];
  warnings: string[];
  valid: number;
  r?: number | null;
}
export function explore(d: Dataset, c: ExploreConfig): ExploreResult {
  const x = d.headers.indexOf(c.x),
    y = d.headers.indexOf(c.y),
    g = d.headers.indexOf(c.group),
    limit = Math.max(5, Math.min(100, Math.floor(c.limit) || 20));
  const r: ExploreResult = { kind: c.chart, categories: [], series: [], warnings: [], valid: 0 };
  if (c.chart === 'missing') {
    r.categories = d.headers;
    r.series = [
      {
        name: '空白',
        data: d.headers.map((_, j) => d.rows.filter((row) => !row[j].trim()).length),
      },
    ];
    r.valid = d.rows.length;
    return r;
  }
  if (x < 0) throw new Error('请选择 X 字段');
  if (c.chart === 'histogram' || c.chart === 'box') {
    const a = d.rows.map((row) => numeric(row[x])).filter((v): v is number => v !== null),
      s = stats(a);
    r.valid = a.length;
    if (!a.length) throw new Error('所选字段没有可用有限数值');
    if (c.chart === 'histogram') {
      r.categories = s.histogram.map((b) => b.label);
      r.series = [{ name: c.x, data: s.histogram.map((b) => b.count) }];
    } else {
      r.categories = [c.x];
      r.series = [{ name: c.x, data: [s.min!, s.q1!, s.median!, s.q3!, s.max!] }];
    }
    r.warnings.push(`排除 ${d.rows.length - a.length} 行空白或非数值。箱线须线采用最小/最大值。`);
    return r;
  }
  if (c.chart === 'scatter' || c.chart === 'line') {
    if (y < 0) throw new Error('请选择 Y 数值字段');
    const groups = new Map<string, [number, number][]>(),
      pairs: [number, number][] = [];
    for (const row of d.rows) {
      const a = numeric(row[x]),
        b = numeric(row[y]);
      if (a === null || b === null) continue;
      pairs.push([a, b]);
      const key = g < 0 ? '全部' : row[g],
        list = groups.get(key) || [];
      list.push([a, b]);
      groups.set(key, list);
    }
    r.valid = pairs.length;
    r.r = pearson(pairs).r;
    if (!pairs.length) throw new Error('X / Y 没有成对有效的有限数值');
    let budget = 5000;
    for (const [name, points] of [...groups].slice(0, 10)) {
      const ordered = c.chart === 'line' ? [...points].sort((a, b) => a[0] - b[0]) : points;
      const sampled =
        ordered.length <= budget
          ? ordered
          : Array.from(
              { length: Math.max(0, budget) },
              (_, i) => ordered[Math.floor((i * ordered.length) / budget)],
            );
      r.series.push({ name, data: sampled });
      budget -= sampled.length;
    }
    r.warnings.push(
      `统计使用全部 ${pairs.length} 对样本；图最多 5000 点、10 个分组，按固定间隔抽样。折线按 X 数值排序连接，不代表因果。`,
    );
    return r;
  }
  const all = new Map<string, Map<string, number[]>>();
  for (const row of d.rows) {
    if (!row[x].trim()) continue;
    const value =
      c.aggregate === 'count' || c.chart === 'crosstab' ? 1 : y >= 0 ? numeric(row[y]) : null;
    if (value === null) continue;
    const group = g < 0 ? '全部' : row[g],
      category = row[x];
    const byGroup = all.get(category) || new Map<string, number[]>();
    const values = byGroup.get(group) || [];
    values.push(value);
    byGroup.set(group, values);
    all.set(category, byGroup);
    r.valid++;
  }
  if (!r.valid) throw new Error('所选字段没有可聚合记录，请检查 Y 字段或聚合方式');
  r.categories = [...all]
    .sort(
      (a, b) =>
        [...b[1].values()].reduce((s, a) => s + a.length, 0) -
        [...a[1].values()].reduce((s, a) => s + a.length, 0),
    )
    .slice(0, limit)
    .map(([k]) => k);
  const groups = [...new Set([...all.values()].flatMap((m) => [...m.keys()]))].slice(0, 10);
  for (const name of groups) {
    r.series.push({
      name,
      data: r.categories.map((key) => {
        const a = all.get(key)!.get(name) || [];
        if (c.aggregate === 'count' || c.chart === 'crosstab') return a.length;
        const mean = stats(a).mean || 0;
        const value = c.aggregate === 'mean' ? mean : mean * a.length;
        if (!Number.isFinite(value))
          throw new Error('聚合值超出有限数值范围，请调整单位或选择均值');
        return value;
      }),
    });
  }
  r.warnings.push(`类别按样本量排序，仅绘制前 ${limit} 类和前 10 组；统计有效行 ${r.valid}。`);
  return r;
}
export interface EvaluateResult {
  task: 'classification' | 'regression';
  n: number;
  excluded: number;
  metrics: [string, number][];
  labels: string[];
  confusion: number[][];
  perClass: { label: string; precision: number; recall: number; f1: number; support: number }[];
  residuals: [number, number][];
  warnings: string[];
}
export function evaluatePredictions(
  d: Dataset,
  truth: string,
  prediction: string,
  task: 'classification' | 'regression',
): EvaluateResult {
  const t = d.headers.indexOf(truth),
    p = d.headers.indexOf(prediction);
  if (t < 0 || p < 0 || t === p) throw new Error('请选择不同的真实标签列与预测结果列');
  const r: EvaluateResult = {
    task,
    n: 0,
    excluded: 0,
    metrics: [],
    labels: [],
    confusion: [],
    perClass: [],
    residuals: [],
    warnings: [],
  };
  if (task === 'regression') {
    const pairs = d.rows.flatMap((row) => {
      const a = numeric(row[t]),
        b = numeric(row[p]);
      return a === null || b === null ? [] : [[a, b] as [number, number]];
    });
    r.n = pairs.length;
    r.excluded = d.rows.length - r.n;
    if (!r.n) throw new Error('没有有效数值预测对');
    const actual = pairs.map(([a]) => a),
      mean = stats(actual).mean!;
    let mae = 0,
      mse = 0,
      sst = 0;
    for (const [a, b] of pairs) {
      const e = b - a;
      mae += Math.abs(e) / r.n;
      mse += (e * e) / r.n;
      sst += (a - mean) ** 2;
    }
    if (![mae, mse, sst].every(Number.isFinite))
      throw new Error('误差统计超出有限数值范围，请先缩放数值');
    r.metrics = [
      ['MAE', mae],
      ['RMSE', Math.sqrt(mse)],
    ];
    if (sst > 0) r.metrics.push(['R²', 1 - (mse * r.n) / sst]);
    else r.warnings.push('真实值为常量，R² 未定义。');
    r.residuals = pairs.slice(0, 5000).map(([a, b]) => [a, b - a]);
    r.warnings.push('残差图最多前 5000 对；指标使用全部有效对。');
    return r;
  }
  const pairs = d.rows.flatMap((row) => (row[t].trim() && row[p].trim() ? [[row[t], row[p]]] : []));
  r.n = pairs.length;
  r.excluded = d.rows.length - r.n;
  if (!r.n) throw new Error('没有非空标签预测对');
  r.labels = [...new Set(pairs.flat())].sort();
  if (r.labels.length > 100)
    throw new Error('超过 100 类，混淆矩阵不适合直接展示；请筛选类别或确认任务类型');
  const indexes = new Map(r.labels.map((l, i) => [l, i]));
  r.confusion = r.labels.map(() => r.labels.map(() => 0));
  let correct = 0;
  for (const [a, b] of pairs) {
    r.confusion[indexes.get(a)!][indexes.get(b)!]++;
    if (a === b) correct++;
  }
  r.perClass = r.labels.map((label, i) => {
    const tp = r.confusion[i][i],
      support = r.confusion[i].reduce((a, b) => a + b, 0),
      pred = r.confusion.reduce((s, row) => s + row[i], 0),
      precision = pred ? tp / pred : 0,
      recall = support ? tp / support : 0;
    return {
      label,
      precision,
      recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
      support,
    };
  });
  r.metrics = [
    ['Accuracy', correct / r.n],
    ['Macro F1', r.perClass.reduce((s, v) => s + v.f1, 0) / r.labels.length],
    ['Weighted F1', r.perClass.reduce((s, v) => s + v.f1 * v.support, 0) / r.n],
  ];
  r.warnings.push(
    '分类按标签字符串精确匹配，不把概率列自动阈值化；零分母 precision/recall 记 0，宏平均涵盖真实与预测标签的并集。',
  );
  return r;
}
