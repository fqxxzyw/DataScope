import { useState } from 'react';
import { useStore, request, type Roles } from '../store';
import type { ExploreConfig, ExploreResult, EvaluateResult } from '../engine/explore';
import { Chart } from './Chart';
import { download } from './AnalysisPages';
export function RolesPanel({ compact = false }: { compact?: boolean }) {
  const { report: r, roles, setRoles, hasRaw, recompute, settings, overrides } = useStore();
  if (!r) return null;
  const update = (patch: Partial<Roles>) => {
    const next = { ...roles, ...patch };
    next.features = next.features.filter(
      (f) => f !== next.truth && f !== next.prediction && f !== next.id && f !== next.time,
    );
    setRoles(next);
  };
  const select = (key: 'truth' | 'prediction' | 'id' | 'time', label: string) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={roles[key]}
        onChange={(e) => update({ [key]: e.target.value })}
      >
        <option value="">未指定</option>
        {r.columns.map((c) => (
          <option key={c.name}>{c.name}</option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="glass panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOU DEFINE THE QUESTION</span>
          <h2>先告诉工作台，你想研究什么。</h2>
          <p>标签是已知真实结果；预测列是已有模型输出。选择角色不训练模型、不重写原始字段。</p>
        </div>
      </div>
      <div className="role-grid">
        {select('truth', '真实标签列')}
        {select('prediction', '预测结果列')}
        <label>
          任务类型
          <select
            aria-label="评估任务类型"
            value={roles.task}
            onChange={(e) => update({ task: e.target.value as Roles['task'] })}
          >
            <option value="classification">分类</option>
            <option value="regression">回归</option>
          </select>
        </label>
        {!compact && (
          <>
            {select('id', '实体 ID 列')}
            {select('time', '时间列')}
          </>
        )}
      </div>
      <div className="toolbar">
        <button
          disabled={!hasRaw || !roles.truth}
          onClick={() =>
            recompute(
              settings,
              {
                ...overrides,
                [roles.truth]: roles.task === 'classification' ? 'Categorical' : 'Numeric',
              },
              roles.task === 'classification' ? roles.truth : '',
            )
          }
        >
          应用标签角色并更新 EDA
        </button>
        <span className="footnote">当前不均衡目标：{r.target || '未指定'}</span>
      </div>
      {!compact && (
        <>
          <h3>输入特征 / 训练用列（可多选）</h3>
          <p>标签、预测、ID 和时间角色列不会加入特征。此配置用于规划与导出，不隐式删除数据。</p>
          <div className="feature-picker">
            {r.columns.map((c) => (
              <label className="check" key={c.name}>
                <input
                  type="checkbox"
                  disabled={[roles.truth, roles.prediction, roles.id, roles.time].includes(c.name)}
                  checked={roles.features.includes(c.name)}
                  onChange={(e) =>
                    update({
                      features: e.target.checked
                        ? [...roles.features, c.name]
                        : roles.features.filter((f) => f !== c.name),
                    })
                  }
                />
                {c.name}
                <small>{c.type}</small>
              </label>
            ))}
          </div>
          <button
            onClick={() =>
              download(
                JSON.stringify(
                  {
                    source: r.name,
                    ...roles,
                    warning: '仅字段角色配置，未训练模型；请在训练端适配。',
                  },
                  null,
                  2,
                ),
                'datascope-field-roles.json',
                'application/json',
              )
            }
          >
            导出字段角色配置
          </button>
        </>
      )}
    </section>
  );
}
export function ChartStudio() {
  const { report: r, hasRaw, setError } = useStore();
  const [config, setConfig] = useState<ExploreConfig>({
      chart: 'bar',
      x: r?.columns[0]?.name || '',
      y: '',
      group: '',
      aggregate: 'count',
      limit: 20,
    }),
    [result, setResult] = useState<ExploreResult | null>(null),
    [busy, setBusy] = useState(false);
  if (!r) return null;
  const update = (p: Partial<ExploreConfig>) => {
    setConfig({ ...config, ...p });
    setResult(null);
  };
  async function run() {
    setBusy(true);
    try {
      const m = await request({ type: 'explore', config });
      if (m.type === 'explored') setResult(m.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const numericAxis = ['scatter', 'line'].includes(config.chart),
    box = config.chart === 'box';
  let option = {};
  if (result) {
    if (config.chart === 'crosstab') {
      const maximum = Math.max(1, ...result.series.flatMap((s) => s.data as number[]));
      option = {
        tooltip: { trigger: 'item', renderMode: 'richText' },
        xAxis: { type: 'category', data: result.categories },
        yAxis: { type: 'category', data: result.series.map((s) => s.name) },
        visualMap: {
          min: 0,
          max: maximum,
          orient: 'horizontal',
          bottom: 0,
          left: 'center',
          inRange: { color: ['#f0f3fa', '#657fe8'] },
        },
        series: [
          {
            type: 'heatmap',
            data: result.series.flatMap((s, y) => (s.data as number[]).map((v, x) => [x, y, v])),
          },
        ],
      };
    } else
      option = {
        legend:
          result.series.length > 1
            ? { data: result.series.map((s) => s.name), bottom: 0 }
            : undefined,
        tooltip: { trigger: numericAxis ? 'item' : 'axis', renderMode: 'richText' },
        xAxis: {
          type: numericAxis ? 'value' : 'category',
          name: config.x,
          data: numericAxis ? undefined : result.categories,
        },
        yAxis: { type: 'value', name: numericAxis ? config.y : '' },
        dataZoom: result.categories.length > 15 || numericAxis ? [{ type: 'inside' }] : [],
        series: result.series.map((s) => ({
          name: s.name,
          type: numericAxis ? config.chart : box ? 'boxplot' : 'bar',
          data: box ? [s.data] : s.data,
          symbolSize: 6,
          barMaxWidth: 32,
          smooth: false,
        })),
      };
  }
  return (
    <section className="glass panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BUILD YOUR OWN VIEW</span>
          <h2>选几列，换一个角度。</h2>
          <p>自由组合字段、分组与聚合。基于全表计算，展示上限会明确注明。</p>
        </div>
        <span className="badge">交互式图表工作台</span>
      </div>
      <div className="chart-controls">
        <label>
          图表
          <select
            aria-label="自选图表类型"
            value={config.chart}
            onChange={(e) => update({ chart: e.target.value as ExploreConfig['chart'] })}
          >
            <option value="bar">分类柱状图</option>
            <option value="histogram">数值直方图</option>
            <option value="box">数值箱线图</option>
            <option value="scatter">散点图 · 两数值字段</option>
            <option value="line">折线图 · 按数值 X 排序</option>
            <option value="crosstab">交叉频数热力图</option>
            <option value="missing">字段缺失图</option>
          </select>
        </label>
        {(['x', 'y', 'group'] as const).map((key, i) => (
          <label key={key}>
            {['X 字段', 'Y 数值字段', '分组字段'][i]}
            <select
              aria-label={['图表 X 字段', '图表 Y 字段', '图表分组字段'][i]}
              value={config[key]}
              onChange={(e) => update({ [key]: e.target.value })}
            >
              <option value="">不选择</option>
              {r.columns.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          聚合
          <select
            aria-label="图表聚合方式"
            value={config.aggregate}
            onChange={(e) => update({ aggregate: e.target.value as ExploreConfig['aggregate'] })}
          >
            <option value="count">样本数</option>
            <option value="mean">Y 平均值</option>
            <option value="sum">Y 求和</option>
          </select>
        </label>
        <label>
          类别上限
          <select
            aria-label="图表类别上限"
            value={config.limit}
            onChange={(e) => update({ limit: +e.target.value })}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button className="primary" disabled={!hasRaw || busy} onClick={run}>
          {busy ? '计算中…' : '生成 / 更新图表'}
        </button>
        <span className="footnote">
          柱状图支持 count / mean / sum；散点和折线要求数值 X/Y；交叉表按 X × 分组计数。
        </span>
      </div>
      {result ? (
        <>
          <Chart label="用户自选字段图表" option={option} height={350} />
          {result.r !== undefined && (
            <p>
              Pearson r = {result.r === null ? '未定义' : result.r.toFixed(4)} · 有效配对{' '}
              {result.valid}
            </p>
          )}
          {result.warnings.map((w) => (
            <p key={w} className="footnote">
              {w}
            </p>
          ))}
          <button
            onClick={() =>
              download(
                JSON.stringify({ config, result }, null, 2),
                'datascope-chart-data.json',
                'application/json',
              )
            }
          >
            导出图表数据与配置
          </button>
        </>
      ) : (
        <div className="chart-placeholder">
          <span>01 选择图表</span>
          <span>02 指定字段</span>
          <span>03 探索关系</span>
        </div>
      )}
    </section>
  );
}
export function PredictionEvaluation() {
  const { roles, hasRaw, setError } = useStore();
  const [result, setResult] = useState<EvaluateResult | null>(null),
    [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const m = await request({
        type: 'evaluate',
        truth: roles.truth,
        prediction: roles.prediction,
        task: roles.task,
      });
      if (m.type === 'evaluated') setResult(m.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass panel">
      <h2>真实标签 × 已有预测</h2>
      <p>在上方手动指定两列后评估。分类输出混淆矩阵和各类指标；回归输出 MAE、RMSE、R² 和残差图。</p>
      <div className="toolbar">
        <span className="badge">
          {roles.truth || '未选真实列'} → {roles.prediction || '未选预测列'}
        </span>
        <button disabled={!hasRaw || !roles.truth || !roles.prediction || busy} onClick={run}>
          {busy ? '评估中…' : '分析已有预测'}
        </button>
      </div>
      {result && (
        <>
          <dl className="stat-grid">
            {result.metrics.map(([name, v]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{v.toFixed(4)}</dd>
              </div>
            ))}
          </dl>
          <p>
            有效配对 {result.n} · 排除 {result.excluded} 行空白 / 无效配对
          </p>
          {result.task === 'classification' ? (
            <>
              <Chart
                label="真实标签与预测混淆矩阵"
                height={400}
                option={{
                  tooltip: { trigger: 'item', renderMode: 'richText' },
                  grid: { left: 100, right: 30, bottom: 80 },
                  xAxis: { type: 'category', name: '预测', data: result.labels },
                  yAxis: { type: 'category', name: '真实', data: result.labels },
                  visualMap: {
                    min: 0,
                    max: Math.max(1, ...result.confusion.flat()),
                    bottom: 0,
                    left: 'center',
                    orient: 'horizontal',
                    inRange: { color: ['#eef2f9', '#657fe8'] },
                  },
                  series: [
                    {
                      type: 'heatmap',
                      label: { show: result.labels.length < 12 },
                      data: result.confusion.flatMap((row, y) => row.map((v, x) => [x, y, v])),
                    },
                  ],
                }}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>类别</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perClass.map((c) => (
                      <tr key={c.label}>
                        <td>{c.label}</td>
                        <td>{c.precision.toFixed(3)}</td>
                        <td>{c.recall.toFixed(3)}</td>
                        <td>{c.f1.toFixed(3)}</td>
                        <td>{c.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Chart
              label="回归预测残差图"
              option={{
                tooltip: { trigger: 'item', renderMode: 'richText' },
                xAxis: { type: 'value', name: '真实值' },
                yAxis: { type: 'value', name: '预测−真实' },
                series: [{ type: 'scatter', data: result.residuals, symbolSize: 7 }],
              }}
            />
          )}
          {result.warnings.map((w) => (
            <p className="footnote" key={w}>
              {w}
            </p>
          ))}
          <button
            onClick={() =>
              download(
                JSON.stringify({ roles, result }, null, 2),
                'datascope-prediction-evaluation.json',
                'application/json',
              )
            }
          >
            导出评估结果
          </button>
        </>
      )}
    </section>
  );
}
