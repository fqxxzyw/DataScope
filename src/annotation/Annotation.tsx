import { useEffect, useRef, useState } from 'react';
import { listProjects, deleteProject } from './db';
import { restoreBackup } from './export';
import { useProject } from './useProject';
import { ImportProject } from './ImportProject';
import { WorkspaceView } from './Workspace';
import type { Project } from './types';
import './annotation.css';
export function Annotation() {
  const c = useProject(),
    [projects, setProjects] = useState<Project[]>([]),
    [creating, setCreating] = useState(false),
    [removing, setRemoving] = useState(''),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!c.workspace)
      void listProjects()
        .then(setProjects)
        .catch((e) => c.setError(String(e)));
  }, [c.workspace]);
  return (
    <div className="annotation">
      {c.error && (
        <p role="alert" className="ann-error">
          {c.error}
        </p>
      )}
      {c.workspace ? (
        <WorkspaceView key={c.workspace.project.id} c={c} />
      ) : (
        <>
          <header className="ann-header">
            <div>
              <h1>数据标注 · Annotation</h1>
              <p>导入文章 → 创建标签 → 快速标注 → 检查质量 → 导出训练数据</p>
            </div>
            <button onClick={() => setCreating(!creating)}>
              {creating ? '收起新建项目' : '新建标注项目'}
            </button>
            <button onClick={() => file.current?.click()}>恢复项目备份</button>
            <input
              aria-label="恢复标注项目备份"
              type="file"
              accept=".json"
              hidden
              ref={file}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 200 * 1024 * 1024) throw new Error('备份超过 200 MB');
                  await c.create(restoreBackup(await f.text()));
                } catch (error) {
                  c.setError(String(error));
                }
                e.target.value = '';
              }}
            />
          </header>
          <p>Local First · 标注项目只保存在本机。不会修改原始数据。</p>
          {(creating || !projects.length) && <ImportProject onCreate={c.create} />}
          <h2>最近标注项目</h2>
          {!projects.length && <p>还没有项目。可以导入文件、文件夹，或使用 DataScope 当前数据。</p>}
          {projects.map((p) => (
            <section key={p.id} className="ann-project">
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.source} · {p.labeled} / {p.total} 已标注 · {p.skipped} 跳过 ·{' '}
                  {p.total ? ((p.labeled / p.total) * 100).toFixed(2) : 0}%
                </p>
                <small>最后保存：{new Date(p.updatedAt).toLocaleString()}</small>
              </div>
              <button disabled={c.busy} onClick={() => void c.open(p.id)}>
                继续标注
              </button>
              <button disabled={c.busy} onClick={() => setRemoving(p.id)}>
                删除项目
              </button>
              {removing === p.id && (
                <div className="ann-notice">
                  <p>确认删除「{p.name}」的本地项目、工作副本和标注？原文件不会受影响。</p>
                  <button
                    onClick={() =>
                      void deleteProject(p.id)
                        .then(() => listProjects())
                        .then((v) => {
                          setProjects(v);
                          setRemoving('');
                        })
                        .catch((e) => c.setError(String(e)))
                    }
                  >
                    确认删除项目
                  </button>
                  <button onClick={() => setRemoving('')}>取消删除</button>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
