import { describe, it, expect } from 'vitest';
import { splitDataset, type SplitConfig } from './split';
import type { Dataset } from './types';
const config: SplitConfig = {
  method: 'random',
  train: 80,
  validation: 10,
  test: 10,
  seed: 42,
  column: '',
  label: 'label',
  leakageColumn: '',
  keepDuplicates: false,
};
const d: Dataset = {
  name: 'test.csv',
  size: 1,
  headers: ['id', 'label', 'date'],
  warnings: [],
  rows: Array.from({ length: 100 }, (_, i) => [
    String(i),
    i % 2 ? 'a' : 'b',
    `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
  ]),
};
describe('reproducible data splits', () => {
  it('partitions every row exactly once and follows proportions', () => {
    const r = splitDataset(d, config);
    expect(r.subsets.map((s) => s.indexes.length)).toEqual([80, 10, 10]);
    const ids = r.subsets.flatMap((s) => s.indexes);
    expect(new Set(ids).size).toBe(100);
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
  it('same seed reproduces and different seed changes membership', () => {
    expect(splitDataset(d, config).subsets).toEqual(splitDataset(d, config).subsets);
    expect(splitDataset(d, { ...config, seed: 10 }).subsets).not.toEqual(
      splitDataset(d, config).subsets,
    );
  });
  it('stratifies binary labels', () => {
    const r = splitDataset(d, { ...config, method: 'stratified', column: 'label' });
    expect(r.subsets[1].labels).toContainEqual(['a', 5]);
    expect(r.subsets[2].labels).toContainEqual(['b', 5]);
  });
  it('keeps entities in exactly one subset', () => {
    const r = splitDataset(d, {
      ...config,
      method: 'group',
      column: 'label',
      leakageColumn: 'label',
    });
    expect(r.crossKeyOverlap).toBe(0);
  });
  it('keeps identical samples together when enabled', () => {
    const repeated = { ...d, rows: [...d.rows, ...d.rows] };
    const r = splitDataset(repeated, { ...config, keepDuplicates: true });
    expect(r.crossDuplicates).toBe(0);
  });
  it('orders chronological boundaries', () => {
    const r = splitDataset(d, { ...config, method: 'time', column: 'date' });
    const dates = r.subsets.flatMap((s) => s.indexes.map((i) => d.rows[i][2]));
    expect(dates).toEqual([...dates].sort());
  });
  it('rejects bad ratio, absent field and missing timestamp', () => {
    expect(() => splitDataset(d, { ...config, test: 20 })).toThrow();
    expect(() => splitDataset(d, { ...config, method: 'group', column: 'absent' })).toThrow();
    expect(() =>
      splitDataset({ ...d, rows: [['1', 'a', '']] }, { ...config, method: 'time', column: 'date' }),
    ).toThrow();
  });
  it('warns for tiny strata without dropping them', () => {
    const r = splitDataset(
      { ...d, rows: d.rows.slice(0, 2) },
      { ...config, method: 'stratified', column: 'label' },
    );
    expect(r.subsets.flatMap((s) => s.indexes).length).toBe(2);
    expect(r.warnings.some((w) => w.includes('无法出现在'))).toBe(true);
  });
  it('prevents contradictory group/stratified guarantees', () =>
    expect(() =>
      splitDataset(d, { ...config, method: 'stratified', column: 'label', keepDuplicates: true }),
    ).toThrow());
});
