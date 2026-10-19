import { useEffect, useState } from 'react';
import { request, useStore } from '../store';
export function DataPreview({ issueRows }: { issueRows?: number[] }) {
  const { report: r, hasRaw } = useStore();
  const [search, setSearch] = useState(''),
    [column, setColumn] = useState(''),
    [mode, setMode] = useState('first'),
    [sort, setSort] = useState(-1),
    [desc, setDesc] = useState(false),
    [offset, setOffset] = useState(0),
    [rows, setRows] = useState<{ index: number; values: string[] }[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!hasRaw) return;
      request({ type: 'rows', search, column, mode, sort, desc, offset, issueRows })
        .then((m) => {
          if (active && m.type === 'rows') {
            setRows(m.rows);
            setTotal(m.total);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, column, mode, sort, desc, offset, hasRaw, r, issueRows]);
  if (!r) return null;
  if (!hasRaw)
    return <div className="empty">历史不保存原始数据。请重新打开原始文件查看具体行。</div>;
  return (
    <section className="glass panel">
      <div className="section-heading">
        <div>
          <h2>数据预览</h2>
          <p>原始字符串 · 数据行号从 1 开始 · 只读</p>
        </div>
        <span className="badge">{total.toLocaleString()} 匹配行</span>
      </div>
      <div className="toolbar">
        <input
          aria-label="搜索数据"
          placeholder="搜索数据…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <select
          aria-label="搜索字段"
          value={column}
          onChange={(e) => {
            setColumn(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">所有字段</option>
          {r.columns.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          aria-label="预览模式"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setOffset(0);
          }}
        >
          <option value="first">前 50 行</option>
          <option value="random">随机 50 行</option>
          <option value="last">后 50 行</option>
          <option value="all">全部 · 分页浏览</option>
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {r.columns.map((c, j) => (
                <th key={c.name}>
                  <button
                    onClick={() => {
                      setSort(j);
                      setDesc(sort === j ? !desc : false);
                    }}
                  >
                    {c.name} {sort === j ? (desc ? '↓' : '↑') : '↕'}
                  </button>
                  <small>{c.type}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index}>
                <td className="muted">{row.index + 1}</td>
                {row.values.map((v, j) => (
                  <td key={j} title={v}>
                    {v.trim() ? v : <span className="null">空白</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mode === 'all' && (
        <div className="toolbar">
          <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>
            上一页
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 50, total)} / {total}
          </span>
          <button disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>
            下一页
          </button>
        </div>
      )}
      <p className="footnote">
        每页最多 50 行，避免为大型数据集创建大量 DOM；随机抽样使用固定种子 42。
      </p>
    </section>
  );
}
