import type { Stats } from './types';
export function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const a = Math.floor(i);
  const t = i - a;
  return sorted[a] * (1 - t) + sorted[Math.ceil(i)] * t;
}
export function stats(values: number[]): Stats {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y),
    n = a.length;
  if (!n)
    return {
      count: 0,
      mean: null,
      std: null,
      min: null,
      q1: null,
      median: null,
      q3: null,
      max: null,
      p95: null,
      p99: null,
      histogram: [],
    };
  // Scale first to prevent overflow in sums and centered differences.
  const scale = Math.max(Math.abs(a[0]), Math.abs(a[n - 1])) || 1;
  const meanScaled = a.reduce((s, v) => s + v / scale / n, 0);
  const variance = n > 1 ? a.reduce((s, v) => s + (v / scale - meanScaled) ** 2 / (n - 1), 0) : 0;
  const min = a[0],
    max = a[n - 1],
    bins = min === max ? 1 : Math.min(20, Math.ceil(Math.sqrt(n)));
  const hist = Array.from({ length: bins }, (_, i) => ({
    label:
      bins === 1
        ? String(min)
        : `${(min * (1 - i / bins) + (max * i) / bins).toPrecision(3)}–${(min * (1 - (i + 1) / bins) + (max * (i + 1)) / bins).toPrecision(3)}`,
    count: 0,
  }));
  for (const v of a) {
    const pos = min === max ? 0 : (v / scale - min / scale) / (max / scale - min / scale);
    hist[Math.min(bins - 1, Math.floor(pos * bins))].count++;
  }
  const std = Math.sqrt(variance) * scale;
  return {
    count: n,
    mean: meanScaled * scale,
    std: Number.isFinite(std) ? std : null,
    min,
    max,
    q1: quantile(a, 0.25),
    median: quantile(a, 0.5),
    q3: quantile(a, 0.75),
    p95: quantile(a, 0.95),
    p99: quantile(a, 0.99),
    histogram: hist,
  };
}
export function numeric(s: string): number | null {
  if (!s.trim() || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s.trim())) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function validDate(s: string): boolean {
  const m = s.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (!m) return false;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return false;
  return Number.isFinite(Date.parse(s.replaceAll('/', '-')));
}
export function pearson(pairs: [number, number][]): { r: number | null; n: number } {
  const n = pairs.length;
  if (n < 2) return { r: null, n };
  let sx = 0,
    sy = 0;
  for (const [x, y] of pairs) {
    sx = Math.max(sx, Math.abs(x));
    sy = Math.max(sy, Math.abs(y));
  }
  if (!sx || !sy) return { r: null, n };
  let mx = 0,
    my = 0;
  for (const [x, y] of pairs) {
    mx += x / sx / n;
    my += y / sy / n;
  }
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const [x, y] of pairs) {
    const a = x / sx - mx,
      b = y / sy - my;
    xx += a * a;
    yy += b * b;
    xy += a * b;
  }
  return { r: xx && yy ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null, n };
}
