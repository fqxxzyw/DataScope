import { describe, it, expect } from 'vitest';
import { explore, evaluatePredictions } from './explore';
import type { Dataset } from './types';
const d: Dataset = {
  name: 'test',
  size: 1,
  headers: ['x', 'y', 'truth', 'pred'],
  rows: [
    ['1', '2', 'a', 'a'],
    ['2', '4', 'a', 'b'],
    ['3', '6', 'b', 'b'],
    ['', '8', 'b', ''],
  ],
  warnings: [],
};
describe('dynamic user-selected analysis', () => {
  it('aggregates selected fields by category', () => {
    const r = explore(d, {
      chart: 'bar',
      x: 'truth',
      y: 'y',
      group: '',
      aggregate: 'mean',
      limit: 20,
    });
    expect(r.categories).toEqual(['a', 'b']);
    expect(r.series[0].data[0]).toBeCloseTo(3);
    expect(r.series[0].data[1]).toBeCloseTo(7);
  });
  it('scatter excludes invalid pairs and computes full correlation', () => {
    const r = explore(d, {
      chart: 'scatter',
      x: 'x',
      y: 'y',
      group: '',
      aggregate: 'count',
      limit: 20,
    });
    expect(r.valid).toBe(3);
    expect(r.r).toBeCloseTo(1);
  });
  it('cross-tab counts selected category pairs', () => {
    const r = explore(d, {
      chart: 'crosstab',
      x: 'truth',
      y: '',
      group: 'pred',
      aggregate: 'count',
      limit: 20,
    });
    expect(r.series.find((s) => s.name === 'a')?.data).toEqual([1, 0]);
  });
  it('classification compares explicit truth and prediction', () => {
    const r = evaluatePredictions(d, 'truth', 'pred', 'classification');
    expect(r.n).toBe(3);
    expect(r.excluded).toBe(1);
    expect(r.confusion).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(r.metrics[0][1]).toBeCloseTo(2 / 3);
  });
  it('regression errors use valid pairs only', () => {
    const r = evaluatePredictions(d, 'x', 'y', 'regression');
    expect(r.n).toBe(3);
    expect(r.metrics.find(([k]) => k === 'MAE')?.[1]).toBeCloseTo(2);
    expect(r.metrics.find(([k]) => k === 'RMSE')?.[1]).toBeCloseTo(Math.sqrt(14 / 3));
  });
  it('rejects self-comparison and missing fields', () => {
    expect(() => evaluatePredictions(d, 'truth', 'truth', 'classification')).toThrow();
    expect(() =>
      explore(d, {
        chart: 'scatter',
        x: 'truth',
        y: 'y',
        group: '',
        aggregate: 'count',
        limit: 20,
      }),
    ).toThrow();
  });
});
