import type { Settings } from './types';
export const LIMITS = {
  documents: 10000,
  characters: 2000000,
  tokens: 500000,
  vocabulary: 50000,
  matrix: 100,
  graph: 100,
  edges: 500,
  history: 5,
  preview: 50,
} as const;
export const defaults: Settings = {
  language: 'zh',
  normalize: true,
  lowercase: false,
  punctuation: true,
  tokenize: true,
  stopWords: true,
  filter: true,
  minLength: 1,
  n: 2,
  window: 5,
  top: 20,
  minFrequency: 1,
  graphNodes: 50,
  minEdge: 2,
  similarityLimit: 100,
};
export const stopDefaults = {
  zh: '的 了 是 在 和 与 我 你 他 她 它 这 那 有 也 都 就 很 非常 但是 比较 一个 一些 啊 吗 呢 得 地'.split(
    ' ',
  ),
  en: 'a an the is are was were be been to of in on at and or but for with this that it i you he she we they as by from'.split(
    ' ',
  ),
};
export function safeSettings(input: Partial<Settings>): Settings {
  const s = { ...defaults, ...input };
  for (const k of [
    'normalize',
    'lowercase',
    'punctuation',
    'tokenize',
    'stopWords',
    'filter',
  ] as const)
    s[k] = typeof s[k] === 'boolean' ? s[k] : defaults[k];
  const bounds = {
    minLength: [1, 20],
    n: [1, 3],
    window: [2, 10],
    top: [1, 100],
    minFrequency: [1, 10000],
    graphNodes: [1, LIMITS.graph],
    minEdge: [1, 10000],
    similarityLimit: [1, LIMITS.matrix],
  };
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const [min, max] = bounds[key];
    Object.assign(s, {
      [key]: Math.min(
        max,
        Math.max(min, Number.isFinite(s[key]) ? Math.trunc(s[key]) : defaults[key]),
      ),
    });
  }
  s.language = s.language === 'en' ? 'en' : 'zh';
  return s;
}
