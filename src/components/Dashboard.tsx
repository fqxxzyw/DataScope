import { useEffect, useRef } from 'react';
import { useStore, type Tab } from '../store';
import { Overview, Missing, Duplicates, Issues, Correlation } from './AnalysisPages';
import { Columns, Distribution, TextAnalysis } from './Inspectors';
import { DataPreview } from './DataPreview';
import { RolesPanel, ChartStudio, PredictionEvaluation } from './Explorer';
const panels: { id: Tab; title: string; content: React.ReactNode }[] = [
  { id: 'Data', title: '数据预览 · 搜索 / 排序 / 抽样', content: <DataPreview /> },
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
      <Overview />
      <RolesPanel compact />
      <ChartStudio />
      <PredictionEvaluation key={`${roles.truth}-${roles.prediction}-${roles.task}`} />
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
