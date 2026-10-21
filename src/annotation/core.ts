import type { Annotation, Filter, Label, Row, SourceRow, Workspace } from './types';
export const display = (v: unknown) =>
  v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
export function annotationFor(
  annotations: Record<string, Annotation>,
  id: string,
): Annotation | undefined {
  return Object.hasOwn(annotations, id) ? annotations[id] : undefined;
}
export function validateLabels(labels: Label[]) {
  const names = new Set<string>(),
    keys = new Set<string>(),
    ids = new Set<string>();
  for (const label of labels) {
    if (!label.name.trim() || /[\r\n]/.test(label.name))
      throw new Error('标签名称不能为空或包含换行');
    if (names.has(label.name.trim())) throw new Error('标签名称重复');
    names.add(label.name.trim());
    if (ids.has(label.id) || !label.id) throw new Error('标签 ID 无效');
    ids.add(label.id);
    if (label.shortcut && !/^[1-9]$/.test(label.shortcut))
      throw new Error('标签快捷键只能是 1–9 或留空');
    if (label.shortcut && keys.has(label.shortcut)) throw new Error('快捷键重复');
    if (label.shortcut) keys.add(label.shortcut);
    if (!/^#[0-9a-f]{6}$/i.test(label.color)) throw new Error('标签颜色无效');
  }
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'null';
}
export async function identify(rows: SourceRow[], field: string): Promise<Row[]> {
  const ids = new Set<string>(),
    result: Row[] = [],
    duplicates: string[] = [];
  for (const row of rows) {
    const value = row.data[field];
    if (field && value != null && typeof value === 'object')
      throw new Error('唯一 ID 必须是字符串或数字');
    const id = field
      ? display(value).trim()
      : 'sha256:' +
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(row.data))),
          ),
        )
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
    if (!id) throw new Error('存在空 ID，请选择完整的唯一 ID 字段');
    if (ids.has(id)) duplicates.push(id);
    ids.add(id);
    result.push({ ...row, id });
  }
  if (duplicates.length)
    throw new Error(
      `检测到 ${duplicates.length} 条重复 ID：${duplicates.slice(0, 20).join('、')}。请返回扫描预览检查；不会覆盖记录。`,
    );
  return result;
}
export function titleStats(rows: SourceRow[], field: string) {
  const values = rows.map((r) => display(r.data[field])),
    nonempty = values.filter((v) => v.trim()),
    lengths = nonempty.map((v) => Array.from(v).length);
  return {
    total: values.length,
    empty: values.length - nonempty.length,
    duplicates: nonempty.length - new Set(nonempty).size,
    unique: new Set(nonempty).size,
    average: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    longest: nonempty.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a), ''),
    shortest: nonempty.reduce(
      (a, b) => (!a || Array.from(b).length < Array.from(a).length ? b : a),
      '',
    ),
  };
}
export function filteredRows(w: Workspace, filter: Filter): Row[] {
  const q = filter.search.toLocaleLowerCase();
  return w.rows.filter((row) => {
    const a = annotationFor(w.annotations, row.id);
    return (
      (filter.status === 'all' || (a?.status || 'unlabeled') === filter.status) &&
      (!filter.label || a?.labels.includes(filter.label)) &&
      (!q ||
        row.id.toLocaleLowerCase().includes(q) ||
        [w.project.mainField, ...w.project.auxiliary].some((f) =>
          display(row.data[f]).toLocaleLowerCase().includes(q),
        ))
    );
  });
}
export function progress(rows: Row[], annotations: Record<string, Annotation>) {
  let labeled = 0,
    skipped = 0;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const a = annotationFor(annotations, r.id);
    if (a?.status === 'labeled') {
      labeled++;
      for (const id of a.labels) counts.set(id, (counts.get(id) || 0) + 1);
    } else if (a?.status === 'skipped') skipped++;
  }
  return {
    total: rows.length,
    labeled,
    skipped,
    unlabeled: rows.length - labeled - skipped,
    counts,
  };
}
export function sourceChanges(oldRows: Row[], rows: Row[]) {
  const old = new Map(oldRows.map((r) => [r.id, r])),
    next = new Set(rows.map((r) => r.id));
  return {
    existing: rows.filter((r) => old.has(r.id)).length,
    added: rows.filter((r) => !old.has(r.id)).length,
    missing: oldRows.filter((r) => !next.has(r.id)).length,
    changed: rows
      .filter((r) => old.has(r.id) && canonical(old.get(r.id)!.data) !== canonical(r.data))
      .map((r) => r.id),
  };
}
export function randomReview(w: Workspace, count: number) {
  const ids = w.rows
    .filter((r) => annotationFor(w.annotations, r.id)?.status === 'labeled')
    .map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}
