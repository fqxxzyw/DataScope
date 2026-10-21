import Papa from 'papaparse';
import { splitDataset } from '../engine/split';
import type { Dataset } from '../engine/types';
import { annotationFor, display, validateLabels } from './core';
import type { Project, Workspace } from './types';
export function exportRecords(w: Workspace, template: string) {
  const unknown = [...template.matchAll(/\[([^\]]+)\]/g)]
    .map((m) => m[1])
    .filter((f) => !w.project.fields.includes(f));
  if (unknown.length) throw new Error('模板中的字段不存在：' + unknown.join('、'));
  return w.rows.flatMap((row) => {
    const a = annotationFor(w.annotations, row.id);
    if (a?.status !== 'labeled') return [];
    const label = w.project.labels.find((l) => l.id === a.labels[0]);
    if (!label) throw new Error('标注引用了不存在的标签');
    const text = template.replace(/\[([^\]]+)\]/g, (_, f: string) => display(row.data[f]));
    if (!text.trim()) throw new Error('已标注记录 ' + row.id + ' 的组合正文为空');
    return [
      {
        id: row.id,
        text,
        label: label.name,
        data: row.data,
        labelIndex: w.project.labels.indexOf(label),
      },
    ];
  });
}
export function trainingDataset(w: Workspace, template: string): Dataset {
  const rows = exportRecords(w, template);
  if (!rows.length) throw new Error('没有可导出的已标注数据');
  return {
    name: w.project.name + '-annotated',
    size: 0,
    headers: ['id', 'text', 'label'],
    rows: rows.map((r) => [r.id, r.text, r.label]),
    warnings: [],
  };
}
export function exportFiles(w: Workspace, template: string, format: string) {
  const rows = exportRecords(w, template);
  if (!rows.length) throw new Error('没有可导出的已标注数据');
  const classes = { name: 'class.txt', content: w.project.labels.map((l) => l.name).join('\n') };
  if (format === 'bert') {
    const d = trainingDataset(w, template);
    const result = splitDataset(d, {
      method: 'stratified',
      train: 80,
      validation: 10,
      test: 10,
      seed: 42,
      column: 'label',
      label: 'label',
      leakageColumn: 'id',
      keepDuplicates: false,
    });
    return [
      ...result.subsets.map((set, i) => ({
        name: ['train.tsv', 'dev.tsv', 'test.tsv'][i],
        content: Papa.unparse(
          {
            fields: ['text', 'label'],
            data: set.indexes.map((j) => [rows[j].text, rows[j].labelIndex]),
          },
          { delimiter: '\t' },
        ),
      })),
      classes,
      {
        name: 'split-info.json',
        content: JSON.stringify(
          { seed: 42, ratios: [80, 10, 10], warnings: result.warnings },
          null,
          2,
        ),
      },
    ];
  }
  if (format === 'fasttext' && rows.some((r) => /\s/.test(r.label)))
    throw new Error('fastText 标签不能含空白，请在标签管理中改名或选择 JSONL');
  let content: string;
  if (format === 'json') {
    if (rows.some((r) => Object.hasOwn(r.data, 'label')))
      throw new Error(
        '原始数据已有 label 字段，保留原始 JSON 导出会冲突。请选择 JSONL / CSV，或先在数据整理中重命名原字段。',
      );
    content = JSON.stringify(
      rows.map((r) => ({ ...r.data, label: r.label })),
      null,
      2,
    );
  } else if (format === 'csv')
    content =
      '\uFEFF' +
      Papa.unparse(
        rows.map((r) => ({ text: r.text, label: r.label })),
        { escapeFormulae: true },
      );
  else if (format === 'fasttext')
    content = rows
      .map((r) => `__label__${r.label} ${r.text.replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  else content = rows.map((r) => JSON.stringify({ text: r.text, label: r.label })).join('\n');
  return [{ name: 'annotated.' + (format === 'fasttext' ? 'txt' : format), content }, classes];
}
export function backup(w: Workspace, includeSource = false) {
  return JSON.stringify(
    {
      version: 1,
      kind: 'datascope-annotation-project',
      project: w.project,
      annotations: w.annotations,
      ...(includeSource ? { rows: w.rows } : {}),
    },
    null,
    2,
  );
}
export function restoreBackup(text: string): Workspace {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('不是标注项目备份');
  const b = value as Record<string, unknown>,
    p = b.project as Project;
  if (
    b.kind !== 'datascope-annotation-project' ||
    b.version !== 1 ||
    !p ||
    !Array.isArray(p.labels) ||
    !Array.isArray(p.fields) ||
    typeof p.mainField !== 'string'
  )
    throw new Error('备份格式不正确');
  validateLabels(p.labels);
  const known = new Set(p.labels.map((l) => l.id));
  if (!b.annotations || typeof b.annotations !== 'object' || Array.isArray(b.annotations))
    throw new Error('标注记录无效');
  for (const a of Object.values(b.annotations) as { labels: unknown; status: unknown }[]) {
    if (
      !a ||
      !Array.isArray(a.labels) ||
      a.labels.some((id) => typeof id !== 'string' || !known.has(id)) ||
      !['labeled', 'unlabeled', 'skipped'].includes(String(a.status)) ||
      (a.status === 'labeled' && a.labels.length !== 1)
    )
      throw new Error('备份中存在无效标注');
  }
  const rows = b.rows;
  if (
    rows !== undefined &&
    (!Array.isArray(rows) ||
      rows.some(
        (r) =>
          !r ||
          typeof r.id !== 'string' ||
          !r.data ||
          typeof r.data !== 'object' ||
          Array.isArray(r.data),
      ))
  )
    throw new Error('备份源数据无效');
  if (Array.isArray(rows) && new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new Error('备份中有重复 ID');
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  return {
    project: {
      ...p,
      id,
      name: p.name + '（恢复）',
      revision: 0,
      filter: { status: 'all', label: '', search: '' },
    },
    rows: rows || [],
    annotations: b.annotations as Workspace['annotations'],
    history: [],
    session: { id: crypto.randomUUID(), projectId: id, start: at, end: at, count: 0 },
  };
}
