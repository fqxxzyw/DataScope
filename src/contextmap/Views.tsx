import { useState } from 'react';
import { Bars, Chart } from '../components/Chart';
import { Help } from './Help';
import { Network } from './Network';
import { LIMITS } from './defaults';
import { context, countNgrams, frequency, idf, ngrams, sparseCosine, tf } from './nlp';
import { useContextSettings } from './store';
import type { Analysis, WorkerResponse } from './types';
export const tabs = [
  'Overview',
  'Tokens',
  'Frequency',
  'N-Gram',
  'TF-IDF',
  'Co-occurrence',
  'Vector',
  'Similarity',
  'Search',
  'Label Compare',
  'Pipeline',
] as const;
export type View = (typeof tabs)[number];
export function DocumentSelect({
  a,
  value,
  onChange,
  label = 'Document',
}: {
  a: Analysis;
  value: number;
  onChange: (n: number) => void;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => onChange(+e.target.value)}>
        {a.documents.map((d, i) => (
          <option key={i} value={i}>
            #{i + 1} · {d.text.slice(0, 35)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Inspector({ a, index }: { a: Analysis; index: number }) {
  const stages = a.stages[index] || [];
  return (
    <div className="cm-inspector">
      <h3>Inspect Sentence #{index + 1}</h3>
      {stages.map((s, i) => (
        <section key={s.name}>
          <h4>
            {i + 1}. {s.name} {!s.enabled && '（OFF · 跳过）'}
          </h4>
          {Array.isArray(s.value) ? (
            <div className="cm-chips">
              {s.value.map((t, j) => (
                <span key={j}>{t}</span>
              ))}
            </div>
          ) : (
            <p>{s.value}</p>
          )}
        </section>
      ))}
      <section>
        <h4>TF-IDF Vector · Top 20</h4>
        <div className="cm-chips">
          {Object.entries(a.vectors[index] || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word, value]) => (
              <span key={word}>
                {word} <b>{value.toFixed(4)}</b>
              </span>
            ))}
        </div>
      </section>
    </div>
  );
}
function Top() {
  const { settings, setSettings } = useContextSettings();
  return (
    <label>
      Top Words
      <select
        aria-label="Top Words"
        value={settings.top}
        onChange={(e) => setSettings({ top: +e.target.value })}
      >
        {[20, 50, 100].map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
export function WordDetail({ a, word }: { a: Analysis; word: string }) {
  const [window, setWindow] = useState(5),
    t = a.frequency.find((t) => t.word === word);
  if (!t) return null;
  return (
    <aside className="cm-word-detail">
      <h3>{word} · Context / KWIC</h3>
      <p>
        Frequency <b>{t.count}</b> · Document Frequency <b>{t.df}</b> / {a.documents.length} ·
        占全部 Token <b>{a.tokenCount ? ((t.count / a.tokenCount) * 100).toFixed(2) : 0}%</b>
      </p>
      <label>
        Context Window{' '}
        <select value={window} onChange={(e) => setWindow(+e.target.value)}>
          {[3, 5, 10].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <Help title="KWIC" steps={['前 5 个 Token', '关键词', '后 5 个 Token']}>
        Key Word In Context：在处理后的 Token 序列中查看关键词前后文，最多显示 30 个匹配。
      </Help>
      {context(a.tokens, word, window)
        .slice(0, 30)
        .map((c, i) => (
          <p key={i}>
            #{c.document + 1} {c.before.join(' ')} <mark>{c.word}</mark> {c.after.join(' ')}
          </p>
        ))}
    </aside>
  );
}
export function Overview({ a, onInspect }: { a: Analysis; onInspect: (i: number) => void }) {
  const [page, setPage] = useState(0);
  const rows = a.documents.slice(page * LIMITS.preview, (page + 1) * LIMITS.preview);
  return (
    <>
      <h3>原始文本 · 点击一行查看处理过程</h3>
      <p>统计以当前文档边界为单位；先看原数据，再探索特征。</p>
      <div className="cm-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Raw Text</th>
              <th>Label</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={i}>
                <td>#{page * LIMITS.preview + i + 1}</td>
                <td>
                  <button
                    className="cm-text-button"
                    onClick={() => onInspect(page * LIMITS.preview + i)}
                  >
                    {d.text}
                  </button>
                </td>
                <td>{d.label ?? '—'}</td>
                <td>{a.tokens[page * LIMITS.preview + i].length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cm-controls">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          上一页
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(a.documents.length / LIMITS.preview))}
        </span>
        <button
          disabled={(page + 1) * LIMITS.preview >= a.documents.length}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </>
  );
}
export function Tokens({ a, onWord }: { a: Analysis; onWord: (w: string) => void }) {
  const [show, setShow] = useState(false),
    [doc, setDoc] = useState(0);
  return (
    <>
      <div className="cm-controls">
        <DocumentSelect a={a} value={doc} onChange={setDoc} />
        <label>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show Stop Words
        </label>
        <Help title="Tokens" steps={['原句', '词边界', 'Token 列表']}>
          Show Stop Words 显示停用词删除和长度过滤前的分词结果；点击任一 Token 查看上下文。
        </Help>
      </div>
      <p>{a.documents[doc]?.text}</p>
      <div className="cm-chips">
        {(show ? a.beforeStops : a.tokens)[doc]?.map((t, i) => (
          <button key={i} onClick={() => onWord(t)}>
            {t}
          </button>
        ))}
      </div>
    </>
  );
}
export function Frequency({ a, onWord }: { a: Analysis; onWord: (w: string) => void }) {
  const [search, setSearch] = useState('');
  const terms = a.frequency
    .filter((t) => t.count >= a.settings.minFrequency && t.word.includes(search))
    .slice(0, a.settings.top);
  return (
    <>
      <div className="cm-controls">
        <Top />
        <input
          aria-label="Search Word"
          placeholder="Search Word"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Help title="词频" steps={['酒店 / 服务 / 酒店', '酒店 × 2', '文档频次 × 1']}>
          Frequency 是出现次数；Document Frequency
          是包含该词的文档数。点击图中柱条或下方词语查看上下文。
        </Help>
      </div>
      <Chart
        label="Top Words"
        height={Math.max(320, terms.length * 25)}
        onClick={(p) => {
          if (p.name) onWord(p.name);
        }}
        option={{
          xAxis: { type: 'value' },
          yAxis: { type: 'category', inverse: true, data: terms.map((t) => t.word) },
          series: [{ type: 'bar', data: terms.map((t) => t.count) }],
        }}
      />
      <div className="cm-chips">
        {terms.map((t) => (
          <button key={t.word} onClick={() => onWord(t.word)}>
            {t.word} · {t.count}
          </button>
        ))}
      </div>
    </>
  );
}
export function NGram({ a }: { a: Analysis }) {
  const { setSettings } = useContextSettings(),
    [doc, setDoc] = useState(0),
    [position, setPosition] = useState(0);
  const words = a.tokens[doc] || [],
    grams = ngrams(words, a.settings.n),
    pos = Math.min(position, Math.max(0, grams.length - 1));
  return (
    <>
      <div className="cm-controls">
        <label>
          N-Gram
          <select
            aria-label="N-Gram"
            value={a.settings.n}
            onChange={(e) => {
              setPosition(0);
              setSettings({ n: +e.target.value as 1 | 2 | 3 });
            }}
          >
            <option value={1}>Unigram</option>
            <option value={2}>Bigram</option>
            <option value={3}>Trigram</option>
          </select>
        </label>
        <Top />
        <Help title="滑动窗口" steps={['我 喜欢', '喜欢 学习', '学习 NLP']}>
          窗口每次右移一个 Token，取相邻 N 个词；不会跨越文档边界。停用词删除后相邻的词也会组成
          N-Gram。
        </Help>
      </div>
      <DocumentSelect
        a={a}
        value={doc}
        onChange={(i) => {
          setDoc(i);
          setPosition(0);
        }}
      />
      <div className="cm-sliding">
        <div className="cm-chips">
          {words.slice(0, 100).map((w, i) => (
            <span className={i >= pos && i < pos + a.settings.n ? 'cm-active-token' : ''} key={i}>
              {w}
            </span>
          ))}
        </div>
        <label>
          Sliding Window{' '}
          <input
            type="range"
            min={0}
            max={Math.min(99, Math.max(0, grams.length - 1))}
            value={pos}
            onChange={(e) => setPosition(+e.target.value)}
          />
        </label>
        <button
          onClick={() => setPosition(grams.length ? (pos + 1) % Math.min(100, grams.length) : 0)}
        >
          向右移动一步
        </button>
        <p>{grams[pos]?.join(' → ') || 'Token 不足，无法形成该 N-Gram'}</p>
      </div>
      <Bars
        label="Top N-Gram"
        horizontal
        items={a.ngrams.filter((g) => g[1] >= a.settings.minFrequency).slice(0, a.settings.top)}
        height={Math.max(320, a.settings.top * 24)}
      />
    </>
  );
}
export function TfIdf({ a }: { a: Analysis }) {
  const [doc, setDoc] = useState(0),
    [chosen, setChosen] = useState(''),
    [explain, setExplain] = useState(true);
  const terms = Object.entries(a.vectors[doc] || {}).sort((a, b) => b[1] - a[1]);
  const word = terms.some((t) => t[0] === chosen) ? chosen : terms[0]?.[0];
  const count = a.tokens[doc]?.filter((t) => t === word).length || 0,
    total = a.tokens[doc]?.length || 0,
    df = a.frequency.find((t) => t.word === word)?.df || 0;
  return (
    <>
      <div className="cm-controls">
        <DocumentSelect a={a} value={doc} onChange={setDoc} />
        <button onClick={() => setExplain(!explain)}>Explain Calculation</button>
        <Help title="TF-IDF" steps={['词频 / 文档长度', '× 稀有度 IDF', '文本特征权重']}>
          TF 按文档长度归一化；IDF 降低在多篇文档都出现的公共词权重。点击一个词查看真实计算。
        </Help>
      </div>
      <div className="cm-chips">
        {terms.slice(0, a.settings.top).map(([w, v]) => (
          <button
            key={w}
            className={w === word ? 'active' : ''}
            onClick={() => {
              setChosen(w);
              setExplain(true);
            }}
          >
            {w} · {v.toFixed(4)}
          </button>
        ))}
      </div>
      <Bars label="Top TF-IDF Terms" horizontal items={terms.slice(0, 20)} />
      {explain && word && (
        <section className="cm-formula">
          <h3>
            {word} · Document #{doc + 1}
          </h3>
          <p>
            出现 {count} 次 / 当前文本 {total} 个 Token
          </p>
          <p>
            TF = {count} / {total} = <b>{tf(count, total).toFixed(6)}</b>
          </p>
          <p>
            Document Frequency = {df} / {a.documents.length}
          </p>
          <p>
            IDF = ln(({a.documents.length} + 1) / ({df} + 1)) + 1 ={' '}
            <b>{idf(a.documents.length, df).toFixed(6)}</b>
          </p>
          <p>
            TF-IDF = {tf(count, total).toFixed(6)} × {idf(a.documents.length, df).toFixed(6)} ={' '}
            <b>{a.vectors[doc][word].toFixed(6)}</b>
          </p>
        </section>
      )}
    </>
  );
}
export function Heatmap({
  labels,
  values,
  label,
  onClick,
}: {
  labels: string[];
  values: [number, number, number][];
  label: string;
  onClick?: (x: number, y: number) => void;
}) {
  return (
    <Chart
      label={label}
      height={Math.max(380, labels.length * 17)}
      onClick={(p) => {
        if (Array.isArray(p.data)) onClick?.(Number(p.data[0]), Number(p.data[1]));
      }}
      option={{
        tooltip: { trigger: 'item' },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45 } },
        yAxis: { type: 'category', data: labels },
        visualMap: {
          min: 0,
          max: Math.max(1, ...values.map((v) => v[2])),
          calculable: true,
          orient: 'horizontal',
          bottom: 0,
        },
        series: [{ type: 'heatmap', data: values }],
      }}
    />
  );
}
export function Cooccurrence({
  a,
  onWord,
  word,
}: {
  a: Analysis;
  onWord: (w: string) => void;
  word: string;
}) {
  const { setSettings } = useContextSettings(),
    [network, setNetwork] = useState(false);
  const terms = a.frequency
      .filter((t) => t.count >= a.settings.minFrequency)
      .slice(0, network ? a.settings.graphNodes : 30),
    allowed = new Set(terms.map((t) => t.word)),
    edges = a.edges.filter(
      (e) =>
        allowed.has(e.source) &&
        allowed.has(e.target) &&
        (network ? e.weight >= a.settings.minEdge : true),
    );
  const pairs = new Map(
    edges.flatMap(
      (e) =>
        [
          [JSON.stringify([e.source, e.target]), e.weight],
          [JSON.stringify([e.target, e.source]), e.weight],
        ] as [string, number][],
    ),
  );
  return (
    <>
      <div className="cm-controls">
        <label>
          Co-occurrence Window
          <select
            aria-label="Co-occurrence Window"
            value={a.settings.window}
            onChange={(e) => setSettings({ window: +e.target.value })}
          >
            {[2, 3, 5, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setNetwork(!network)}>
          {network ? '显示 Matrix' : '显示 Word Network'}
        </button>
        <Help title="共现窗口" steps={['酒店 / 服务 / 很好', '距离 ≤ Window', '词对计数 + 1']}>
          在同一文档内，Token 距离不超过 Window
          的不同词视为共现。每个位置对只数一次；矩阵对称，对角线为零。关系词表最多 100 词。
        </Help>
        {network && (
          <Help title="网络操作" steps={['拖动节点', '滚轮缩放 / 拖动平移', '点击突出邻居']}>
            节点大小表示词频；边宽表示共现次数。最小边权和节点上限在分析设置中调整。
          </Help>
        )}
      </div>
      {network ? (
        edges.length > LIMITS.edges ? (
          <p role="alert">
            Too many relationships. Increase the minimum edge weight. 当前 {edges.length}{' '}
            条边，最多显示 {LIMITS.edges} 条。
          </p>
        ) : (
          <Network terms={terms} edges={edges} selected={word} onSelect={onWord} />
        )
      ) : (
        <Heatmap
          label="Co-occurrence Matrix"
          labels={terms.map((t) => t.word)}
          values={terms.flatMap((t, i) =>
            terms.map((u, j): [number, number, number] => [
              i,
              j,
              pairs.get(JSON.stringify([t.word, u.word])) || 0,
            ]),
          )}
          onClick={(x) => onWord(terms[x].word)}
        />
      )}
    </>
  );
}
export function Vectors({ a }: { a: Analysis }) {
  const [doc, setDoc] = useState(0);
  const terms = Object.entries(a.vectors[doc] || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  return (
    <>
      <DocumentSelect a={a} value={doc} onChange={setDoc} />
      <Help title="文本向量" steps={['统一词表', '每个词一个维度', 'TF-IDF 权重']}>
        所有文档使用相同词表；未出现的词对应零。这里展示当前文档权重最高的 20
        个维度，实际相似度使用完整稀疏向量。
      </Help>
      <p>
        完整词表 {a.frequency.length} 维 · 当前非零维度 {Object.keys(a.vectors[doc] || {}).length}
      </p>
      <Bars label="TF-IDF Vector" horizontal items={terms} />
      <div className="cm-chips">
        {terms.map(([w, n]) => (
          <span key={w}>
            {w} = {n.toFixed(4)}
          </span>
        ))}
      </div>
    </>
  );
}
export type Matrix = Extract<WorkerResponse, { type: 'matrix' }>;
export function Similarity({
  a,
  matrix,
  onMatrix,
}: {
  a: Analysis;
  matrix: Matrix | null;
  onMatrix: (ids: number[]) => void;
}) {
  const [left, setLeft] = useState(0),
    [right, setRight] = useState(Math.min(1, a.documents.length - 1)),
    [mode, setMode] = useState('first'),
    [start, setStart] = useState(1);
  const va = a.vectors[left] || {},
    vb = a.vectors[right] || {},
    shared = Object.keys(va)
      .filter((w) => vb[w] > 0)
      .sort((x, y) => va[y] * vb[y] - va[x] * vb[x]);
  const dimensions = [...new Set([...Object.keys(va), ...Object.keys(vb)])]
    .sort((x, y) => (va[y] || 0) + (vb[y] || 0) - (va[x] || 0) - (vb[x] || 0))
    .slice(0, 20);
  return (
    <>
      <div className="cm-controls">
        <DocumentSelect a={a} value={left} onChange={setLeft} label="Sentence A" />
        <DocumentSelect a={a} value={right} onChange={setRight} label="Sentence B" />
        <Help title="余弦相似度" steps={['完整 TF-IDF 向量', '点积 / 两个模长', '比较向量方向']}>
          这是基于当前 TF-IDF 表示计算出的余弦相似度，不等同于深层语义理解。空向量相似度为 0。
        </Help>
      </div>
      <h2>Cosine Similarity · {sparseCosine(va, vb).toFixed(6)}</h2>
      <p>这是基于当前 TF-IDF 表示计算出的余弦相似度，并不等同于真正的深层语义理解。</p>
      <h3>Shared Important Terms</h3>
      <div className="cm-chips">
        {shared.slice(0, 20).map((w) => (
          <span key={w}>{w}</span>
        ))}
        {!shared.length && '没有共享的非零维度'}
      </div>
      <div className="cm-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dimension · Top 20</th>
              <th>Vector A</th>
              <th>Vector B</th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map((w) => (
              <tr key={w}>
                <td>{w}</td>
                <td>{(va[w] || 0).toFixed(5)}</td>
                <td>{(vb[w] || 0).toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cm-controls">
        <label>
          矩阵范围
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="first">前 {a.settings.similarityLimit} 条</option>
            <option value="random">随机 {a.settings.similarityLimit} 条</option>
            <option value="range">自定义范围</option>
          </select>
        </label>
        {mode === 'range' && (
          <label>
            起始文档
            <input
              type="number"
              min={1}
              max={a.documents.length}
              value={start}
              onChange={(e) =>
                setStart(Math.max(1, Math.min(a.documents.length, Number(e.target.value) || 1)))
              }
            />
          </label>
        )}
        <button
          onClick={() => {
            const ids = Array.from({ length: a.documents.length }, (_, i) => i);
            if (mode === 'random')
              for (let i = ids.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ids[i], ids[j]] = [ids[j], ids[i]];
              }
            const offset = mode === 'range' ? start - 1 : 0;
            onMatrix(ids.slice(offset, offset + a.settings.similarityLimit));
          }}
        >
          生成 Similarity Matrix
        </button>
        <Help title="相似度矩阵" steps={['选择 ≤ 100 文档', 'Worker 计算', '点击格子比较']}>
          范围最多取 Similarity Limit 条；随机抽样不重复。点击单元格会更新上方 A / B。
        </Help>
      </div>
      {matrix && (
        <Heatmap
          label="Similarity Matrix"
          labels={matrix.indices.map((i) => `D${i + 1}`)}
          values={matrix.values}
          onClick={(x, y) => {
            setLeft(matrix.indices[x]);
            setRight(matrix.indices[y]);
          }}
        />
      )}
    </>
  );
}
export function Search({ a, onWord }: { a: Analysis; onWord: (w: string) => void }) {
  const [word, setWord] = useState('');
  const t = a.frequency.find((t) => t.word === word),
    grams = countNgrams(a.tokens, 2)
      .filter((g) => g[0].split(' ').includes(word))
      .slice(0, 20),
    edges = a.edges.filter((e) => e.source === word || e.target === word).slice(0, 20);
  return (
    <>
      <label>
        Search
        <input
          placeholder="输入完整 Token"
          value={word}
          onChange={(e) => setWord(e.target.value)}
        />
      </label>
      <Help title="文本搜索" steps={['输入完整 Token', '词频 / Bigram / 共现', '查看原句']}>
        词频使用精确 Token 匹配；原句示例使用子串搜索。Related Words 使用前 100 个高频词的共现关系。
      </Help>
      <p>
        Frequency {t?.count || 0} · Document Frequency {t?.df || 0}
      </p>
      <h3>Top Bigram</h3>
      <div className="cm-chips">
        {grams.map((g) => (
          <span key={g[0]}>
            {g[0]} · {g[1]}
          </span>
        ))}
      </div>
      <h3>Related Words</h3>
      <div className="cm-chips">
        {edges.map((e, i) => (
          <button key={i} onClick={() => onWord(e.source === word ? e.target : e.source)}>
            {e.source === word ? e.target : e.source} · {e.weight}
          </button>
        ))}
      </div>
      <h3>Example Sentences</h3>
      {word &&
        a.documents
          .filter((d) => d.text.includes(word))
          .slice(0, 30)
          .map((d, i) => <p key={i}>{d.text}</p>)}
    </>
  );
}
export function LabelCompare({ a }: { a: Analysis }) {
  const labels = [
    ...new Set(a.documents.map((d) => d.label).filter((l): l is string => l !== undefined)),
  ];
  const [left, setLeft] = useState(labels[0] || ''),
    [right, setRight] = useState(labels[1] || labels[0] || '');
  if (!labels.length) return <p>请导入带标签的 CSV / TSV，在原始数据预览中选择 Label Column。</p>;
  return (
    <>
      <p>按标签比较原始字符数、处理后 Token 数和特征词，不训练分类模型。</p>
      <div className="cm-compare">
        {[left, right].map((label, index) => {
          const ids = a.documents.flatMap((d, i) => (d.label === label ? [i] : [])),
            tokens = ids.map((i) => a.tokens[i]);
          return (
            <section key={index}>
              <label>
                Label {index + 1}
                <select
                  value={label}
                  onChange={(e) => (index ? setRight(e.target.value) : setLeft(e.target.value))}
                >
                  {labels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <p>
                {ids.length} 文档 · 平均字符{' '}
                {(
                  ids.reduce((n, i) => n + Array.from(a.documents[i].text).length, 0) / ids.length
                ).toFixed(2)}{' '}
                · 平均 Token {(tokens.reduce((n, t) => n + t.length, 0) / ids.length).toFixed(2)}
              </p>
              <h3>Top Words</h3>
              <Bars
                horizontal
                label={`${label} Top Words`}
                items={frequency(tokens)
                  .slice(0, 20)
                  .map((t) => [t.word, t.count])}
              />
              <h3>Top Bigram</h3>
              <div className="cm-chips">
                {countNgrams(tokens, 2)
                  .slice(0, 20)
                  .map((g) => (
                    <span key={g[0]}>
                      {g[0]} · {g[1]}
                    </span>
                  ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
