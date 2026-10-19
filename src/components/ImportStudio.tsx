import { useEffect, useRef, useState, useMemo } from 'react';
import { HelpDemo } from './HelpDemo';
import { FileText, Link2, Tags } from 'lucide-react';
import { useStore } from '../store';
import type { Dataset } from '../engine/types';
import { combineDatasets, type CombineConfig } from '../engine/combine';
type Options = { header: boolean | 'auto'; delimiter: string; format: string };
const initial: Options = { header: 'auto', delimiter: 'auto', format: 'auto' };
export function ImportStudio() {
  const { importFiles, setImportFiles, sourceDataset, load } = useStore();
  const files = importFiles || [];
  const [datasets, setDatasets] = useState<(Dataset | null)[]>([]);
  const [options, setOptions] = useState<Record<number, Options>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [active, setActive] = useState(0);
  const [editError, setEditError] = useState('');
  const [primary, setPrimary] = useState(0);
  const [secondary, setSecondary] = useState(1);
  const [mode, setMode] = useState<'single' | CombineConfig['mode']>('single');
  const [leftKey, setLeftKey] = useState(''),
    [rightKey, setRightKey] = useState('');
  const [indexBase, setIndexBase] = useState<0 | 1>(0);
  const [confirmOrder, setConfirmOrder] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  useEffect(() => {
    setDatasets(files.map(() => null));
    setErrors({});
    if (files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) {
      setErrors({ 0: '本次导入总大小超过 100 MB，请分批导入。' });
      return;
    }
    const workers = files.map((file, index) => {
      const worker = new Worker(new URL('../engine/import.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }: MessageEvent<{ dataset?: Dataset; error?: string }>) => {
        if (data.error) setErrors((old) => ({ ...old, [index]: data.error! }));
        if (data.dataset)
          setDatasets((old) => old.map((d, i) => (i === index ? data.dataset! : d)));
        worker.terminate();
      };
      worker.onerror = () => {
        setErrors((old) => ({ ...old, [index]: '读取进程失败，请缩小文件后重试' }));
        worker.terminate();
      };
      worker.postMessage({ file, ...(options[index] || initial) });
      return worker;
    });
    return () => workers.forEach((w) => w.terminate());
  }, [importFiles, options]);
  const d = datasets[active];
  const left = includeCurrent ? sourceDataset : datasets[primary];
  const right = datasets[secondary];
  const combined = useMemo(() => {
    try {
      if (!left) return { error: '正在读取主数据…' };
      if (mode === 'single') return { dataset: left };
      if (mode === 'append') {
        let result = left;
        for (let i = 0; i < datasets.length; i++) {
          if (!includeCurrent && i === primary) continue;
          if (!datasets[i]) return { error: '等待全部文件读取完成' };
          result = combineDatasets(result, datasets[i]!, {
            mode,
            leftKey,
            rightKey,
            confirmOrder,
            indexBase,
          });
        }
        return { dataset: result };
      }
      if (!right || (!includeCurrent && primary === secondary))
        return { error: '请选择另一个标签或字典文件' };
      return {
        dataset: combineDatasets(left, right, { mode, leftKey, rightKey, confirmOrder, indexBase }),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [
    left,
    right,
    datasets,
    primary,
    secondary,
    mode,
    leftKey,
    rightKey,
    confirmOrder,
    includeCurrent,
    indexBase,
  ]);
  const option = options[active] || initial;
  const patch = (value: Partial<Options>) =>
    setOptions((old) => ({ ...old, [active]: { ...option, ...value } }));
  const preview = (data: Dataset, editable = false) => (
    <div className="table-scroll raw-table">
      <table>
        <thead>
          <tr>
            <th>行</th>
            {data.headers.map((h, i) => (
              <th key={i} className={data.generatedHeaders?.includes(h) ? 'generated-heading' : ''}>
                <small className="source-file">{data.name}</small>
                {editable ? (
                  <input
                    aria-label={`第 ${i + 1} 列名称`}
                    defaultValue={h}
                    key={`${active}-${h}`}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name === h) {
                        setEditError('');
                        return;
                      }
                      if (!name || data.headers.some((v, j) => j !== i && v === name)) {
                        setEditError('列名不能为空或重复，请为每一列使用不同名称。');
                        e.target.value = h;
                        return;
                      }
                      setEditError('');
                      setDatasets((old) =>
                        old.map((v, k) =>
                          k === active && v
                            ? {
                                ...v,
                                headers: v.headers.map((n, j) => (j === i ? name : n)),
                                generatedHeaders: v.generatedHeaders?.filter((n) => n !== h),
                              }
                            : v,
                        ),
                      );
                    }}
                  />
                ) : (
                  h
                )}
                {data.generatedHeaders?.includes(h) && <small>系统补充 · 可修改</small>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.slice(0, 8).map((row, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {row.map((v, j) => (
                <td key={j} title={v}>
                  {v || <span className="null">空白</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="import-studio">
      <div className="page-intro">
        <div>
          <span className="eyebrow">01 / 导入与确认</span>
          <h1>先看看，你的数据长什么样。</h1>
          <p>先核对原文、列数和首行，再开始分析。导入多个文件后，可追加记录或关联标签。</p>
        </div>
        <button onClick={() => setImportFiles(null)}>返回工作台</button>
      </div>
      <section className="glass panel">
        <div className="section-heading">
          <h2>
            <FileText size={18} /> 已选择 {files.length} 个文件 <HelpDemo kind="import" />
          </h2>
          <button onClick={() => addRef.current?.click()}>继续添加文件</button>
        </div>
        <input
          ref={addRef}
          hidden
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.json,.jsonl,.conll,.bio"
          onChange={(e) => {
            const added = Array.from(e.target.files || []);
            if (added.length) setImportFiles([...files, ...added]);
            e.target.value = '';
          }}
        />
        <div className="file-tabs">
          {files.map((file, i) => (
            <button
              key={i}
              className={i === active ? 'selected' : ''}
              onClick={() => setActive(i)}
              title={file.name}
            >
              {file.name}
              <small>
                {datasets[i]
                  ? `${datasets[i]!.rows.length} 行 · ${datasets[i]!.headers.length} 列`
                  : errors[i]
                    ? '读取失败'
                    : '读取中…'}
              </small>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <button
            onClick={() => {
              const next = files.filter((_, i) => i !== active);
              setImportFiles(next.length ? next : null);
            }}
          >
            移除当前文件
          </button>
        </div>
        {editError && (
          <p className="notice" role="alert">
            {editError}
          </p>
        )}
        <div className="chart-controls">
          <label>
            首行是什么？
            <select
              aria-label="首行规则"
              value={String(option.header)}
              onChange={(e) =>
                patch({ header: e.target.value === 'auto' ? 'auto' : e.target.value === 'true' })
              }
            >
              <option value="auto">自动判断（请核对预览）</option>
              <option value="false">首行就是数据，没有标题</option>
              <option value="true">首行是列标题</option>
            </select>
          </label>
          <label>
            列之间如何分隔？ <HelpDemo kind="delimiter" />
            <select
              aria-label="导入分隔符"
              value={option.delimiter}
              onChange={(e) => patch({ delimiter: e.target.value })}
            >
              <option value="auto">自动识别</option>
              <option value={'\t'}>制表符 Tab</option>
              <option value=",">逗号</option>
              <option value=";">分号</option>
              <option value="|">竖线</option>
              <option value=" ">空格（正文含空格时谨慎）</option>
            </select>
          </label>
          <label>
            文件内容格式 <HelpDemo kind="import" />
            <select
              aria-label="预览格式"
              value={option.format}
              onChange={(e) => patch({ format: e.target.value })}
            >
              {[
                ['auto', '自动识别'],
                ['table', '表格 / 分隔文本'],
                ['text', '纯文本：每行一条'],
                ['fasttext', 'fastText：标签 + 正文'],
                ['jsonl', 'JSONL'],
                ['json', 'JSON 数组'],
                ['conll', 'CoNLL / BIO'],
              ].map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        {errors[active] && (
          <p role="alert" className="notice">
            {errors[active]}
          </p>
        )}
        {d && (
          <>
            <p className="preview-legend">
              绿色区域是读取的原始值；红色标题是系统补充名称，不是原文件内容。点击标题可以改名。
            </p>
            {preview(d, true)}
            <p className="footnote">
              共 {d.rows.length} 行、{d.headers.length} 列，展示前 8
              行。若列数不对，请调整上方分隔符；若首行被误当标题，请选择“没有标题”。
            </p>
            {d.warnings.map((w, i) => (
              <p className="footnote" key={i}>
                {w}
              </p>
            ))}
          </>
        )}
      </section>
      <section className="glass panel">
        <h2>
          <Link2 size={18} /> 这些文件要怎样一起使用？{' '}
          <HelpDemo kind={mode === 'single' ? 'import' : mode} />
        </h2>
        <p>
          分类数据可由“正文文件 + 标签文件”组成。标签字典也可以按编号关联。fastText
          最终每行需要标签前缀与正文。
        </p>
        <div className="task-guidance">
          <strong>你的文件如何分工？</strong>
          <p>
            train 是训练样本，dev 是验证样本，test 是测试样本；分别关联同一份 class
            类别表。stopwords 是停用词表，不是标签，不应追加到样本中。数字标签也可直接导出
            fastText；映射 class 后可改用可读的类别名称。
          </p>
          {files.some((f) => /^class\.txt$/i.test(f.name)) && (
            <button
              onClick={() => {
                const ci = files.findIndex((f) => /^class\.txt$/i.test(f.name));
                const ti = files.findIndex((f) => /^(train|dev|test)\.txt$/i.test(f.name));
                setSecondary(ci);
                setMode('classes');
                setConfirmOrder(false);
                setIndexBase(0);
                if (ti >= 0) {
                  setIncludeCurrent(false);
                  setPrimary(ti);
                  setLeftKey(datasets[ti]?.headers[1] || '');
                } else if (left) setLeftKey(left.headers[1] || '');
              }}
            >
              配置样本 + class 类别列表
            </button>
          )}
        </div>
        {sourceDataset && (
          <label className="check">
            <input
              type="checkbox"
              checked={includeCurrent}
              onChange={(e) => {
                setIncludeCurrent(e.target.checked);
                setSecondary(0);
              }}
            />
            使用当前导入的原始数据作为主表（不包含后续整理操作）
          </label>
        )}
        <div className="chart-controls">
          <label>
            导入方式
            <select
              aria-label="文件组合方式"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                setConfirmOrder(false);
              }}
            >
              <option value="single">只分析选中的主文件</option>
              <option value="append">相同字段：追加所有文件的行</option>
              <option value="rows">正文 + 标签：按行一一对应</option>
              <option value="classes">类别列表 class.txt：按类别编号映射（推荐）</option>
              <option value="key">主表 + 标签字典：按键匹配</option>
            </select>
          </label>
          {!includeCurrent && (
            <label>
              主数据文件
              <select
                aria-label="主数据文件"
                value={primary}
                onChange={(e) => {
                  setPrimary(+e.target.value);
                  setLeftKey('');
                  setConfirmOrder(false);
                }}
              >
                {files.map((f, i) => (
                  <option value={i} key={i}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {['rows', 'key', 'classes'].includes(mode) && (
            <label>
              标签 / 字典文件
              <select
                aria-label="关联文件"
                value={secondary}
                onChange={(e) => {
                  setSecondary(+e.target.value);
                  setRightKey('');
                  setConfirmOrder(false);
                }}
              >
                {files.map((f, i) => (
                  <option key={i} value={i}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === 'classes' && (
            <>
              <label>
                样本中的类别编号列
                <select
                  aria-label="类别编号列"
                  value={leftKey}
                  onChange={(e) => {
                    setLeftKey(e.target.value);
                    setConfirmOrder(false);
                  }}
                >
                  <option value="">选择编号列</option>
                  {left?.headers.map((h) => (
                    <option key={h} value={h}>
                      {left.name} · {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                class 首行对应哪个编号？
                <select
                  aria-label="类别编号起点"
                  value={indexBase}
                  onChange={(e) => {
                    setIndexBase(Number(e.target.value) as 0 | 1);
                    setConfirmOrder(false);
                  }}
                >
                  <option value={0}>0（0 → 第一类，1 → 第二类）</option>
                  <option value={1}>1（1 → 第一类，2 → 第二类）</option>
                </select>
              </label>
            </>
          )}
          {mode === 'key' && (
            <>
              <label>
                主表匹配列
                <select
                  aria-label="主表匹配列"
                  value={leftKey}
                  onChange={(e) => setLeftKey(e.target.value)}
                >
                  <option value="">选择编号或关联键</option>
                  {left?.headers.map((h) => (
                    <option key={h} value={h}>
                      {left?.name} · {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                字典匹配列
                <select
                  aria-label="字典匹配列"
                  value={rightKey}
                  onChange={(e) => setRightKey(e.target.value)}
                >
                  <option value="">选择对应编号</option>
                  {right?.headers.map((h) => (
                    <option key={h} value={h}>
                      {right?.name} · {h}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        {mode === 'classes' && (
          <div className="class-map-guide">
            <h3>
              <Tags size={18} /> 类别列表映射 <HelpDemo kind="classes" />
            </h3>
            <p>
              不是让第 1 条样本对应第 1
              个类别，而是用每条样本的编号查类别表。类别列表必须保持训练数据所用的顺序。
            </p>
            <div className="class-chips">
              {right?.rows.slice(0, 12).map((row, i) => (
                <span key={i}>
                  {i + indexBase} → {row[0]}
                </span>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmOrder}
                onChange={(e) => setConfirmOrder(e.target.checked)}
              />
              我已核对类别顺序与编号起点，按此映射
            </label>
          </div>
        )}
        {mode === 'rows' && (
          <label className="check">
            <input
              type="checkbox"
              checked={confirmOrder}
              onChange={(e) => setConfirmOrder(e.target.checked)}
            />
            我已确认两个文件每一行对应同一个样本；程序只校验行数，不能判断语义对应。
          </label>
        )}
        {combined.error && (
          <p className="notice" role="status">
            {combined.error}
          </p>
        )}
        {combined.dataset && mode !== 'single' && (
          <>
            <h3>组合后的预览 · 尚未应用</h3>
            {preview(combined.dataset)}
            <p className="notice">{combined.dataset.warnings.at(-1)}</p>
          </>
        )}
        <div className="toolbar">
          <button
            className="primary"
            disabled={!combined.dataset || Object.keys(errors).length > 0}
            onClick={() => combined.dataset && load(combined.dataset, 'auto', true, 'table')}
          >
            确认数据，开始分析
          </button>
          <span className="footnote">只创建工作副本，不覆盖原文件。下一步首先展示数据表。</span>
        </div>
      </section>
    </div>
  );
}
