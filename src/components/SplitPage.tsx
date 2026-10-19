import { useState } from 'react';
import { useStore, request } from '../store';
import type { SplitConfig, SplitResult } from '../engine/split';
import { Bars, Chart } from './Chart';
import { download } from './AnalysisPages';
export function SplitPage() {
  const { report: r, hasRaw, setError, roles } = useStore();
  const [config, setConfig] = useState<SplitConfig>({
      method: 'random',
      train: 80,
      validation: 10,
      test: 10,
      seed: 42,
      column: '',
      label: roles.truth || r?.target || '',
      leakageColumn: roles.id || '',
      keepDuplicates: true,
    }),
    [result, setResult] = useState<SplitResult | null>(null),
    [busy, setBusy] = useState(false);
  if (!r) return null;
  const update = (patch: Partial<SplitConfig>) => {
    setConfig({ ...config, ...patch });
    setResult(null);
  };
  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const m = await request({ type: 'split', config });
      if (m.type === 'splitResult') setResult(m.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const labels = result
    ? [...new Set(result.subsets.flatMap((s) => s.labels.map(([v]) => v)))].slice(0, 30)
    : [];
  return (
    <>
      <section className="glass panel">
        <span className="eyebrow">REPRODUCIBLE BY DESIGN</span>
        <h2>从一份数据，到可靠的评估。</h2>
        <p>在原始数据上生成不重叠的行划分。固定种子、保存索引、比较子集质量，并检查潜在泄漏。</p>
        <div className="processing-grid" style={{ marginTop: 20 }}>
          <label>
            划分方式
            <select
              aria-label="划分方式"
              value={config.method}
              onChange={(e) =>
                update({
                  method: e.target.value as SplitConfig['method'],
                  keepDuplicates: e.target.value === 'random',
                  column:
                    e.target.value === 'stratified'
                      ? roles.truth
                      : e.target.value === 'time'
                        ? roles.time
                        : e.target.value === 'group'
                          ? roles.id
                          : '',
                })
              }
            >
              <option value="random">随机划分</option>
              <option value="stratified">按标签分层</option>
              <option value="group">按实体分组</option>
              <option value="time">按时间顺序</option>
            </select>
          </label>
          {config.method !== 'random' && (
            <label>
              划分依据字段
              <select
                aria-label="划分依据字段"
                value={config.column}
                onChange={(e) => update({ column: e.target.value })}
              >
                <option value="">请选择字段</option>
                {r.columns.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          {(['train', 'validation', 'test'] as const).map((key, i) => (
            <label key={key}>
              {['训练集 %', '验证集 %', '测试集 %'][i]}
              <input
                aria-label={['训练集比例', '验证集比例', '测试集比例'][i]}
                type="number"
                min="0"
                max="100"
                value={config[key]}
                onChange={(e) => update({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            随机种子
            <input
              aria-label="随机种子"
              type="number"
              value={config.seed}
              onChange={(e) => update({ seed: Number(e.target.value) })}
            />
          </label>
          <label>
            标签分布比较
            <select
              aria-label="划分标签字段"
              value={config.label}
              onChange={(e) => update({ label: e.target.value })}
            >
              <option value="">不比较</option>
              {r.columns.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            跨集实体 / 文本重叠审查
            <select
              aria-label="泄漏检查字段"
              value={config.leakageColumn}
              onChange={(e) => update({ leakageColumn: e.target.value })}
            >
              <option value="">仅检查完全重复行</option>
              {r.columns.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        {config.method === 'random' && (
          <label className="check" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={config.keepDuplicates}
              onChange={(e) => update({ keepDuplicates: e.target.checked })}
            />
            完全重复行保留在同一子集（比例可能近似）
          </label>
        )}
        <p className="footnote">
          分层模式按单个字段的完整值分层；多标签数组按组合分层，不是迭代多标签分层。时间模式保留时间顺序，不进行随机打乱。
        </p>
        <div className="toolbar">
          <button className="primary" disabled={!hasRaw || busy} onClick={run}>
            {busy ? '正在划分与审查…' : '生成划分并分析'}
          </button>
          {!hasRaw && <span>请重新打开原始数据集。</span>}
        </div>
      </section>
      {result && (
        <>
          <section className="glass panel">
            <h2>子集 EDA · 样本与质量</h2>
            <Bars
              label="划分样本数量"
              items={result.subsets.map((s) => [s.name, s.indexes.length])}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>子集</th>
                    <th>样本数</th>
                    <th>实际比例</th>
                    <th>空白单元格</th>
                    <th>重复副本</th>
                    <th>导出</th>
                  </tr>
                </thead>
                <tbody>
                  {result.subsets.map((s, i) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.indexes.length}</td>
                      <td>{((100 * s.indexes.length) / r.rowCount).toFixed(2)}%</td>
                      <td>{s.missing}</td>
                      <td>{s.duplicates}</td>
                      <td>
                        <button
                          onClick={() =>
                            download(
                              '\uFEFF' + result.files[i].content,
                              result.files[i].name,
                              'text/csv;charset=utf-8',
                            )
                          }
                        >
                          下载 CSV
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {labels.length > 0 && (
              <>
                <h3>类别分布比较 · 各子集内百分比</h3>
                <Chart
                  label="划分后标签分布对比"
                  option={{
                    legend: { data: result.subsets.map((s) => s.name), bottom: 0 },
                    xAxis: { type: 'category', data: labels },
                    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
                    series: result.subsets.map((s) => ({
                      name: s.name,
                      type: 'bar',
                      data: labels.map((l) =>
                        Number(
                          (
                            (100 * (s.labels.find(([v]) => v === l)?.[1] || 0)) /
                            Math.max(1, s.indexes.length)
                          ).toFixed(2),
                        ),
                      ),
                    })),
                  }}
                />
                <p className="footnote">图表展示前 30 个类别；清单包含全部类别。</p>
              </>
            )}
            {result.warnings.map((w) => (
              <p className="notice" key={w}>
                {w}
              </p>
            ))}
            <button
              onClick={() =>
                download(
                  JSON.stringify(
                    {
                      ...result,
                      files: undefined,
                      source: r.name,
                      indexConvention: '0-based data rows (excluding header)',
                    },
                    null,
                    2,
                  ),
                  'datascope-split-manifest.json',
                  'application/json',
                )
              }
            >
              导出划分清单与行索引
            </button>
          </section>
        </>
      )}
    </>
  );
}
