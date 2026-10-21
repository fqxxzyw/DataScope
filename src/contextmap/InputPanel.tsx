import { useEffect, useRef, useState } from 'react';
import { demos } from './demos';
import { Help } from './Help';
import type { Parsed, TextDocument, WorkerRequest, WorkerResponse } from './types';
import { selectDocuments } from './parser';
import { LIMITS } from './defaults';
export function InputPanel({ onLoad }: { onLoad: (docs: TextDocument[], name: string) => void }) {
  const [text, setText] = useState(''),
    [parsed, setParsed] = useState<Parsed | null>(null),
    [raw, setRaw] = useState<{ text: string; name: string } | null>(null),
    [header, setHeader] = useState(true),
    [whole, setWhole] = useState(false),
    [tc, setTc] = useState(0),
    [lc, setLc] = useState(-1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    file = useRef<HTMLInputElement>(null);
  const activeWorker = useRef<Worker | null>(null);
  useEffect(() => () => activeWorker.current?.terminate(), []);
  const parse = (data: { text: string; name: string }, h: boolean, w: boolean) => {
    activeWorker.current?.terminate();
    setError('');
    setBusy(true);
    setParsed(null);
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    activeWorker.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (activeWorker.current !== worker) return;
      if (e.data.type === 'parsed') {
        setParsed(e.data.data);
        setTc(0);
        setLc(-1);
      }
      if (e.data.type === 'error') setError(e.data.message);
      setBusy(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setError('文件解析失败');
      setBusy(false);
      worker.terminate();
    };
    worker.postMessage({ type: 'parse', ...data, header: h, whole: w } satisfies WorkerRequest);
  };
  return (
    <section className="cm-input">
      <h2>ContextMap</h2>
      <p>Explore how text becomes features. · 从文字到统计特征，再到向量。</p>
      <textarea
        aria-label="Paste Text"
        placeholder="粘贴文本：默认一行一条文档"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
      />
      <div className="cm-controls">
        <button
          onClick={() => {
            if (text.length > LIMITS.characters) {
              setError('最多 200 万字符');
              return;
            }
            onLoad(
              (whole ? [text] : text.split(/\r?\n/))
                .filter((v) => v.trim())
                .map((text) => ({ text })),
              '粘贴文本',
            );
          }}
        >
          分析粘贴文本
        </button>
        <Help title="粘贴文本" steps={['每行文本', '文档 1 / 文档 2', '分词统计']}>
          默认每一行作为一个独立文档。空行不进入分析。
        </Help>
        <button onClick={() => file.current?.click()}>Open File</button>
        <Help title="导入文本" steps={['CSV / TSV / TXT', '预览原数据', '选择正文与标签']}>
          表格先预览，再选择来源明确的 Text Column 和可选 Label Column。没有表头时取消下方表头选项。
        </Help>
        <input
          ref={file}
          type="file"
          hidden
          accept=".txt,.csv,.tsv"
          aria-label="ContextMap 文件"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > LIMITS.characters * 4) {
              setError('文件太大，请先抽样');
              return;
            }
            const data = { text: await f.text(), name: f.name };
            setRaw(data);
            parse(data, header, whole);
            e.target.value = '';
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={whole}
            onChange={(e) => {
              setWhole(e.target.checked);
              if (raw) parse(raw, header, e.target.checked);
            }}
          />
          TXT / 粘贴：整段作为一篇文档
        </label>
      </div>
      <div className="cm-controls">
        <span>Try Demo</span>
        {Object.keys(demos).map((name) => (
          <button key={name} onClick={() => onLoad(demos[name], name)}>
            {name}
          </button>
        ))}
      </div>
      {busy && <p role="status">正在本地解析…</p>}
      {error && <p role="alert">{error}</p>}
      {parsed && (
        <div>
          <h3>原始数据 · {parsed.name}</h3>
          <label>
            <input
              type="checkbox"
              checked={header}
              onChange={(e) => {
                setHeader(e.target.checked);
                if (raw) parse(raw, e.target.checked, whole);
              }}
            />
            CSV / TSV 第一行是表头
          </label>
          <p>
            {parsed.rows.length} 行；预览前 5 行。
            {parsed.generated && '红色标题由程序自动生成，不属于原始数据。'}
          </p>
          <div className="cm-table-wrap">
            <table className={parsed.generated ? 'cm-generated' : ''}>
              <thead>
                <tr>
                  {parsed.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cm-controls">
            <label>
              Text Column
              <select aria-label="Text Column" value={tc} onChange={(e) => setTc(+e.target.value)}>
                {parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {parsed.name} · {h}
                  </option>
                ))}
              </select>
            </label>
            <Help title="正文列" steps={['文件名 · 字段', '每行正文', '文档列表']}>
              选择要分析的文本字段，其他列不会拼接进正文。
            </Help>
            <label>
              Label Column
              <select aria-label="Label Column" value={lc} onChange={(e) => setLc(+e.target.value)}>
                <option value={-1}>不使用标签</option>
                {parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {parsed.name} · {h}
                  </option>
                ))}
              </select>
            </label>
            <Help title="标签列" steps={['positive / negative', '分组', '词频对比']}>
              数字与文字标签都可用于分组比较，不训练模型。
            </Help>
            <button
              onClick={() => {
                try {
                  onLoad(selectDocuments(parsed, tc, lc), parsed.name);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              使用所选字段分析
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
