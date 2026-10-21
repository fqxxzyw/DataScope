import { useRef, useState } from 'react';
import { persist, loadProject, createProject } from './db';
import { annotationFor, progress, sourceChanges, validateLabels } from './core';
import {
  limits,
  type Annotation,
  type Change,
  type History,
  type Label,
  type Project,
  type Row,
  type Workspace,
} from './types';
export function useProject() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  const current = useRef<Workspace | null>(null),
    locked = useRef(false);
  const set = (w: Workspace | null) => {
    current.current = w;
    setWorkspace(w);
  };
  const run = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
      setSaved('自动保存 ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaved('保存失败，请重试；未覆盖已保存结果');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const commit = async (
    next: Workspace,
    changed: string[] = [],
    events: History[] = [],
    replace = false,
  ) => {
    const old = current.current;
    if (!old) return;
    const counts = progress(next.rows, next.annotations),
      at = new Date().toISOString();
    next = {
      ...next,
      project: {
        ...next.project,
        total: counts.total,
        labeled: counts.labeled,
        skipped: counts.skipped,
        revision: old.project.revision + 1,
        updatedAt: at,
      },
      session: { ...next.session, end: at },
    };
    await persist(next, old.project.revision, changed, events, replace);
    set(next);
  };
  const edit = async (patch: Partial<Project>) =>
    run(async () => {
      const w = current.current;
      if (w) await commit({ ...w, project: { ...w.project, ...patch } });
    });
  const annotate = async (
    id: string,
    labels: string[],
    status: Annotation['status'],
    nextId: string,
  ) =>
    run(async () => {
      const w = current.current;
      if (!w) return;
      if (!w.rows.some((r) => r.id === id)) throw new Error('记录不存在');
      if (
        status === 'labeled' &&
        (labels.length !== 1 || !w.project.labels.some((l) => l.id === labels[0]))
      )
        throw new Error('请选择有效标签');
      const at = new Date().toISOString(),
        before = annotationFor(w.annotations, id),
        after: Annotation = { ...before, labels, status, updatedAt: at };
      const h: History = {
        id: crypto.randomUUID(),
        projectId: w.project.id,
        at,
        action: status === 'skipped' ? 'skip' : 'label',
        changes: [{ id, before, after }],
      };
      await commit(
        {
          ...w,
          annotations: { ...w.annotations, [id]: after },
          project: { ...w.project, currentId: nextId },
          history: [h, ...w.history].slice(0, limits.history),
          session: { ...w.session, count: w.session.count + 1 },
        },
        [id],
        [h],
      );
    });
  const undo = async () =>
    run(async () => {
      const w = current.current;
      if (!w) return;
      const h = w.history.find((h) => !h.undone && ['label', 'skip'].includes(h.action));
      if (!h) throw new Error('没有可撤销的标注');
      const annotations = { ...w.annotations };
      for (const c of h.changes) {
        if (c.before?.labels.some((id) => !w.project.labels.some((l) => l.id === id)))
          throw new Error('原标签已删除，无法撤销，请手动重新标注');
        if (c.before) annotations[c.id] = c.before;
        else delete annotations[c.id];
      }
      const changed = { ...h, undone: true },
        event: History = {
          id: crypto.randomUUID(),
          projectId: w.project.id,
          at: new Date().toISOString(),
          action: 'undo',
          changes: h.changes.map((c) => ({ id: c.id, before: c.after, after: c.before })),
        };
      await commit(
        {
          ...w,
          annotations,
          project: { ...w.project, currentId: h.changes[0].id },
          history: [event, ...w.history.map((v) => (v.id === h.id ? changed : v))],
        },
        h.changes.map((c) => c.id),
        [changed, event],
      );
    });
  const labels = async (items: Label[], deleted?: { id: string; target: string }) =>
    run(async () => {
      const w = current.current;
      if (!w) return;
      validateLabels(items);
      const annotations = { ...w.annotations },
        changes: Change[] = [];
      if (deleted) {
        if (deleted.target && !items.some((l) => l.id === deleted.target))
          throw new Error('目标标签无效');
        for (const [id, a] of Object.entries(annotations))
          if (a.labels.includes(deleted.id)) {
            const after: Annotation = {
              ...a,
              labels: deleted.target ? [deleted.target] : [],
              status: deleted.target ? 'labeled' : 'unlabeled',
              updatedAt: new Date().toISOString(),
            };
            annotations[id] = after;
            changes.push({ id, before: a, after });
          }
      }
      const event: History = {
        id: crypto.randomUUID(),
        projectId: w.project.id,
        at: new Date().toISOString(),
        action: deleted ? 'delete-label' : 'labels',
        changes,
      };
      await commit(
        {
          ...w,
          annotations,
          project: {
            ...w.project,
            labels: items,
            filter: {
              ...w.project.filter,
              label: items.some((l) => l.id === w.project.filter.label)
                ? w.project.filter.label
                : '',
            },
          },
          history: [event, ...w.history].slice(0, limits.history),
        },
        changes.map((c) => c.id),
        [event],
      );
    });
  const replace = async (rows: Row[]) =>
    run(async () => {
      const w = current.current;
      if (!w) return;
      const diff = sourceChanges(w.rows, rows),
        annotations = { ...w.annotations };
      const changes: Change[] = [];
      for (const id of diff.changed) {
        const before = annotationFor(annotations, id);
        if (before) {
          const after = {
            ...before,
            labels: [],
            status: 'unlabeled' as const,
            updatedAt: new Date().toISOString(),
          };
          annotations[id] = after;
          changes.push({ id, before, after });
        }
      }
      const h: History = {
        id: crypto.randomUUID(),
        projectId: w.project.id,
        at: new Date().toISOString(),
        action: 'source-update',
        changes,
      };
      await commit(
        {
          ...w,
          rows,
          annotations,
          project: {
            ...w.project,
            fields: [...new Set(rows.flatMap((r) => Object.keys(r.data)))],
            currentId: rows.some((r) => r.id === w.project.currentId)
              ? w.project.currentId
              : rows[0]?.id || '',
          },
          history: [h, ...w.history],
        },
        changes.map((c) => c.id),
        [h],
        true,
      );
    });
  const clear = async () =>
    run(async () => {
      const w = current.current;
      if (!w) return;
      const changes = Object.entries(w.annotations).map(([id, before]) => ({ id, before }));
      const h: History = {
        id: crypto.randomUUID(),
        projectId: w.project.id,
        at: new Date().toISOString(),
        action: 'clear',
        changes,
      };
      await commit(
        { ...w, annotations: {}, history: [h, ...w.history] },
        changes.map((c) => c.id),
        [h],
      );
    });
  return {
    workspace,
    busy,
    error,
    saved,
    setError,
    open: (id: string) => run(async () => set(await loadProject(id))),
    create: (w: Workspace) =>
      run(async () => {
        await createProject(w);
        set(w);
      }),
    close: () =>
      run(async () => {
        const w = current.current;
        if (w) await commit(w);
        set(null);
      }),
    edit,
    annotate,
    undo,
    labels,
    replace,
    clear,
  };
}
export type Controller = ReturnType<typeof useProject>;
