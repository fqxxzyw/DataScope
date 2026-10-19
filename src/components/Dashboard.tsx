import { useEffect, useRef } from 'react';
import { useStore, type Tab } from '../store';
import { Overview, Missing, Duplicates, Issues, Correlation } from './AnalysisPages';
import { Columns, Distribution, TextAnalysis } from './Inspectors';
import { DataPreview } from './DataPreview';
import { ChartStudio, PredictionEvaluation } from './Explorer';
import { ColumnGuide } from './ColumnGuide';
const panels: { id: Tab; title: string; content: React.ReactNode }[] = [
  { id: 'Columns', title: '字段统计 · 类型 / 数值 / 文本', content: <Columns /> },
  { id: 'Missing', title: '缺失情况 · 空白与疑似标记', content: <Missing /> },
  { id: 'Duplicates', title: '重复样本 · 组与行索引', content: <Duplicates /> },
  { id: 'Distribution', title: '目标分布 · 类别比例', content: <Distribution /> },
  { id: 'Text', title: '文本探索 · 长度 / 词频 / 类别比较', content: <TextAnalysis /> },
  { id: 'Correlation', title: '数值相关性 · Pearson', content: <Correlation /> },
  { id: 'Issues', title: '问题与建议 · 定位 / 导出', content: <Issues /> },
  { id: 'Next Steps', title: '复核清单 · 下一步行动', content: <Issues checklist /> },
];
export function Dashboard() {
  const { tab, setTab, roles } = useStore();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab === 'Overview') return;
    const section = container.current?.querySelector<HTMLDetailsElement>(
      `details[data-panel="${tab}"]`,
    );
    if (section) {
      section.open = true;
      section.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      });
    }
  }, [tab]);
  return (
    <div ref={container}>
      <div className="page-intro">
        <div>
          <span className="eyebrow">YOUR DATA / 先看数据，再决定下一步</span>
          <h1>这就是你导入的数据。</h1>
          <p>先核对下面的原始值与列标题，再选择正文、标签和你想完成的任务。</p>
        </div>
      </div>
      <DataPreview />
      <div className="workflow-cards">
        <button onClick={() => setTab('Roles')}>
          <b>01 确认字段</b>
          <span>告诉程序哪列是正文、哪列是标签</span>
        </button>
        <button onClick={() => setTab('Prepare')}>
          <b>02 整理数据</b>
          <span>筛选、去重、填补，先预览再应用</span>
        </button>
        <button onClick={() => setTab('Processing')}>
          <b>03 准备训练格式</b>
          <span>fastText / BERT / 回归等格式</span>
        </button>
        <button onClick={() => setTab('Split')}>
          <b>04 划分与导出</b>
          <span>训练 / 验证 / 测试集，检查泄漏</span>
        </button>
      </div>
      <ColumnGuide />
      <details className="analysis-section">
        <summary>
          可视化：选择字段生成图表<span>按需展开</span>
        </summary>
        <ChartStudio />
      </details>
      <details className="analysis-section">
        <summary>
          数据体检与质量概览<span>缺失、重复、异常</span>
        </summary>
        <Overview />
      </details>
      <details className="analysis-section">
        <summary>
          评估已有模型预测<span>需要真实标签和预测列</span>
        </summary>
        <PredictionEvaluation key={`${roles.truth}-${roles.prediction}-${roles.task}`} />
      </details>
      <div className="workspace-jump">
        {panels.map((p) => (
          <button key={p.id} onClick={() => setTab(p.id)}>
            {p.title.split(' · ')[0]}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <details
          className="analysis-section"
          data-panel={p.id}
          key={p.id}
          open={p.id === 'Data' ? true : undefined}
        >
          <summary>
            {p.title}
            <span>展开查看</span>
          </summary>
          {p.content}
        </details>
      ))}
    </div>
  );
}
