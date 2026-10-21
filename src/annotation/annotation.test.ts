import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  annotationFor,
  filteredRows,
  identify,
  progress,
  sourceChanges,
  titleStats,
  validateLabels,
} from './core';
import { backup, exportFiles, restoreBackup } from './export';
import { createProject, deleteProject, listProjects, loadProject, persist } from './db';
import type { Workspace } from './types';
function fixture(): Workspace {
  const at = new Date().toISOString(),
    id = crypto.randomUUID();
  return {
    project: {
      id,
      name: '测试项目',
      source: 'posts.json',
      createdAt: at,
      updatedAt: at,
      mode: 'single',
      mainField: 'title',
      auxiliary: ['content'],
      idField: 'id',
      fields: ['id', 'title', 'content'],
      labels: [
        { id: 'a', name: '活动', color: '#5b8def', shortcut: '1', description: '' },
        { id: 'b', name: '生日', color: '#ddaa55', shortcut: '2', description: '' },
      ],
      currentId: '10',
      filter: { status: 'all', label: '', search: '' },
      autoNext: true,
      revision: 0,
      total: 2,
      labeled: 0,
      skipped: 0,
    },
    rows: [
      { id: '10', source: '10/raw.json', data: { id: '10', title: '活动标题', content: '正文' } },
      { id: '20', source: '20/raw.json', data: { id: '20', title: '生日标题', content: '祝福' } },
    ],
    annotations: {},
    history: [],
    session: { id: crypto.randomUUID(), projectId: id, start: at, end: at, count: 0 },
  };
}
describe('Annotation identity, quality and exports', () => {
  it('keeps stable IDs on reorder and rejects duplicates/empty IDs', async () => {
    const w = fixture();
    expect((await identify([...w.rows].reverse(), 'id')).map((r) => r.id)).toEqual(['20', '10']);
    await expect(identify([w.rows[0], w.rows[0]], 'id')).rejects.toThrow('重复 ID');
    await expect(identify([{ source: 'x', data: { id: '' } }], 'id')).rejects.toThrow('空 ID');
  });
  it('uses deterministic content hashes, not row indexes', async () => {
    const a = await identify([{ data: { a: 'x', b: 1 }, source: 'one' }], ''),
      b = await identify([{ data: { b: 1, a: 'x' }, source: 'two' }], '');
    expect(a[0].id).toBe(b[0].id);
  });
  it('validates label names and shortcuts', () => {
    const w = fixture();
    expect(() =>
      validateLabels([...w.project.labels, { ...w.project.labels[0], id: 'c' }]),
    ).toThrow();
    expect(() => validateLabels([{ ...w.project.labels[0], shortcut: 'f' }])).toThrow();
  });
  it('reports title quality and ID-based source changes', () => {
    const w = fixture();
    expect(titleStats([...w.rows, w.rows[0]], 'title')).toMatchObject({
      total: 3,
      duplicates: 1,
      empty: 0,
      unique: 2,
    });
    const changed = { ...w.rows[0], data: { ...w.rows[0].data, title: '新标题' } };
    expect(sourceChanges(w.rows, [changed, { ...w.rows[1], id: '30' }])).toMatchObject({
      existing: 1,
      added: 1,
      missing: 1,
      changed: ['10'],
    });
  });
  it('separates skipped/unlabeled/labeled and searches source text', () => {
    const w = fixture();
    w.annotations = {
      '10': { labels: ['a'], status: 'labeled', updatedAt: '' },
      '20': { labels: [], status: 'skipped', updatedAt: '' },
    };
    expect(progress(w.rows, w.annotations)).toMatchObject({ labeled: 1, skipped: 1, unlabeled: 0 });
    expect(filteredRows(w, { status: 'skipped', label: '', search: '祝福' })[0].id).toBe('20');
    expect(annotationFor({}, 'constructor')).toBeUndefined();
  });
  it('exports only labeled records with ordered classes and preserves source', () => {
    const w = fixture();
    w.annotations = { '10': { labels: ['a'], status: 'labeled', updatedAt: '' } };
    const original = JSON.stringify(w.rows);
    const files = exportFiles(w, '[title]\n正文：[content]', 'jsonl');
    expect(JSON.parse(files[0].content)).toEqual({ text: '活动标题\n正文：正文', label: '活动' });
    expect(files[1].content).toBe('活动\n生日');
    expect(exportFiles(w, '[title]', 'fasttext')[0].content).toBe('__label__活动 活动标题');
    expect(JSON.stringify(w.rows)).toBe(original);
    expect(() => exportFiles(w, '[not_here]', 'csv')).toThrow();
  });
  it('backups default to no source and restore as a separate project', () => {
    const w = fixture();
    const restored = restoreBackup(backup(w));
    expect(restored.rows).toEqual([]);
    expect(restored.project.id).not.toBe(w.project.id);
    expect(restoreBackup(backup(w, true)).rows).toEqual(w.rows);
    expect(() => restoreBackup('{"kind":"other"}')).toThrow();
  });
  it('stratified export uses class indices and conserves rows', () => {
    const w = fixture();
    w.annotations = Object.fromEntries(
      w.rows.map((r) => [r.id, { labels: ['a'], status: 'labeled', updatedAt: '' }]),
    );
    const files = exportFiles(w, '[title]', 'bert');
    expect(files.map((f) => f.name)).toEqual([
      'train.tsv',
      'dev.tsv',
      'test.tsv',
      'class.txt',
      'split-info.json',
    ]);
    expect(
      files
        .slice(0, 3)
        .map((f) => f.content)
        .join('\n'),
    ).toContain('活动标题');
  });
});
describe('Annotation IndexedDB transactions', () => {
  it('saves annotations, resume position and history atomically; rejects stale writes', async () => {
    const w = fixture();
    await createProject(w);
    const after = {
      labels: ['a'],
      status: 'labeled' as const,
      updatedAt: new Date().toISOString(),
    };
    const h = {
      id: crypto.randomUUID(),
      projectId: w.project.id,
      at: after.updatedAt,
      action: 'label',
      changes: [{ id: '10', after }],
    };
    const next: Workspace = {
      ...w,
      annotations: { '10': after },
      project: { ...w.project, currentId: '20', revision: 1, labeled: 1 },
    };
    await persist(next, 0, ['10'], [h]);
    const loaded = await loadProject(w.project.id);
    expect(loaded.annotations['10'].labels).toEqual(['a']);
    expect(loaded.project.currentId).toBe('20');
    expect(loaded.history[0].changes[0].after?.labels).toEqual(['a']);
    await expect(
      persist({ ...next, project: { ...next.project, currentId: '10' } }, 0),
    ).rejects.toThrow();
    expect((await loadProject(w.project.id)).project.currentId).toBe('20');
    await deleteProject(w.project.id);
    expect((await listProjects()).some((p) => p.id === w.project.id)).toBe(false);
  });
});
