import { useState, useEffect } from 'react';
import { useStore, request } from '../store';
import type { ColumnType, Stats } from '../engine/types';
import { Bars, Chart } from './Chart';
export const fmt = (n: number | null | undefined) =>
  n == null
    ? '—'
    : Number.isInteger(n)
      ? n.toLocaleString()
      : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
export function StatList({ stats: s }: { stats: Stats }) {
  return (
    <dl className="stat-grid">
      {(['count', 'mean', 'std', 'min', 'q1', 'median', 'q3', 'max', 'p95', 'p99'] as const).map(
        (k) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{fmt(s[k])}</dd>
          </div>
        ),
      )}
    </dl>
  );
}
export function Columns() {
  const { report: r, hasRaw, recompute, settings, overrides } = useStore();
  const [selected, setSelected] = useState(''),
    [query, setQuery] = useState('');
  if (!r) return null;
  const c = r.columns.find((c) => c.name === selected) || r.columns[0];
  return (
    <div className="inspector-layout">
      <section className="glass panel">
        <h2>字段目录</h2>
        <input
          id="column-search"
          aria-label="搜索字段名"
          placeholder="搜索字段 /"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="column-list">
          {r.columns
            .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
            .map((col) => (
              <button
                className={col === c ? 'selected' : ''}
                key={col.name}
                onClick={() => setSelected(col.name)}
              >
                <span>{col.name}</span>
                <small>{col.type}</small>
              </button>
            ))}
        </div>
      </section>
      <section className="glass panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">COLUMN INSPECTOR</span>
            <h2>{c.name}</h2>
          </div>
          <select
            aria-label="字段类型"
            disabled={!hasRaw}
            value={c.type}
            onChange={(e) =>
              recompute(settings, { ...overrides, [c.name]: e.target.value as ColumnType })
            }
          >
            {['Numeric', 'Categorical', 'Text', 'Boolean', 'Date', 'ID', 'Unknown'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <dl className="stat-grid">
          {[
            ['非空', c.nonNull],
            ['空白', c.missing],
            ['唯一值', c.unique],
            ['重复值', c.duplicateValues],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{fmt(+v)}</dd>
            </div>
          ))}
        </dl>
        {c.stats && (
          <>
            <h3>数值统计</h3>
            <p className="muted">仅有效有限数值；标准差使用 n−1，单样本记 0。</p>
            <StatList stats={c.stats} />
            <Bars label="数值直方图" items={c.stats.histogram.map((b) => [b.label, b.count])} />
            {c.stats.count > 0 && (
              <Chart
                label="数值箱线图"
                option={{
                  xAxis: { type: 'category', data: [c.name] },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      type: 'boxplot',
                      data: [[c.stats.min, c.stats.q1, c.stats.median, c.stats.q3, c.stats.max]],
                    },
                  ],
                }}
              />
            )}
            <p className="footnote">
              箱线图须线为最小/最大值；IQR 异常检测独立计算。潜在异常 {c.outliers.length} 行。
            </p>
          </>
        )}
        {c.length && (
          <>
            <h3>文本长度 · Unicode 码点</h3>
            <StatList stats={c.length} />
            <Bars
              label="文本长度直方图"
              items={c.length.histogram.map((b) => [b.label, b.count])}
            />
          </>
        )}
        <h3>唯一值分布 · Top 100</h3>
        <div className="table-scroll small">
          <table>
            <thead>
              <tr>
                <th>值</th>
                <th>数量</th>
                <th>占非空比例</th>
              </tr>
            </thead>
            <tbody>
              {c.counts.map(([v, n]) => (
                <tr key={v}>
                  <td>{v}</td>
                  <td>{n}</td>
                  <td>{((100 * n) / c.nonNull).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export function Distribution() {
  const { report: r, hasRaw, recompute, settings } = useStore();
  if (!r) return null;
  const c = r.columns.find((c) => c.name === r.target);
  return (
    <section className="glass panel">
      <div className="section-heading">
        <div>
          <h2>目标与类别分布</h2>
          <p>指定分类目标后启用不均衡检查；不自动猜测建模目标。</p>
        </div>
        <select
          aria-label="目标字段"
          disabled={!hasRaw}
          value={r.target || ''}
          onChange={(e) => recompute(settings, undefined, e.target.value)}
        >
          <option value="">选择 Target / Label</option>
          {r.columns
            .filter((c) => c.type === 'Categorical')
            .map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
        </select>
      </div>
      {c ? (
        <>
          <Bars label="目标类别分布" horizontal items={c.counts.slice(0, 30)} />
          <p>
            目标非空 {c.nonNull} 行 · 类别 {c.unique} · 空白 {c.missing} 行
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>类别</th>
                  <th>数量</th>
                  <th>占有效标签</th>
                </tr>
              </thead>
              <tbody>
                {c.counts.map(([v, n]) => (
                  <tr key={v}>
                    <td>{v}</td>
                    <td>{n}</td>
                    <td>{((100 * n) / Math.max(1, c.nonNull)).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="footnote">最多显示 100 类，图表显示前 30 类；不均衡检测使用全部类别。</p>
        </>
      ) : (
        <div className="empty">
          请选择一个分类字段作为分析目标。若未识别为分类，可在字段检查器中更改类型。
        </div>
      )}
    </section>
  );
}
export function TextAnalysis() {
  const { report: r, hasRaw } = useStore();
  const [selected, setSelected] = useState(''),
    [mode, setMode] = useState<'word' | 'character'>('word'),
    [hideStop, setHideStop] = useState(true),
    [top, setTop] = useState(20),
    [label, setLabel] = useState(''),
    [words, setWords] = useState<[string, number][]>([]),
    [comparison, setComparison] = useState<[string, number][]>([]),
    [compare, setCompare] = useState(''),
    [fallback, setFallback] = useState(false);
  const c =
    r?.columns.find((c) => c.name === selected && c.type === 'Text') ||
    r?.columns.find((c) => c.type === 'Text');
  const target = r?.columns.find((c) => c.name === r.target);
  useEffect(() => {
    let active = true;
    if (!c || !r) return;
    if (!hasRaw) {
      setWords((r.wordSummary[c.name] || []).slice(0, top));
      setComparison([]);
      return;
    }
    request({
      type: 'words',
      column: c.name,
      mode,
      hideStop,
      top,
      target: r.target,
      label: label || undefined,
    })
      .then((m) => {
        if (active && m.type === 'words') {
          setWords(m.words);
          setFallback(m.fallback);
        }
      })
      .catch(() => {});
    if (compare)
      request({
        type: 'words',
        column: c.name,
        mode,
        hideStop,
        top,
        target: r.target,
        label: compare,
      })
        .then((m) => {
          if (active && m.type === 'words') setComparison(m.words);
        })
        .catch(() => {});
    else setComparison([]);
    return () => {
      active = false;
    };
  }, [c, r, hasRaw, mode, hideStop, top, label, compare]);
  if (!r || !c)
    return <div className="glass empty">没有文本字段。可在字段检查器将相应字段设为 Text。</div>;
  return (
    <>
      <section className="glass panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LANGUAGE EXPLORER</span>
            <h2>每段文字，都有迹可循</h2>
          </div>
          <select
            aria-label="文本字段"
            value={c.name}
            onChange={(e) => setSelected(e.target.value)}
          >
            {r.columns
              .filter((c) => c.type === 'Text')
              .map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
          </select>
        </div>
        {c.length && (
          <>
            <StatList stats={c.length} />
            <Bars
              label="文本长度直方图"
              items={c.length.histogram.map((b) => [b.label, b.count])}
            />
          </>
        )}
      </section>
      <section className="glass panel">
        <h2>高频词</h2>
        <div className="toolbar">
          <select
            disabled={!hasRaw}
            aria-label="分词模式"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'word' | 'character')}
          >
            <option value="word">Word · 分词</option>
            <option value="character">Character · 字符</option>
          </select>
          <select aria-label="词频数量" value={top} onChange={(e) => setTop(+e.target.value)}>
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
          <label className="check">
            <input
              type="checkbox"
              disabled={!hasRaw}
              checked={hideStop}
              onChange={(e) => setHideStop(e.target.checked)}
            />
            隐藏基础停用词
          </label>
          {target && (
            <>
              <select
                aria-label="词频类别"
                disabled={!hasRaw}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              >
                <option value="">全部标签</option>
                {target.counts.map(([v]) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                aria-label="对比类别"
                disabled={!hasRaw}
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                <option value="">对比另一类别</option>
                {target.counts.map(([v]) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </>
          )}
        </div>
        {fallback && (
          <p role="status">当前浏览器不支持 Intl.Segmenter，已回退为中文单字与英文单词。</p>
        )}
        {!hasRaw && <p>历史提供默认分词 / 隐藏停用词的 Top 100 摘要。其他模式请重新导入。</p>}
        <div className={compare && hasRaw ? 'two-col' : ''}>
          <div>
            <h3>{label || '全部文本'}</h3>
            <Bars
              label="高频词"
              horizontal
              items={words}
              height={Math.max(320, words.length * 26)}
            />
          </div>
          {compare && hasRaw && (
            <div>
              <h3>{compare}</h3>
              <Bars
                label="类别对比词频"
                horizontal
                items={comparison}
                height={Math.max(320, comparison.length * 26)}
              />
            </div>
          )}
        </div>
        <p className="footnote">
          词频表示出现次数，不代表特征重要性或因果关系。中文使用浏览器本地
          Intl.Segmenter；不同浏览器分词可能不同。
        </p>
      </section>
    </>
  );
}
