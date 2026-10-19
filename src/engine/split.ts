import Papa from 'papaparse';
import type { Dataset } from './types';
import { validDate } from './statistics';
export interface SplitConfig {
  method: 'random' | 'stratified' | 'group' | 'time';
  train: number;
  validation: number;
  test: number;
  seed: number;
  column: string;
  label: string;
  leakageColumn: string;
  keepDuplicates: boolean;
}
export interface SplitResult {
  config: SplitConfig;
  subsets: {
    name: string;
    indexes: number[];
    labels: [string, number][];
    missing: number;
    duplicates: number;
  }[];
  warnings: string[];
  crossDuplicates: number;
  crossKeyOverlap: number;
  files: { name: string; content: string }[];
}
export function splitDataset(d: Dataset, c: SplitConfig): SplitResult {
  const ratios = [c.train, c.validation, c.test];
  if (
    ratios.some((v) => !Number.isFinite(v) || v < 0) ||
    Math.abs(ratios.reduce((s, v) => s + v, 0) - 100) > 1e-6 ||
    c.train <= 0
  )
    throw new Error('比例必须非负、总和为 100%，训练集必须大于 0');
  if (!Number.isSafeInteger(c.seed)) throw new Error('随机种子必须是安全整数');
  const j = d.headers.indexOf(c.column),
    labelIndex = d.headers.indexOf(c.label),
    keyIndex = d.headers.indexOf(c.leakageColumn),
    warnings: string[] = [];
  if (c.method !== 'random' && j < 0) throw new Error('请选择划分依据字段');
  let seed = c.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shuffle = <T>(a: T[]) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const subsets: number[][] = [[], [], []],
    targets = ratios.map((v) => (d.rows.length * v) / 100),
    allocate = (ids: number[]) => {
      const amounts = ratios.map((v) => Math.floor((ids.length * v) / 100));
      let remainder = ids.length - amounts.reduce((s, v) => s + v, 0);
      const order = ratios
        .map((v, i) => ({ i, f: (ids.length * v) / 100 - amounts[i] }))
        .sort((a, b) => b.f - a.f);
      for (const a of order) {
        if (!remainder) break;
        amounts[a.i]++;
        remainder--;
      }
      let offset = 0;
      amounts.forEach((n, i) => {
        for (let k = offset; k < offset + n; k++) subsets[i].push(ids[k]);
        offset += n;
      });
    };
  const indices = d.rows.map((_, i) => i);
  if (c.method === 'time') {
    if (d.rows.some((r) => !validDate(r[j].trim())))
      throw new Error('时间字段含缺失或无效日期，请先修复');
    const sorted = [...indices].sort(
      (a, b) =>
        Date.parse(d.rows[a][j].replaceAll('/', '-')) -
          Date.parse(d.rows[b][j].replaceAll('/', '-')) || a - b,
    );
    allocate(sorted);
    if (c.keepDuplicates)
      warnings.push('时间划分保持顺序优先，不启用重复组绑定。相同时间可能位于边界两侧。');
  } else if (c.method === 'group' || c.keepDuplicates) {
    if (c.method === 'stratified')
      throw new Error('严格分层与重复组绑定无法同时保证；请选择分层关闭绑定，或使用分组模式');
    const groups = new Map<string, number[]>();
    for (const i of indices) {
      const key = c.method === 'group' ? d.rows[i][j] : JSON.stringify(d.rows[i]);
      if (c.method === 'group' && !key.trim()) throw new Error('分组字段存在空值，请先处理');
      const g = groups.get(key) || [];
      g.push(i);
      groups.set(key, g);
    }
    const ordered = shuffle([...groups.values()]).sort((a, b) => b.length - a.length);
    for (const g of ordered) {
      let best = -1,
        deficit = -Infinity;
      for (let k = 0; k < 3; k++) {
        if (ratios[k] <= 0) continue;
        const remaining = targets[k] - subsets[k].length;
        if (remaining > deficit) {
          best = k;
          deficit = remaining;
        }
      }
      for (const i of g) subsets[best].push(i);
    }
    warnings.push('完整组分配优先，实际比例可能偏离目标；大组或少数组尤其明显。');
  } else if (c.method === 'stratified') {
    const groups = new Map<string, number[]>();
    for (const i of indices) {
      const v = d.rows[i][j];
      if (!v.trim()) throw new Error('分层标签存在空值，请先处理');
      const g = groups.get(v) || [];
      g.push(i);
      groups.set(v, g);
    }
    const quotas = targets.map(Math.floor);
    const quotaOrder = targets
      .map((v, i) => ({ i, fraction: v - quotas[i] }))
      .sort((a, b) => b.fraction - a.fraction);
    const extra = d.rows.length - quotas.reduce((a, b) => a + b, 0);
    for (let i = 0; i < extra; i++) quotas[quotaOrder[i].i]++;
    const strata = shuffle([...groups]).map(([label, g]) => {
      if (g.length < ratios.filter((r) => r > 0).length)
        warnings.push(`类别 ${label} 仅 ${g.length} 行，无法出现在每个非空子集。`);
      const ids = shuffle(g);
      const ideal = ratios.map((v) => (g.length * v) / 100);
      const amounts = ideal.map(Math.floor);
      amounts.forEach((n, k) => {
        quotas[k] -= n;
      });
      return { ids, ideal, amounts };
    });
    for (const stratum of strata) {
      const { ids, ideal, amounts } = stratum;
      let remaining = ids.length - amounts.reduce((a, b) => a + b, 0);
      while (remaining-- > 0) {
        const eligible = [0, 1, 2].filter((k) => quotas[k] > 0);
        eligible.sort(
          (a, b) => ideal[b] - amounts[b] - (ideal[a] - amounts[a]) || quotas[b] - quotas[a],
        );
        const k = eligible[0];
        amounts[k]++;
        quotas[k]--;
      }
      let offset = 0;
      amounts.forEach((n, k) => {
        for (let i = offset; i < offset + n; i++) subsets[k].push(ids[i]);
        offset += n;
      });
    }
    subsets.forEach((ids, k) => {
      subsets[k] = shuffle(ids);
    });
    warnings.push(
      '分层采用全局整数配额；小类别无法严格保持比例时优先保证总量，类别内比例可能略有偏差。',
    );
  } else allocate(shuffle(indices));
  const countOverlap = (key: (i: number) => string) => {
    const sets = new Map<string, Set<number>>();
    subsets.forEach((ids, k) =>
      ids.forEach((i) => {
        const v = key(i),
          set = sets.get(v) || new Set<number>();
        set.add(k);
        sets.set(v, set);
      }),
    );
    return [...sets.values()].filter((s) => s.size > 1).length;
  };
  const crossDuplicates = countOverlap((i) => JSON.stringify(d.rows[i])),
    crossKeyOverlap = keyIndex < 0 ? 0 : countOverlap((i) => d.rows[i][keyIndex]);
  if (crossDuplicates)
    warnings.push(`${crossDuplicates} 个完全重复记录键跨越多个子集，存在泄漏风险。`);
  if (crossKeyOverlap)
    warnings.push(`${crossKeyOverlap} 个审查字段值跨集；请核实是否代表同一文本或实体。`);
  const names = ['train', 'validation', 'test'];
  const reports = subsets.map((ids, k) => {
    if (ratios[k] > 0 && !ids.length) warnings.push(`${names[k]} 为空；数据太少或组过大。`);
    const counts = new Map<string, number>();
    let missing = 0;
    for (const i of ids) {
      for (const v of d.rows[i]) if (!v.trim()) missing++;
      if (labelIndex >= 0) {
        const v = d.rows[i][labelIndex];
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    const keys = new Set(ids.map((i) => JSON.stringify(d.rows[i])));
    return {
      name: names[k],
      indexes: ids,
      labels: [...counts].sort((a, b) => b[1] - a[1]),
      missing,
      duplicates: ids.length - keys.size,
    };
  });
  const files = reports.map((s) => ({
    name: `${s.name}.csv`,
    content: Papa.unparse(
      { fields: d.headers, data: s.indexes.map((i) => d.rows[i]) },
      { escapeFormulae: true },
    ),
  }));
  warnings.push(
    '划分不自动拟合归一化、填补或词表；这些参数应只在训练集拟合。标签分布图不验证语义正确性。',
  );
  return { config: c, subsets: reports, warnings, crossDuplicates, crossKeyOverlap, files };
}
