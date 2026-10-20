import type { Analysis } from './types';
const cell = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
export const csv = (rows: unknown[][]) =>
  '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
export function exportAnalysis(a: Analysis, kind: string, includeSource = false): string {
  if (kind === 'frequency')
    return csv([
      ['word', 'count', 'document_frequency'],
      ...a.frequency.map((t) => [t.word, t.count, t.df]),
    ]);
  if (kind === 'ngram') return csv([['ngram', 'count'], ...a.ngrams]);
  if (kind === 'tfidf')
    return csv([
      ['document', 'word', 'tfidf'],
      ...a.vectors.flatMap((v, i) => Object.entries(v).map(([w, n]) => [i + 1, w, n])),
    ]);
  if (kind === 'cooccurrence')
    return csv([
      ['source', 'target', 'count'],
      ...a.edges.map((e) => [e.source, e.target, e.weight]),
    ]);
  return JSON.stringify(
    {
      documents: a.documents.length,
      tokens: a.tokenCount,
      uniqueTokens: a.frequency.length,
      frequency: a.frequency,
      ngrams: a.ngrams,
      cooccurrence: a.edges,
      settings: a.settings,
      ...(includeSource ? { source: a.documents } : {}),
    },
    null,
    2,
  );
}
