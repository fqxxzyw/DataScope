import { useState, useRef, useEffect } from 'react';
import { FolderOpen, FileCheck2, Download } from 'lucide-react';
import { HelpDemo } from './HelpDemo';
import {
  inferFileRole,
  roleNames,
  type FileRole,
  type BundleFile,
  type BundleOptions,
  type BundleOutput,
} from '../engine/bundle';
import type { Dataset } from '../engine/types';
export function FolderStudio({
  files,
  datasets,
  onInspect,
}: {
  files: File[];
  datasets: (Dataset | null)[];
  onInspect: (index: number) => void;
}) {
  const [roles, setRoles] = useState<FileRole[]>(() => files.map((f) => inferFileRole(f.name)));
  const [columns, setColumns] = useState<
    Record<number, { textColumn: string; labelColumn: string }>
  >({});
  const [options, setOptions] = useState<BundleOptions>({
    indexBase: 0,
    useClasses: files.some((f) => inferFileRole(f.name) === 'classes'),
    useStopwords: false,
    tokenize: 'none',
    confirmed: false,
  });
  const [result, setResult] = useState<{
    outputs: Omit<BundleOutput, 'content'>[];
    zip: Uint8Array;
  } | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const invalidate = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setResult(null);
    setError('');
  };
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setResult(null);
    setOptions((o) => ({ ...o, confirmed: false }));
  }, [datasets]);
  useEffect(() => () => worker.current?.terminate(), []);
  const assignments: BundleFile[] = files.map((_, i) => ({
    role: roles[i] || 'ignore',
    textColumn: columns[i]?.textColumn ?? datasets[i]?.headers[0] ?? '',
    labelColumn: columns[i]?.labelColumn ?? datasets[i]?.headers[1] ?? '',
  }));
  const patch = (p: Partial<BundleOptions>) => {
    invalidate();
    setOptions({ ...options, ...p, confirmed: p.confirmed ?? false });
  };
  const classes = datasets[roles.indexOf('classes')];
  function generate() {
    invalidate();
    setBusy(true);
    const w = new Worker(new URL('../engine/bundle.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      setBusy(false);
      if (data.error) setError(data.error);
      else setResult(data);
      w.terminate();
      worker.current = null;
    };
    w.onerror = () => {
      setBusy(false);
      setError('处理进程失败，请缩小数据或重试。');
      w.terminate();
      worker.current = null;
    };
    w.postMessage({ datasets, files: assignments, options });
  }
  function save() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(result.zip).buffer], { type: 'application/zip' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'datascope-fasttext-dataset.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return (
    <section className="glass panel folder-studio">
      <h2>
        <FolderOpen size={20} /> 按数据集文件夹处理
      </h2>
      <p>
        先核对文件用途，再统一设置映射。train、dev、test 始终分别输出，class
        和停用词表不会作为样本追加。
      </p>
      <div className="folder-files">
        {files.map((file, i) => {
          const d = datasets[i],
            sample = ['train', 'dev', 'test'].includes(roles[i]);
          return (
            <article className="folder-file" key={i}>
              <div className="section-heading">
                <strong title={file.webkitRelativePath || file.name}>
                  {file.webkitRelativePath || file.name}
                </strong>
                <button onClick={() => onInspect(i)}>查看原数据</button>
              </div>
              <div className="chart-controls">
                <label>
                  文件用途 <HelpDemo kind={roles[i] === 'stopwords' ? 'stopwords' : 'folder'} />
                  <select
                    aria-label={`${file.name} 文件用途`}
                    value={roles[i]}
                    onChange={(e) => {
                      invalidate();
                      setRoles(roles.map((r, j) => (j === i ? (e.target.value as FileRole) : r)));
                      setOptions({ ...options, confirmed: false });
                    }}
                  >
                    {Object.entries(roleNames).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {sample &&
                  (['textColumn', 'labelColumn'] as const).map((key, k) => (
                    <label key={key}>
                      {k === 0 ? '正文列' : '标签 / 类别编号列'}{' '}
                      <HelpDemo kind={k === 0 ? 'mapping' : 'classes'} />
                      <select
                        aria-label={`${file.name} ${k === 0 ? '正文列' : '标签列'}`}
                        value={assignments[i][key]}
                        onChange={(e) => {
                          invalidate();
                          setColumns({
                            ...columns,
                            [i]: {
                              textColumn: assignments[i].textColumn,
                              labelColumn: assignments[i].labelColumn,
                              [key]: e.target.value,
                            },
                          });
                          setOptions({ ...options, confirmed: false });
                        }}
                      >
                        <option value="">请选择</option>
                        {d?.headers.map((h) => (
                          <option key={h} value={h}>
                            {file.name} · {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
              <p className="footnote">
                {d
                  ? `${d.rows.length.toLocaleString()} 行 · ${d.headers.length} 列 · 示例：${d.rows[0]?.join(' | ').slice(0, 160) || '空文件'}`
                  : '正在读取；读取失败时请查看上方原数据区域。'}
              </p>
              {roles[i] === 'ignore' && (
                <p className="footnote">未纳入本次输出，可在此重新指定用途。</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="folder-rules">
        <div>
          <label className="check">
            <input
              type="checkbox"
              checked={options.useClasses}
              onChange={(e) => patch({ useClasses: e.target.checked })}
            />
            把数字编号映射为类别名称
          </label>
          <HelpDemo kind="classes" />
        </div>
        {options.useClasses && (
          <>
            <label>
              类别编号起点 <HelpDemo kind="classes" />
              <select
                aria-label="文件夹类别起点"
                value={options.indexBase}
                onChange={(e) => patch({ indexBase: Number(e.target.value) as 0 | 1 })}
              >
                <option value={0}>从 0 开始</option>
                <option value={1}>从 1 开始</option>
              </select>
            </label>
            <div className="class-chips">
              {classes?.rows.slice(0, 12).map((r, i) => (
                <span key={i}>
                  {i + options.indexBase} → {r[0]}
                </span>
              ))}
            </div>
          </>
        )}
        <label>
          正文分词 <HelpDemo kind="tokenize" />
          <select
            aria-label="文件夹正文分词"
            value={options.tokenize}
            onChange={(e) => patch({ tokenize: e.target.value as BundleOptions['tokenize'] })}
          >
            <option value="none">保持原样</option>
            <option value="word">本地词分割（移除标点）</option>
            <option value="character">按 Unicode 字符分割</option>
          </select>
        </label>
        <div>
          <label className="check">
            <input
              type="checkbox"
              checked={options.useStopwords}
              onChange={(e) => patch({ useStopwords: e.target.checked })}
            />
            应用停用词表
          </label>
          <HelpDemo kind="stopwords" />
        </div>
        {options.useStopwords && (
          <p className="footnote">
            按分词后的完整词匹配，不做子串删除。请先选择分词方式；字符模式仅能匹配单字停用词。处理后正文为空时会停止导出并提示样本位置。
          </p>
        )}
      </div>
      <div className="toolbar">
        <label className="check">
          <input
            type="checkbox"
            checked={options.confirmed}
            onChange={(e) => patch({ confirmed: e.target.checked })}
          />
          我已核对文件用途、字段、类别顺序与处理选项
        </label>
        <HelpDemo kind="folder" />
      </div>
      <div className="toolbar">
        <button className="primary" disabled={!options.confirmed || busy} onClick={generate}>
          <FileCheck2 size={16} />
          {busy ? '正在分别处理与校验…' : '预览三份数据的处理结果'}
        </button>
        <HelpDemo kind="bundle-export" />
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="bundle-results">
          {result.outputs.map((o) => (
            <div key={o.name}>
              <h3>
                {o.name} · {o.rows.toLocaleString()} 条
              </h3>
              <pre className="preview-code">{o.preview}</pre>
            </div>
          ))}
          <div className="toolbar">
            <button className="primary" onClick={save}>
              <Download size={16} />
              下载数据集 ZIP
            </button>
            <HelpDemo kind="bundle-export" />
          </div>
          <p className="footnote">
            每个已指定的样本文件独立输出；ZIP 包含处理清单。原文件不被修改。
          </p>
        </div>
      )}
    </section>
  );
}
