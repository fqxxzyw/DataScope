import { HelpDemo } from './HelpDemo';
import { useState, useRef } from 'react';
import { useStore, request } from '../store';
import { operations, type PrepStep, type PrepOperation } from '../engine/prepare';
import type { WorkerResponse } from '../engine/types';
import { download } from './AnalysisPages';
import { saveHistory } from '../storage';
type Preview = Extract<WorkerResponse, { type: 'prepared' }>;
const methods: Partial<Record<PrepOperation, [string, string][]>> = {
  filter: [
    ['eq', '等于'],
    ['ne', '不等于'],
    ['contains', '包含'],
    ['not_contains', '不包含'],
    ['empty', '为空白'],
    ['not_empty', '非空白'],
    ['gt', '数值 >'],
    ['gte', '数值 ≥'],
    ['lt', '数值 <'],
    ['lte', '数值 ≤'],
  ],
  fill_missing: [
    ['constant', '固定值'],
    ['mean', '均值'],
    ['median', '中位数'],
    ['mode', '众数'],
  ],
  replace: [
    ['eq', '完整值匹配'],
    ['contains', '字面子串替换'],
  ],
  arithmetic: [
    ['add', '加'],
    ['subtract', '减'],
    ['multiply', '乘'],
    ['divide', '除'],
  ],
  date_part: [
    ['year', '年份'],
    ['month', '月份'],
    ['day', '日'],
    ['weekday', '星期 0=周日'],
  ],
  sort: [
    ['asc', '升序'],
    ['desc', '降序'],
  ],
  aggregate: [
    ['count', '计数'],
    ['mean', '平均值'],
    ['sum', '求和'],
    ['median', '中位数'],
    ['min', '最小'],
    ['max', '最大'],
  ],
  scale: [
    ['minmax', 'Min-max 到 [0,1]'],
    ['zscore', 'Z-score 标准化'],
  ],
};
export function Preparation() {
  const { report: r, hasRaw, setError, roles } = useStore();
  const [steps, setSteps] = useState<PrepStep[]>([]),
    [result, setResult] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [applied, setApplied] = useState(false);
  const recipeInput = useRef<HTMLInputElement>(null);
  if (!r) return null;
  const names = [
    ...new Set([
      ...r.columns.map((c) => c.name),
      ...steps
        .filter((s) => ['length', 'arithmetic', 'date_part', 'rename'].includes(s.operation))
        .map((s) => s.name)
        .filter(Boolean),
    ]),
  ];
  const update = (id: string, patch: Partial<PrepStep>) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setResult(null);
    setApplied(false);
  };
  function accept(m: Preview) {
    setResult(m);
    if (m.report) {
      useStore.setState({
        report: m.report,
        settings: m.report.settings,
        overrides: {},
        roles: {
          truth: '',
          prediction: '',
          features: [],
          id: '',
          time: '',
          task: 'classification',
        },
        reviewed: [],
      });
      saveHistory(m.report).catch(() => {});
    }
  }
  async function run(apply: boolean) {
    setBusy(true);
    try {
      const m = await request({ type: 'prepare', steps, apply });
      if (m.type === 'prepared') {
        accept(m);
        setApplied(apply);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore(original: boolean) {
    setBusy(true);
    try {
      const m = await request({ type: 'restore', original });
      if (m.type === 'prepared') {
        accept(m);
        setSteps([]);
        setApplied(false);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(format: 'csv' | 'jsonl', columns: string[] = []) {
    try {
      const m = await request({ type: 'saveData', format, columns });
      if (m.type === 'savedData')
        download(
          (format === 'csv' ? '\uFEFF' : '') + m.content,
          `datascope-working-copy.${format}`,
          format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
        );
    } catch (e) {
      setError(String(e));
    }
  }
  async function importRecipe(file?: File) {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      const a = (value as { steps?: unknown })?.steps;
      if (
        !Array.isArray(a) ||
        !a.length ||
        a.length > 30 ||
        !a.every(
          (s) =>
            s &&
            Object.hasOwn(operations, s.operation) &&
            ['column', 'other', 'value', 'name', 'method'].every((k) => typeof s[k] === 'string') &&
            Array.isArray(s.columns) &&
            s.columns.every((v: unknown) => typeof v === 'string'),
        )
      )
        throw new Error('不是有效的数据整理配方');
      setSteps(a.map((s, i) => ({ ...s, id: String(i) })));
      setResult(null);
      setApplied(false);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <section className="glass panel">
        <span className="eyebrow">LESS CODE. MORE CONTROL.</span>
        <h2>
          把数据整理成你需要的样子。 <HelpDemo kind="prepare" />
        </h2>
        <p>
          组合步骤 → 预览影响 → 应用到工作副本 →
          继续分析或保存。原始数据仅在内存中保留，可恢复；最多撤销最近三次应用。
        </p>
        <div className="toolbar">
          <button onClick={() => save('csv')} disabled={!hasRaw || busy}>
            保存当前数据 CSV
          </button>
          <HelpDemo kind="export" />
          <button onClick={() => save('jsonl')} disabled={!hasRaw || busy}>
            保存当前数据 JSONL
          </button>
          <HelpDemo kind="export" />
          <button
            disabled={!hasRaw || !roles.features.length || busy}
            onClick={() => save('csv', [...roles.features, ...(roles.truth ? [roles.truth] : [])])}
          >
            仅保存输入特征 + 标签
          </button>
          <button disabled={!hasRaw || busy} onClick={() => restore(false)}>
            撤销上次应用
          </button>
          <HelpDemo kind="restore" />
          <button disabled={!hasRaw || busy} onClick={() => restore(true)}>
            恢复原始数据
          </button>
          <HelpDemo kind="restore" />
        </div>
        <div className="notice">
          当前 {r.rowCount.toLocaleString()} 行 · {r.columns.length} 列。应用后会重新执行
          EDA，并清空旧字段角色，避免引用已改名或删除的字段。原文件不被覆盖。
        </div>
        <div className="toolbar">
          <button
            onClick={() => {
              setSteps([
                ...steps,
                {
                  id: `step-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  operation: 'filter',
                  column: r.columns[0].name,
                  columns: [],
                  other: '',
                  value: '',
                  name: '',
                  method: 'eq',
                },
              ]);
              setResult(null);
              setApplied(false);
            }}
            disabled={steps.length >= 30 || busy}
          >
            ＋ 添加整理步骤
          </button>
          <button onClick={() => recipeInput.current?.click()} disabled={busy}>
            载入操作配方
          </button>
          <HelpDemo kind="recipe" />
          <input
            ref={recipeInput}
            hidden
            type="file"
            accept=".json"
            onChange={(e) => {
              importRecipe(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            disabled={!steps.length}
            onClick={() =>
              download(
                JSON.stringify({ version: 1, steps }, null, 2),
                'datascope-recipe.json',
                'application/json',
              )
            }
          >
            保存操作配方
          </button>
          <HelpDemo kind="recipe" />
        </div>
        <div className="task-guidance">
          <h3>
            快速开始：文本分类整理 <HelpDemo kind="recipe" />
          </h3>
          <p>
            先在工作台确认正文和标签。这个配方会去首尾空白、检查必需列空值并按正文与标签去重；先预览影响行数，再决定是否应用。
          </p>
          <button
            disabled={!roles.text || busy}
            onClick={() => {
              const columns = [roles.text!, roles.truth].filter(Boolean);
              const base = {
                column: roles.text!,
                columns,
                other: '',
                value: '',
                name: '',
                method: '',
              };
              setSteps([
                { ...base, id: 'preset-trim', operation: 'trim' },
                { ...base, id: 'preset-empty', operation: 'drop_missing' },
                { ...base, id: 'preset-dedup', operation: 'deduplicate' },
              ]);
              setResult(null);
              setApplied(false);
            }}
          >
            生成文本分类整理配方
          </button>
        </div>
        {steps.map((s, i) => (
          <article className="prep-step" key={s.id}>
            <div className="section-heading">
              <h3>步骤 {i + 1}</h3>
              <div className="toolbar">
                <button
                  aria-label={`上移步骤 ${i + 1}`}
                  disabled={!i || busy}
                  onClick={() => {
                    const a = [...steps];
                    [a[i - 1], a[i]] = [a[i], a[i - 1]];
                    setSteps(a);
                    setResult(null);
                  }}
                >
                  ↑
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setSteps(steps.filter((x) => x.id !== s.id));
                    setResult(null);
                  }}
                >
                  移除
                </button>
              </div>
            </div>
            <div className="chart-controls">
              <label>
                操作 <HelpDemo kind={s.operation} />
                <select
                  aria-label={`步骤 ${i + 1} 操作`}
                  disabled={busy}
                  value={s.operation}
                  onChange={(e) => {
                    const operation = e.target.value as PrepOperation;
                    update(s.id, { operation, method: methods[operation]?.[0]?.[0] || '' });
                  }}
                >
                  {Object.entries(operations).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {!['select', 'deduplicate', 'drop_missing', 'sample'].includes(s.operation) && (
                <label>
                  目标列 <HelpDemo kind={s.operation} />
                  <select
                    aria-label={`步骤 ${i + 1} 字段`}
                    disabled={busy}
                    value={s.column}
                    onChange={(e) => update(s.id, { column: e.target.value })}
                  >
                    {names.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              {methods[s.operation] && (
                <label>
                  方式 <HelpDemo kind={s.operation} />
                  <select
                    aria-label={`步骤 ${i + 1} 方式`}
                    disabled={busy}
                    value={s.method}
                    onChange={(e) => update(s.id, { method: e.target.value })}
                  >
                    {methods[s.operation]!.map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {['filter', 'fill_missing', 'replace', 'sample', 'clip'].includes(s.operation) && (
                <label>
                  {s.operation === 'sample'
                    ? '样本数'
                    : s.operation === 'clip'
                      ? '下限'
                      : '比较 / 查找 / 填充值'}
                  <input
                    aria-label={`步骤 ${i + 1} 值`}
                    disabled={busy}
                    value={s.value}
                    onChange={(e) => update(s.id, { value: e.target.value })}
                  />
                </label>
              )}
              {[
                'rename',
                'replace',
                'length',
                'arithmetic',
                'date_part',
                'aggregate',
                'one_hot',
              ].includes(s.operation) && (
                <label>
                  {s.operation === 'replace' ? '替换为（留空即空字符串）' : '新列名 / 输出前缀'}
                  <input
                    aria-label={`步骤 ${i + 1} 新值或列名`}
                    disabled={busy}
                    value={s.name}
                    onChange={(e) => update(s.id, { name: e.target.value })}
                  />
                </label>
              )}
              {['arithmetic', 'aggregate'].includes(s.operation) && (
                <label>
                  数值列 B <HelpDemo kind={s.operation} />
                  <select
                    aria-label={`步骤 ${i + 1} 第二列`}
                    disabled={busy}
                    value={s.other}
                    onChange={(e) => update(s.id, { other: e.target.value })}
                  >
                    <option value="">计数时可不选</option>
                    {names.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              {['sample', 'clip'].includes(s.operation) && (
                <label>
                  {s.operation === 'sample' ? '随机种子（默认 42）' : '上限'}
                  <input
                    aria-label={`步骤 ${i + 1} 参数`}
                    disabled={busy}
                    value={s.other}
                    onChange={(e) => update(s.id, { other: e.target.value })}
                  />
                </label>
              )}
            </div>
            {['select', 'deduplicate', 'drop_missing'].includes(s.operation) && (
              <div className="feature-picker">
                {names.map((n) => (
                  <label key={n} className="check">
                    <input
                      disabled={busy}
                      type="checkbox"
                      checked={s.columns.includes(n)}
                      onChange={(e) =>
                        update(s.id, {
                          columns: e.target.checked
                            ? [...s.columns, n]
                            : s.columns.filter((x) => x !== n),
                        })
                      }
                    />
                    {n}
                  </label>
                ))}
              </div>
            )}
            {s.operation === 'select' && (
              <p>输出顺序跟随勾选顺序：{s.columns.join(' → ') || '请至少选择一列'}</p>
            )}
            {s.operation === 'deduplicate' && <p>不选字段则按全行去重；保留首条。</p>}
          </article>
        ))}
        {!steps.length && (
          <div className="empty">添加一个步骤，开始筛选、填补、派生、聚合或整理数据。</div>
        )}
        <div className="toolbar">
          <button
            className="primary"
            disabled={!hasRaw || !steps.length || busy}
            onClick={() => run(false)}
          >
            {busy ? '正在计算…' : '预览整理结果'}
          </button>
          <HelpDemo kind="prepare" />
          <button disabled={!result || applied || busy || !steps.length} onClick={() => run(true)}>
            确认预览，应用到工作副本
          </button>
          <HelpDemo kind="prepare" />
        </div>
      </section>
      {result && (
        <section className="glass panel">
          <h2>{applied ? '已应用到工作副本' : '整理预览 · 尚未改变工作副本'}</h2>
          <p>
            结果 {result.rows.toLocaleString()} 行 · {result.headers.length} 列 · 预览前 10 行
          </p>
          {result.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>操作</th>
                  <th>前 / 后行数</th>
                  <th>影响行数</th>
                  <th>执行参数</th>
                </tr>
              </thead>
              <tbody>
                {result.audit.map((a, i) => (
                  <tr key={i}>
                    <td>{a.operation}</td>
                    <td>
                      {a.before} / {a.after}
                    </td>
                    <td>{a.changedRows}</td>
                    <td title={a.detail}>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll" style={{ marginTop: 20 }}>
            <table>
              <thead>
                <tr>
                  {result.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j}>{v || <span className="null">空白</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() =>
              download(
                JSON.stringify(
                  {
                    steps,
                    audit: result.audit,
                    warnings: result.warnings,
                    outputRows: result.rows,
                  },
                  null,
                  2,
                ),
                'datascope-preparation-audit.json',
                'application/json',
              )
            }
          >
            保存处理记录与拟合参数
          </button>
        </section>
      )}
    </>
  );
}
