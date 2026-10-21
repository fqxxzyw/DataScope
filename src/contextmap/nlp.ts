import { LIMITS, safeSettings } from './defaults';
import type { Analysis, Edge, Settings, Stage, Term, TextDocument, Vector } from './types';
export const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/gu, ' ').trim();
export const removeStopWords = (tokens: string[], stops: Set<string>) =>
  tokens.filter((t) => !stops.has(t));
// Chinese has no spaces between words. ICU's local dictionary segmentation provides word boundaries.
export function tokenize(text: string, language: 'zh' | 'en'): string[] {
  if (language === 'en') return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
  return Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(text))
    .filter((s) => s.isWordLike)
    .map((s) => s.segment);
}
export function pipeline(text: string, s: Settings, stops: Set<string>) {
  const stages: Stage[] = [{ name: 'Raw', value: text, enabled: true }];
  let value = text;
  const transform = (name: string, enabled: boolean, fn: (v: string) => string) => {
    if (enabled) value = fn(value);
    stages.push({ name, value, enabled });
  };
  transform('Normalize', s.normalize, normalize);
  transform('Lowercase', s.lowercase, (v) => v.toLocaleLowerCase(s.language));
  // Replace punctuation with a boundary so English words never accidentally concatenate.
  transform('Remove Punctuation', s.punctuation, (v) => v.replace(/[\p{P}\p{S}]/gu, ' '));
  let tokens = s.tokenize ? tokenize(value, s.language) : value.split(/\s+/u).filter(Boolean);
  stages.push({ name: 'Tokenize', value: [...tokens], enabled: s.tokenize });
  const beforeStops = [...tokens];
  if (s.stopWords) tokens = removeStopWords(tokens, stops);
  stages.push({ name: 'Remove Stop Words', value: [...tokens], enabled: s.stopWords });
  if (s.filter) tokens = tokens.filter((t) => Array.from(t).length >= s.minLength);
  stages.push({ name: 'Filter Tokens', value: [...tokens], enabled: s.filter });
  return { stages, tokens, beforeStops };
}
export function frequency(documents: string[][]): Term[] {
  const counts = new Map<string, Term>();
  for (const tokens of documents) {
    const seen = new Set<string>();
    for (const word of tokens) {
      const t = counts.get(word) || { word, count: 0, df: 0 };
      t.count++;
      if (!seen.has(word)) t.df++;
      seen.add(word);
      counts.set(word, t);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
// Slide one token at a time, never across document boundaries.
export function ngrams(tokens: string[], n: number): string[][] {
  if (n < 1 || !Number.isInteger(n)) throw new Error('N 必须为正整数');
  return Array.from({ length: Math.max(0, tokens.length - n + 1) }, (_, i) =>
    tokens.slice(i, i + n),
  );
}
export function countNgrams(documents: string[][], n: number): [string, number][] {
  const map = new Map<string, number>();
  for (const tokens of documents)
    for (const gram of ngrams(tokens, n)) {
      const key = gram.join(' ');
      map.set(key, (map.get(key) || 0) + 1);
    }
  return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
// TF normalizes document length; smoothed IDF downweights terms shared by many documents.
export const tf = (count: number, total: number) => (total > 0 ? count / total : 0);
export const idf = (documents: number, df: number) => Math.log((documents + 1) / (df + 1)) + 1;
export const tfidf = (count: number, total: number, documents: number, df: number) =>
  tf(count, total) * idf(documents, df);
export function vectorize(tokens: string[], terms: Map<string, Term>, count: number): Vector {
  const v: Vector = Object.create(null);
  for (const t of frequency([tokens]))
    v[t.word] = tfidf(t.count, tokens.length, count, terms.get(t.word)?.df || 0);
  return v;
}
// A symmetric, undirected count: each occurrence pair at distance <= window is counted once.
export function cooccurrence(
  documents: string[][],
  window: number,
  vocabulary?: Set<string>,
): Edge[] {
  const edges = new Map<string, Edge>();
  for (const tokens of documents)
    for (let i = 0; i < tokens.length; i++) {
      if (vocabulary && !vocabulary.has(tokens[i])) continue;
      for (let j = i + 1; j <= Math.min(tokens.length - 1, i + window); j++) {
        if (tokens[i] === tokens[j] || (vocabulary && !vocabulary.has(tokens[j]))) continue;
        const [source, target] = [tokens[i], tokens[j]].sort();
        const key = JSON.stringify([source, target]);
        const edge = edges.get(key) || { source, target, weight: 0 };
        edge.weight++;
        edges.set(key, edge);
      }
    }
  return [...edges.values()].sort((a, b) => b.weight - a.weight);
}
// Direction is independent of magnitude. Empty vectors have similarity 0, including with themselves.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('向量必须使用同一个词表');
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb))) : 0;
}
export function sparseCosine(a: Vector, b: Vector): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (const [word, v] of Object.entries(a)) {
    na += v * v;
    dot += v * (Object.hasOwn(b, word) ? b[word] : 0);
  }
  for (const v of Object.values(b)) nb += v * v;
  return na && nb ? Math.min(1, dot / Math.sqrt(na * nb)) : 0;
}
export function context(documents: string[][], word: string, window: number) {
  return documents.flatMap((tokens, document) =>
    tokens.flatMap((t, index) =>
      t === word
        ? [
            {
              document,
              before: tokens.slice(Math.max(0, index - window), index),
              word,
              after: tokens.slice(index + 1, index + 1 + window),
            },
          ]
        : [],
    ),
  );
}
export function analyze(
  documents: TextDocument[],
  settings: Settings,
  stops: string[],
  progress: (m: string) => void = () => {},
): Analysis {
  if (
    documents.length > LIMITS.documents ||
    documents.reduce((n, d) => n + d.text.length, 0) > LIMITS.characters
  )
    throw new Error('最多 10,000 条文本、200 万字符。请先在 DataScope 中抽样。');
  if (!documents.length) throw new Error('请至少输入一条非空文本');
  const s = safeSettings(settings);
  progress('Tokenizing · 正在分词');
  const stopSet = new Set(stops),
    processed = documents.map((d) => pipeline(d.text, s, stopSet));
  const tokens = processed.map((p) => p.tokens),
    tokenCount = tokens.reduce((n, t) => n + t.length, 0);
  if (tokenCount > LIMITS.tokens) throw new Error('分词超过 50 万 Token，请缩小语料');
  progress('Building Vocabulary · 建立词表');
  const terms = frequency(tokens);
  if (terms.length > LIMITS.vocabulary) throw new Error('词表超过 50,000 个词，请缩小语料');
  const termMap = new Map(terms.map((t) => [t.word, t]));
  progress('Calculating TF-IDF · 计算文本向量');
  const vectors = tokens.map((t) => vectorize(t, termMap, documents.length));
  progress('Building Relationships · 计算共现关系');
  const vocabulary = new Set(
    terms
      .filter((t) => t.count >= s.minFrequency)
      .slice(0, LIMITS.graph)
      .map((t) => t.word),
  );
  return {
    documents,
    settings: s,
    tokens,
    tokenCount,
    frequency: terms,
    ngrams: countNgrams(tokens, s.n),
    vectors,
    edges: cooccurrence(tokens, s.window, vocabulary),
    stages: processed.map((p) => p.stages),
    beforeStops: processed.map((p) => p.beforeStops),
  };
}
