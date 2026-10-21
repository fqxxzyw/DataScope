import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { download } from '../components/AnalysisPages';
import { useContextSettings } from './store';
import { InputPanel } from './InputPanel';
import { SettingsPanel } from './SettingsPanel';
import { Help } from './Help';
import { clearHistory, readHistory, saveHistory, type HistoryEntry } from './history';
import { exportAnalysis } from './export';
import {
  Cooccurrence,
  DocumentSelect,
  Frequency,
  Inspector,
  LabelCompare,
  NGram,
  Overview,
  Search,
  Similarity,
  TfIdf,
  Tokens,
  Vectors,
  WordDetail,
  tabs,
  type Matrix,
  type View,
} from './Views';
import type { Analysis, TextDocument, WorkerRequest, WorkerResponse } from './types';
import './contextmap.css';
export function ContextMap() {
  const { settings, stops } = useContextSettings(),
    source = useStore((s) => s.sourceDataset);
  const [documents, setDocuments] = useState<TextDocument[]>([]),
    [name, setName] = useState(''),
    [result, setResult] = useState<Analysis | null>(null),
    [view, setView] = useState<View>('Overview'),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [word, setWord] = useState(''),
    [doc, setDoc] = useState(0),
    [matrix, setMatrix] = useState<Matrix | null>(null),
    [input, setInput] = useState(true),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [summary, setSummary] = useState<HistoryEntry | null>(null),
    [include, setInclude] = useState(false),
    [sourceColumn, setSourceColumn] = useState(0),
    [sourceLabel, setSourceLabel] = useState(-1);
  const worker = useRef<Worker | null>(null),
    cancelled = useRef(false);
  const refresh = () =>
    readHistory()
      .then(setHistory)
      .catch(() => setError('浏览器不允许 IndexedDB；分析仍可使用，但无法保存历史摘要。'));
  useEffect(() => {
    void refresh();
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    if (!documents.length) return;
    worker.current?.terminate();
    cancelled.current = false;
    setBusy('等待重新计算…');
    setError('');
    setResult(null);
    setMatrix(null);
    const timer = setTimeout(() => {
      if (cancelled.current) return;
      const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (cancelled.current || worker.current !== w) return;
        if (m.type === 'progress') setBusy(m.message);
        if (m.type === 'error') {
          setError(m.message);
          setBusy('');
        }
        if (m.type === 'matrix') {
          setMatrix(m);
          setBusy('');
        }
        if (m.type === 'result') {
          m.data.vectors = m.data.vectors.map((v) => Object.assign(Object.create(null), v));
          setResult(m.data);
          setBusy('');
          void saveHistory(name, m.data)
            .then(refresh)
            .catch(() => setError('无法保存历史摘要，当前分析仍可使用。'));
        }
      };
      w.onerror = () => {
        setError('本地 Worker 加载失败，请重新打开分析。');
        setBusy('');
      };
      w.postMessage({
        type: 'analyze',
        documents,
        settings,
        stops: stops[settings.language],
      } satisfies WorkerRequest);
    }, 250);
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
    };
  }, [documents, name, settings, stops]);
  const load = (docs: TextDocument[], filename: string) => {
    if (!docs.length) {
      setError('没有非空文本');
      return;
    }
    setDocuments(docs);
    setName(filename);
    setInput(false);
    setSummary(null);
    setWord('');
    setDoc(0);
    setView('Overview');
  };
  const onWord = useCallback((w: string) => setWord(w), []);
  const inspect = (i: number) => {
    setDoc(i);
    setView('Pipeline');
  };
  const matrixRequest = (indices: number[]) => {
    setBusy('Calculating Similarity Matrix');
    worker.current?.postMessage({ type: 'matrix', indices } satisfies WorkerRequest);
  };
  return (
    <div className="contextmap">
      <header className="cm-header">
        <div>
          <h1>
            ContextMap <small>文本语义关系探索器</small>
          </h1>
          <p>Local Analysis · Your text stays on this device.</p>
        </div>
        <button onClick={() => setInput(!input)}>{input ? '收起输入' : '打开 / 粘贴文本'}</button>
      </header>
      {(input || !documents.length) && (
        <>
          <InputPanel onLoad={load} />
          {source && (
            <section className="cm-source">
              <h3>使用 DataScope 当前数据 · {source.name}</h3>
              <div className="cm-controls">
                <label>
                  Text Column
                  <select value={sourceColumn} onChange={(e) => setSourceColumn(+e.target.value)}>
                    {source.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {source.name} · {h}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Label Column
                  <select value={sourceLabel} onChange={(e) => setSourceLabel(+e.target.value)}>
                    <option value={-1}>无标签</option>
                    {source.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {source.name} · {h}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => {
                    if (sourceColumn === sourceLabel) {
                      setError('正文与标签列不能相同');
                      return;
                    }
                    load(
                      source.rows
                        .filter((r) => r[sourceColumn]?.trim())
                        .map((r) => ({
                          text: r[sourceColumn],
                          ...(sourceLabel >= 0 ? { label: r[sourceLabel] } : {}),
                        })),
                      source.name,
                    );
                  }}
                >
                  探索当前数据
                </button>
                <Help
                  title="沿用当前数据"
                  steps={['DataScope 数据', '选择正文 / 标签', 'ContextMap']}
                >
                  直接使用已导入的数据，无需另开应用。大于 10,000 行时，请先在数据集划分中抽样。
                </Help>
              </div>
            </section>
          )}
        </>
      )}
      <SettingsPanel />
      {error && (
        <p role="alert" className="cm-error">
          {error}
        </p>
      )}
      {busy && (
        <div role="status" className="cm-progress">
          <span>{busy}</span>
          <progress />
          <button
            onClick={() => {
              cancelled.current = true;
              worker.current?.terminate();
              setBusy('');
              setError('分析已取消。修改设置或重新载入文本可再次计算。');
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {result && (
        <>
          <div className="cm-stats">
            <b>{name}</b>
            <span>{result.documents.length.toLocaleString()} documents</span>
            <span>{result.tokenCount.toLocaleString()} tokens</span>
            <span>{result.frequency.length.toLocaleString()} unique words</span>
          </div>
          <nav className="cm-tabs" aria-label="ContextMap 视图">
            {tabs.map((t) => (
              <button
                key={t}
                aria-current={view === t ? 'page' : undefined}
                onClick={() => {
                  setView(t);
                  setWord('');
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          <section className="cm-view" key={documents === result.documents ? 'current' : name}>
            <h2>{view}</h2>
            {view === 'Overview' && <Overview a={result} onInspect={inspect} />}
            {view === 'Tokens' && <Tokens a={result} onWord={onWord} />}
            {view === 'Frequency' && <Frequency a={result} onWord={onWord} />}
            {view === 'N-Gram' && <NGram a={result} />}
            {view === 'TF-IDF' && <TfIdf a={result} />}
            {view === 'Co-occurrence' && <Cooccurrence a={result} onWord={onWord} word={word} />}
            {view === 'Vector' && <Vectors a={result} />}
            {view === 'Similarity' && (
              <Similarity a={result} matrix={matrix} onMatrix={matrixRequest} />
            )}
            {view === 'Search' && <Search a={result} onWord={onWord} />}
            {view === 'Label Compare' && <LabelCompare a={result} />}
            {view === 'Pipeline' && (
              <>
                <DocumentSelect a={result} value={doc} onChange={setDoc} />
                <Help title="Pipeline Inspector" steps={['Raw 原文', '清洗 / 分词', 'TF-IDF 向量']}>
                  逐步显示真实中间值。关闭步骤后标记 OFF，使用上一阶段结果；上方设置改变后自动重算。
                </Help>
                <Inspector a={result} index={doc} />
              </>
            )}
            {word && <WordDetail a={result} word={word} />}
          </section>
          <section className="cm-export">
            <h3>
              Export{' '}
              <Help title="导出" steps={['统计结果', 'CSV / JSON', '设备本地文件']}>
                默认导出聚合统计，不附带完整原始文本。勾选 Include Source Text 后，仅 Analysis JSON
                会包含正文与标签。
              </Help>
            </h3>
            <label>
              <input
                type="checkbox"
                checked={include}
                onChange={(e) => setInclude(e.target.checked)}
              />
              Include Source Text
            </label>
            <div className="cm-controls">
              {['frequency', 'ngram', 'tfidf', 'cooccurrence', 'analysis'].map((kind) => (
                <button
                  key={kind}
                  onClick={() =>
                    download(
                      exportAnalysis(result, kind, include),
                      `${kind === 'frequency' ? 'word-frequency' : kind}.${kind === 'analysis' ? 'json' : 'csv'}`,
                      kind === 'analysis' ? 'application/json' : 'text/csv',
                    )
                  }
                >
                  {kind === 'analysis' ? 'Analysis JSON' : `${kind} CSV`}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      {history.length > 0 && (
        <details className="cm-history">
          <summary>Recent Analysis · 最近 5 个统计摘要</summary>
          <p>不保存原文。历史摘要可查看统计；完整交互需重新导入源文件。</p>
          <button
            onClick={() =>
              void clearHistory()
                .then(() => {
                  setHistory([]);
                  setSummary(null);
                })
                .catch(() => setError('无法清除历史记录'))
            }
          >
            清除历史
          </button>
          {history.map((h) => (
            <button key={h.id} onClick={() => setSummary(h)}>
              {h.name} · {h.documents} documents · {h.tokens} tokens ·{' '}
              {new Date(h.id).toLocaleString()}
            </button>
          ))}
          {summary && (
            <section>
              <h3>{summary.name} · 历史摘要</h3>
              <p>
                {summary.documents} documents / {summary.tokens} tokens / {summary.uniqueTokens}{' '}
                unique words
              </p>
              <div className="cm-chips">
                {summary.frequency.slice(0, 20).map((t) => (
                  <span key={t.word}>
                    {t.word}: {t.count}
                  </span>
                ))}
              </div>
            </section>
          )}
        </details>
      )}
    </div>
  );
}
