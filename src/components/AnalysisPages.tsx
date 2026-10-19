import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Download,
  TriangleAlert,
  ShieldCheck,
  Layers,
  FileText,
  Database,
  ChevronRight,
} from 'lucide-react';
import { useStore, request, type Tab } from '../store';
import type { DataIssue } from '../engine/types';
import { defaults } from '../engine/types';
import { Bars, Chart } from './Chart';
import { DataPreview } from './DataPreview';
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportRows(rows: number[], issue: string) {
  try {
    const m = await request({ type: 'export', rows, issue });
    if (m.type === 'export')
      download('\uFEFF' + m.csv, `datascope-${issue}.csv`, 'text/csv;charset=utf-8');
  } catch (e) {
    useStore.getState().setError(String(e));
  }
}
export function issueTab(issue: DataIssue): Tab {
  return issue.type === 'duplicate'
    ? 'Duplicates'
    : issue.type === 'missing_value' || issue.type === 'missing_token'
      ? 'Missing'
      : issue.type === 'class_imbalance'
        ? 'Distribution'
        : issue.type.includes('text')
          ? 'Text'
          : 'Columns';
}
export function Overview() {
  const { report: r, setTab } = useStore();
  const [explain, setExplain] = useState(false);
  if (!r) return null;
  const text = r.columns.find((c) => c.length);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">YOUR DATA, A LITTLE CLEARER</span>
          <h1>让数据，先说清自己。</h1>
          <p>从质量到分布，把下一步的判断建立在证据之上。</p>
        </div>
        <span className="status-pill">
          <span /> 本地分析已完成
        </span>
      </div>
      <div className="metrics">
        {[
          { label: '样本行数', value: r.rowCount, sub: 'Rows in your dataset', icon: Database },
          {
            label: '数据字段',
            value: r.columns.length,
            sub: 'Automatically understood',
            icon: Layers,
          },
          {
            label: '空白单元格',
            value: r.missing,
            sub: `${((100 * r.missing) / (r.rowCount * r.columns.length)).toFixed(2)}% of all cells`,
            icon: FileText,
          },
          {
            label: '重复副本',
            value: r.duplicateCount,
            sub: 'Excluding first occurrences',
            icon: Layers,
          },
        ].map(({ label, value, sub, icon: Icon }) => (
          <div className="glass metric" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value.toLocaleString()}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="glass panel health">
          <div className="section-heading">
            <h2>数据健康度</h2>
            <ShieldCheck size={19} />
          </div>
          <div className="score-wrap">
            <svg viewBox="0 0 180 180" aria-label={`健康评分 ${r.score}`}>
              <circle className="ring-bg" cx="90" cy="90" r="72" />
              <circle
                className="ring-value"
                cx="90"
                cy="90"
                r="72"
                strokeDasharray={`${r.score * 4.524} 452.4`}
              />
            </svg>
            <div>
              <strong>{r.score}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <h3>
            {r.score >= 90
              ? '好的起点，继续核实。'
              : r.score >= 70
                ? '有些细节，值得关注。'
                : '先理解问题，再向前。'}
          </h3>
          <p>可解释的规则评分，不代替业务判断。</p>
          <button className="subtle" onClick={() => setExplain(!explain)}>
            为什么是 {r.score} 分？ <ChevronRight size={15} />
          </button>
          {explain && (
            <div className="score-explain">
              {r.penalties.map((p) => (
                <p key={p.label}>
                  {p.label}
                  <b>−{p.value.toFixed(2)}</b>
                </p>
              ))}
              <small>100 减以上扣分后四舍五入。未设置 Target 时不扣不均衡分。</small>
            </div>
          )}
        </section>
        <section className="glass panel">
          <div className="section-heading">
            <div>
              <h2>值得关注</h2>
              <p>先处理影响判断的问题</p>
            </div>
            <span className="count-pill">{r.issues.length}</span>
          </div>
          <div className="issue-preview">
            {r.issues.slice(0, 4).map((i) => (
              <button key={i.id} onClick={() => setTab(issueTab(i))}>
                <span className={`issue-icon ${i.severity}`}>
                  <TriangleAlert size={17} />
                </span>
                <div>
                  <b>{i.title}</b>
                  <small>
                    {i.column || '全数据集'} · {i.affectedRows.toLocaleString()} 行
                  </small>
                </div>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
          <button className="text-button" onClick={() => setTab('Issues')}>
            查看全部问题与建议 <ChevronRight size={16} />
          </button>
        </section>
      </div>
      <div className="two-col">
        <section className="glass panel">
          <div className="section-heading">
            <div>
              <h2>{text ? '文本长度分布' : '字段缺失概览'}</h2>
              <p>{text ? `${text.name} · Unicode 字符数` : '空白单元格，独立于疑似缺失标记'}</p>
            </div>
            <button
              className="icon-button"
              aria-label="查看分布详情"
              onClick={() => setTab(text ? 'Text' : 'Missing')}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <Bars
            label={text ? '文本长度分布' : '缺失值分布'}
            items={
              text?.length
                ? text.length.histogram.map((b) => [b.label, b.count])
                : r.columns.map((c) => [c.name, c.missing])
            }
          />
        </section>
        <section className="glass panel next-card">
          <span className="eyebrow">FROM INSIGHT TO ACTION</span>
          <h2>
            知道问题之后，
            <br />
            下一步更有方向。
          </h2>
          <p>每一条建议都关联具体证据。逐项复核，保留你的判断，也保留原始数据。</p>
          <div className="mini-check">
            <span>
              <Check size={14} />
            </span>{' '}
            检查缺失与重复样本
          </div>
          <div className="mini-check">
            <span /> 核实异常值与字段含义
          </div>
          <button className="primary magnetic" onClick={() => setTab('Next Steps')}>
            打开处理清单 <ArrowUpRight size={17} />
          </button>
        </section>
      </div>
    </>
  );
}
export function Missing() {
  const r = useStore((s) => s.report);
  if (!r) return null;
  return (
    <section className="glass panel">
      <h2>缺失值分析</h2>
      <p>空字符串、纯空白是空白单元格；N/A、None 等仍保留为原始字符串。</p>
      <Bars horizontal label="各字段缺失值" items={r.columns.map((c) => [c.name, c.missing])} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>空白</th>
              <th>比例</th>
              <th>疑似缺失标记</th>
            </tr>
          </thead>
          <tbody>
            {r.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.missing}</td>
                <td>{((100 * c.missing) / r.rowCount).toFixed(2)}%</td>
                <td>{c.tokens.map(([v, n]) => `${v}: ${n}`).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function Duplicates() {
  const { report: r, hasRaw } = useStore();
  const [selected, setSelected] = useState<number[]>([]);
  if (!r) return null;
  return (
    <>
      <section className="glass panel">
        <div className="section-heading">
          <div>
            <h2>完全重复行</h2>
            <p>
              {r.duplicateCount} 条额外副本 · {((100 * r.duplicateCount) / r.rowCount).toFixed(2)}%
              · {r.duplicates.length} 个重复组
            </p>
          </div>
          <button
            disabled={!hasRaw || !r.duplicates.length}
            onClick={() => exportRows(r.duplicates.flat(), 'duplicate')}
          >
            <Download size={16} />
            导出全部重复组
          </button>
        </div>
        <p className="muted">
          精确匹配所有原始字段，保留大小写及空白。导出包含每组首条记录，便于审核。
        </p>
        <div className="group-grid">
          {r.duplicates.slice(0, 100).map((g, i) => (
            <button
              key={i}
              onClick={() => setSelected(g)}
              className={selected === g ? 'selected' : ''}
            >
              <b>重复组 {i + 1}</b>
              <span>{g.length} 条记录</span>
              <small>
                行号{' '}
                {g
                  .slice(0, 12)
                  .map((i) => i + 1)
                  .join(', ')}
                {g.length > 12 ? '…' : ''}
              </small>
            </button>
          ))}
        </div>
        {r.duplicates.length > 100 && <p>界面展示前 100 组；导出包含全部组。</p>}
        {!r.duplicates.length && <div className="empty">没有检测到完全重复行。</div>}
      </section>
      {selected.length > 0 && <DataPreview issueRows={selected} />}
    </>
  );
}
export function Issues({ checklist = false }: { checklist?: boolean }) {
  const { report: r, hasRaw, reviewed, review, setTab } = useStore();
  const [selected, setSelected] = useState<DataIssue | null>(null);
  if (!r) return null;
  return (
    <>
      <section className="glass panel">
        <div className="section-heading">
          <div>
            <h2>{checklist ? '建模之前，逐项确认。' : '数据问题与处理建议'}</h2>
            <p>
              {checklist
                ? `已复核 ${reviewed.length} / ${r.issues.length} 项；复核标记仅在当前会话保存。`
                : '建议由透明规则生成，供人工审核，不自动更改数据。'}
            </p>
          </div>
          <span className="badge">{r.issues.length} 项发现</span>
        </div>
        <div className="issue-list">
          {r.issues.map((i) => (
            <article className="issue-card" key={i.id}>
              <div className="section-heading">
                <div className="issue-title">
                  {checklist && (
                    <input
                      aria-label={`复核 ${i.title} ${i.column || ''}`}
                      type="checkbox"
                      checked={reviewed.includes(i.id)}
                      onChange={() => review(i.id)}
                    />
                  )}
                  <span className={`severity ${i.severity}`}>{i.severity}</span>
                  <h3>{i.title}</h3>
                  <span className="muted">{i.column}</span>
                </div>
                <span className="badge">
                  {i.affectedRows} 行 · {(i.ratio * 100).toFixed(1)}%
                </span>
              </div>
              <p>{i.description}</p>
              <div className="suggestion">
                <b>建议如何处理</b>
                <p>{i.suggestion}</p>
              </div>
              <div className="toolbar">
                <button onClick={() => setTab(issueTab(i))}>
                  查看对应分析 <ArrowUpRight size={15} />
                </button>
                <button disabled={!hasRaw} onClick={() => setSelected(i)}>
                  定位问题行
                </button>
                <button disabled={!hasRaw} onClick={() => exportRows(i.rows, i.type)}>
                  <Download size={15} />
                  导出问题行
                </button>
              </div>
            </article>
          ))}
        </div>
        {!r.issues.length && (
          <div className="empty">当前规则未发现问题，仍建议检查业务含义和采集过程。</div>
        )}
      </section>
      {selected && (
        <>
          <h3>{selected.title} · 问题样本</h3>
          <DataPreview issueRows={selected.rows} />
        </>
      )}
    </>
  );
}
export function Correlation() {
  const r = useStore((s) => s.report);
  const [selected, setSelected] = useState('');
  if (!r) return null;
  const names = [...new Set(r.correlations.map((c) => c.x))];
  const pair = r.correlations.find((p) => `${p.x} → ${p.y}` === selected);
  if (names.length < 2)
    return <div className="glass empty">至少需要两个 Numeric 字段才能比较相关性。</div>;
  return (
    <section className="glass panel">
      <h2>Pearson 相关性</h2>
      <p>成对删除缺失及非数值；常量列或不足两个有效样本返回未定义。相关性不代表因果。</p>
      <div className="chart-scroll">
        <Chart
          label="Pearson 相关性热力图"
          height={Math.max(380, names.length * 35)}
          option={{
            tooltip: { position: 'top', renderMode: 'richText' },
            grid: { left: 100, right: 50, top: 30, bottom: 90 },
            xAxis: { type: 'category', data: names, axisLabel: { rotate: 25 } },
            yAxis: { type: 'category', data: names },
            visualMap: {
              min: -1,
              max: 1,
              calculable: true,
              orient: 'horizontal',
              left: 'center',
              bottom: 0,
              inRange: { color: ['#cf9eaa', '#f3f3f9', '#657fe8'] },
            },
            series: [
              {
                type: 'heatmap',
                label: { show: names.length < 8 },
                data: r.correlations
                  .filter((p) => p.r !== null)
                  .map((p) => [names.indexOf(p.x), names.indexOf(p.y), Number(p.r!.toFixed(3))]),
              },
            ],
          }}
        />
      </div>
      <label>
        查看一组字段{' '}
        <select
          aria-label="相关性字段对"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">选择字段对</option>
          {r.correlations.map((p) => (
            <option key={`${p.x} → ${p.y}`}>
              {p.x} → {p.y}
            </option>
          ))}
        </select>
      </label>
      {pair && (
        <p>
          Pearson r = {pair.r === null ? '未定义' : pair.r.toFixed(6)} · 配对有效样本 n = {pair.n}
        </p>
      )}
    </section>
  );
}
export function SettingsPage() {
  const { settings, recompute, hasRaw } = useStore();
  const [draft, setDraft] = useState(settings);
  return (
    <section className="glass panel settings">
      <h2>分析配置</h2>
      <p>修改参数后重新分析。阈值是筛查工具，不是数据正确与否的结论。</p>
      {(
        [
          { key: 'shortText', title: '短文本字符阈值', min: 0, max: 100, step: 1 },
          { key: 'longPercentile', title: '超长文本百分位', min: 50, max: 100, step: 1 },
          { key: 'categoryRatio', title: '分类唯一值比例', min: 0.001, max: 1, step: 0.01 },
          { key: 'idRatio', title: '标识符唯一值比例', min: 0.5, max: 1, step: 0.01 },
          { key: 'imbalance', title: '最大 / 最小类别比', min: 1, max: 1000, step: 1 },
          { key: 'numericRatio', title: '数值类型有效值比例', min: 0.5, max: 1, step: 0.01 },
        ] as const
      ).map(({ key, title, min, max, step }) => (
        <label key={key}>
          <span>{title}</span>
          <input
            aria-label={title}
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <p>IQR 系数 1.5 · 文件上限 50 MB · 单元格上限 2,000,000 · Pearson 最多 20 列。</p>
      <div className="toolbar">
        <button className="primary" disabled={!hasRaw} onClick={() => recompute(draft)}>
          应用并重新分析
        </button>
        <button onClick={() => setDraft(defaults)}>恢复默认值</button>
      </div>
    </section>
  );
}
