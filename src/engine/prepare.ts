import type { Dataset } from './types';
import { numeric, stats, validDate } from './statistics';
export type PrepOperation =
  | 'filter'
  | 'select'
  | 'rename'
  | 'deduplicate'
  | 'drop_missing'
  | 'fill_missing'
  | 'replace'
  | 'trim'
  | 'lower'
  | 'upper'
  | 'normalize'
  | 'collapse'
  | 'length'
  | 'arithmetic'
  | 'date_part'
  | 'sort'
  | 'sample'
  | 'aggregate'
  | 'scale'
  | 'clip'
  | 'label_encode'
  | 'one_hot';
export interface PrepStep {
  id: string;
  operation: PrepOperation;
  column: string;
  columns: string[];
  other: string;
  value: string;
  name: string;
  method: string;
}
export const operations: Record<PrepOperation, string> = {
  filter: '条件筛选行',
  select: '选择 / 排序保留列',
  rename: '重命名列',
  deduplicate: '按选定列去重',
  drop_missing: '删除选定列为空的行',
  fill_missing: '填补缺失值',
  replace: '查找替换 / 缺失标记转换',
  trim: '去除首尾空白',
  lower: '转小写',
  upper: '转大写',
  normalize: 'Unicode NFC 规范化',
  collapse: '合并连续空白',
  length: '生成文本长度列',
  arithmetic: '两数值列运算',
  date_part: '提取日期部分',
  sort: '按字段排序',
  sample: '固定种子抽样',
  aggregate: '分组聚合',
  scale: '数值标准化 / 归一化',
  clip: '数值区间裁剪',
  label_encode: '类别标签编码',
  one_hot: 'One-hot 编码',
};
export interface PrepResult {
  dataset: Dataset;
  audit: {
    operation: string;
    before: number;
    after: number;
    changedRows: number;
    detail: string;
  }[];
  warnings: string[];
}
export function prepare(source: Dataset, steps: PrepStep[]): PrepResult {
  if (!steps.length) throw new Error('请先添加整理步骤');
  if (steps.length > 30) throw new Error('每个配方最多 30 步，请分批处理');
  let d: Dataset = {
    ...source,
    headers: [...source.headers],
    rows: source.rows.map((r) => [...r]),
    warnings: [...source.warnings],
  };
  const audit: PrepResult['audit'] = [],
    warnings: string[] = [];
  for (const step of steps) {
    const before = d.rows.length,
      oldRows = d.rows,
      oldHeaders = d.headers;
    let changedRows = 0,
      detail = '';
    const j = d.headers.indexOf(step.column),
      k = d.headers.indexOf(step.other);
    const requireCol = () => {
      if (j < 0) throw new Error(`字段不存在：${step.column || '未选择'}`);
    };
    const ids = step.columns.map((c) => {
      const i = d.headers.indexOf(c);
      if (i < 0) throw new Error(`字段不存在：${c}`);
      return i;
    });
    const name = () => {
      if (!step.name.trim() || d.headers.includes(step.name))
        throw new Error('新列名不能为空或与现有列冲突');
      return step.name;
    };
    const transform = (fn: (v: string, row: string[]) => string) => {
      requireCol();
      d.rows = d.rows.map((row) => {
        const value = fn(row[j], row);
        if (value !== row[j]) changedRows++;
        const copy = [...row];
        copy[j] = value;
        return copy;
      });
    };
    try {
      switch (step.operation) {
        case 'filter': {
          requireCol();
          d.rows = d.rows.filter((row) => {
            const v = row[j],
              a = numeric(v),
              b = numeric(step.value);
            switch (step.method) {
              case 'eq':
                return v === step.value;
              case 'ne':
                return v !== step.value;
              case 'contains':
                return v.includes(step.value);
              case 'not_contains':
                return !v.includes(step.value);
              case 'empty':
                return !v.trim();
              case 'not_empty':
                return !!v.trim();
              case 'gt':
              case 'gte':
              case 'lt':
              case 'lte':
                if (b === null) throw new Error('数值筛选阈值无效');
                return (
                  a !== null &&
                  (step.method === 'gt'
                    ? a > b
                    : step.method === 'gte'
                      ? a >= b
                      : step.method === 'lt'
                        ? a < b
                        : a <= b)
                );
              default:
                throw new Error('请选择筛选条件');
            }
          });
          changedRows = before - d.rows.length;
          break;
        }
        case 'select':
          if (!ids.length) throw new Error('至少保留一列');
          d = { ...d, headers: step.columns, rows: d.rows.map((r) => ids.map((i) => r[i])) };
          changedRows = before;
          break;
        case 'rename':
          requireCol();
          d.headers = d.headers.map((h, i) => (i === j ? name() : h));
          detail = `${step.column} → ${step.name}`;
          break;
        case 'deduplicate': {
          const selected = ids.length ? ids : d.headers.map((_, i) => i),
            seen = new Set<string>();
          d.rows = d.rows.filter((row) => {
            const key = JSON.stringify(selected.map((i) => row[i]));
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          changedRows = before - d.rows.length;
          break;
        }
        case 'drop_missing': {
          if (!ids.length) throw new Error('请选择检查缺失的列');
          d.rows = d.rows.filter((row) => ids.every((i) => row[i].trim()));
          changedRows = before - d.rows.length;
          break;
        }
        case 'fill_missing': {
          requireCol();
          let value = step.value;
          if (step.method === 'mean' || step.method === 'median') {
            const a = d.rows.map((r) => numeric(r[j])).filter((v): v is number => v !== null);
            if (!a.length) throw new Error('无有效数值用于填补');
            const s = stats(a);
            value = String(step.method === 'mean' ? s.mean : s.median);
            detail = `拟合填充值 ${value}`;
            warnings.push(
              '统计填补值由当前完整工作集拟合；用于模型评估时应先划分，仅在训练集拟合。',
            );
          } else if (step.method === 'mode') {
            const counts = new Map<string, number>();
            d.rows.forEach((r) => {
              if (r[j].trim()) counts.set(r[j], (counts.get(r[j]) || 0) + 1);
            });
            if (!counts.size) throw new Error('无非空值用于众数填补');
            value = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
            detail = `众数 ${value}`;
          }
          transform((v) => (v.trim() ? v : value));
          break;
        }
        case 'replace':
          transform((v) =>
            step.method === 'contains'
              ? v.split(step.value).join(step.name)
              : v === step.value
                ? step.name
                : v,
          );
          break;
        case 'trim':
          transform((v) => v.trim());
          break;
        case 'lower':
          transform((v) => v.toLowerCase());
          break;
        case 'upper':
          transform((v) => v.toUpperCase());
          break;
        case 'normalize':
          transform((v) => v.normalize('NFC'));
          break;
        case 'collapse':
          transform((v) => v.replace(/\s+/g, ' '));
          break;
        case 'length':
          requireCol();
          d.headers = [...d.headers, name()];
          d.rows = d.rows.map((r) => [...r, String(Array.from(r[j]).length)]);
          changedRows = before;
          break;
        case 'arithmetic': {
          requireCol();
          if (k < 0) throw new Error('请选择第二个数值列');
          d.headers = [...d.headers, name()];
          d.rows = d.rows.map((r) => {
            const a = numeric(r[j]),
              b = numeric(r[k]);
            if (a === null || b === null) return [...r, ''];
            const v =
              step.method === 'add'
                ? a + b
                : step.method === 'subtract'
                  ? a - b
                  : step.method === 'multiply'
                    ? a * b
                    : step.method === 'divide'
                      ? a / b
                      : NaN;
            if (!Number.isFinite(v)) throw new Error('运算产生非有限值或除零，请先筛选或填补');
            return [...r, String(v)];
          });
          changedRows = before;
          warnings.push('派生数值列对无效输入保留空白，不将空白作为零。');
          break;
        }
        case 'date_part':
          requireCol();
          d.headers = [...d.headers, name()];
          d.rows = d.rows.map((r) => {
            if (!r[j].trim()) return [...r, ''];
            if (!validDate(r[j])) throw new Error('存在无效日期，无法提取');
            const day = r[j].slice(0, 10).replaceAll('/', '-');
            return [
              ...r,
              step.method === 'year'
                ? day.slice(0, 4)
                : step.method === 'month'
                  ? day.slice(5, 7)
                  : step.method === 'day'
                    ? day.slice(8, 10)
                    : String(new Date(day + 'T00:00:00Z').getUTCDay()),
            ];
          });
          changedRows = before;
          break;
        case 'sort':
          requireCol();
          d.rows = [...d.rows].sort(
            (a, b) =>
              a[j].localeCompare(b[j], undefined, { numeric: true }) *
              (step.method === 'desc' ? -1 : 1),
          );
          changedRows = d.rows.filter((r, i) => r !== oldRows[i]).length;
          break;
        case 'sample': {
          const n = Number(step.value);
          let seed = Number(step.other || 42);
          if (!Number.isInteger(n) || n < 1 || n > before || !Number.isSafeInteger(seed))
            throw new Error('样本数需为 1 至当前行数的整数；种子需为整数');
          const a = [...d.rows];
          for (let i = a.length - 1; i > 0; i--) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const k = seed % (i + 1);
            [a[i], a[k]] = [a[k], a[i]];
          }
          d.rows = a.slice(0, n);
          changedRows = before - n;
          detail = `seed=${step.other || 42}`;
          break;
        }
        case 'aggregate': {
          requireCol();
          const groups = new Map<string, number[]>();
          for (const row of d.rows) {
            const a = step.method === 'count' ? 1 : k >= 0 ? numeric(row[k]) : null;
            if (a === null) continue;
            const values = groups.get(row[j]) || [];
            values.push(a);
            groups.set(row[j], values);
          }
          const outputName = step.name || `${step.method}_${step.other || 'rows'}`;
          if (outputName === step.column) throw new Error('聚合输出名不能与分组列同名');
          d = {
            ...d,
            headers: [step.column, outputName],
            rows: [...groups].map(([key, a]) => {
              const s = stats(a);
              const v =
                step.method === 'count'
                  ? a.length
                  : step.method === 'sum'
                    ? s.mean! * a.length
                    : step.method === 'mean'
                      ? s.mean
                      : step.method === 'median'
                        ? s.median
                        : step.method === 'min'
                          ? s.min
                          : s.max;
              if (v === null || !Number.isFinite(v)) throw new Error('聚合结果无效');
              return [key, String(v)];
            }),
          };
          changedRows = before;
          detail = '聚合仅保留分组键与汇总列';
          break;
        }
        case 'scale': {
          requireCol();
          const a = d.rows.map((r) => numeric(r[j])).filter((v): v is number => v !== null),
            s = stats(a);
          if (!a.length) throw new Error('没有可缩放数值');
          const denominator = step.method === 'zscore' ? s.std : s.max! - s.min!,
            center = step.method === 'zscore' ? s.mean! : s.min!;
          if (denominator === null || !Number.isFinite(denominator))
            throw new Error('缩放参数超出有限范围');
          transform((v) => {
            const n = numeric(v);
            if (n === null) return v;
            const out = denominator === 0 ? 0 : (n - center) / denominator;
            if (!Number.isFinite(out)) throw new Error('缩放结果非有限');
            return String(out);
          });
          detail = `center=${center}; scale=${denominator}`;
          warnings.push(
            '缩放参数由当前工作集拟合；划分后应仅用训练集参数变换验证/测试集，避免泄漏。常量列变为 0。',
          );
          break;
        }
        case 'clip': {
          const min = numeric(step.value),
            max = numeric(step.other);
          if (min === null || max === null || min > max)
            throw new Error('请设置有限且递增的裁剪上下限');
          transform((v) => {
            const n = numeric(v);
            return n === null ? v : String(Math.max(min, Math.min(max, n)));
          });
          warnings.push('裁剪更改了真实数值；请确认极端值应当被截断。');
          break;
        }
        case 'label_encode': {
          requireCol();
          const categories = [...new Set(d.rows.map((r) => r[j]).filter((v) => v.trim()))].sort(),
            map = new Map(categories.map((v, i) => [v, i]));
          transform((v) => (v.trim() ? String(map.get(v)) : v));
          detail = JSON.stringify(Object.fromEntries(map));
          warnings.push('类别编码不意味着数值有序；映射仅覆盖当前工作集，请保存配方执行记录。');
          break;
        }
        case 'one_hot': {
          requireCol();
          const cats = [...new Set(d.rows.map((r) => r[j]).filter((v) => v.trim()))].sort();
          if (cats.length > 50) throw new Error('One-hot 最多 50 类，避免维度爆炸');
          const names = cats.map((_, i) => `${step.name || step.column}_${i}`);
          if (names.some((n) => d.headers.includes(n)))
            throw new Error('One-hot 输出列名冲突，请更换前缀');
          d.headers = [...d.headers, ...names];
          d.rows = d.rows.map((r) => [...r, ...cats.map((v) => (v === r[j] ? '1' : '0'))]);
          changedRows = before;
          detail = JSON.stringify(Object.fromEntries(names.map((n, i) => [n, cats[i]])));
          break;
        }
        default:
          throw new Error('未知整理操作');
      }
      if (!d.rows.length) throw new Error('处理结果为空；请调整条件，当前工作集未变更');
      if (d.rows.length * d.headers.length > 2000000)
        throw new Error('结果超过 200 万单元格保护上限');
      if (new Set(d.headers).size !== d.headers.length) throw new Error('字段名冲突');
    } catch (e) {
      throw new Error(
        `步骤 ${audit.length + 1}「${operations[step.operation]}」失败：${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
    audit.push({
      operation: operations[step.operation],
      before,
      after: d.rows.length,
      changedRows,
      detail: detail || `字段 ${step.column || step.columns.join(', ') || oldHeaders.join(', ')}`,
    });
  }
  d = {
    ...d,
    name: source.name.replace(/(\.[^.]+)?$/, '') + '_prepared.csv',
    warnings: [...d.warnings, '当前为整理后的工作副本；原始数据可恢复。'],
  };
  return { dataset: d, audit, warnings: [...new Set(warnings)] };
}
