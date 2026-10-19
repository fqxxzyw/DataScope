export const stopWords = new Set(
  '的 了 和 是 在 我 有 就 不 都 也 很 与 及 a an the is are was were to of and or in on for it this that with'.split(
    ' ',
  ),
);
export function wordFrequency(
  values: string[],
  mode: 'word' | 'character',
  hideStop: boolean,
  top: number,
) {
  const counts = new Map<string, number>();
  const available = typeof Intl.Segmenter === 'function';
  const segmenter =
    mode === 'word' && available ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
  for (const value of values) {
    const lower = value.toLowerCase();
    const tokens = segmenter
      ? Array.from(segmenter.segment(lower))
          .filter((s) => s.isWordLike)
          .map((s) => s.segment)
      : mode === 'character'
        ? Array.from(lower)
        : lower.match(/[a-z0-9]+|[\p{Script=Han}]/gu) || [];
    for (const token of tokens) {
      if (!/[\p{L}\p{N}]/u.test(token) || (hideStop && stopWords.has(token))) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return {
    words: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top),
    fallback: mode === 'word' && !available,
  };
}
