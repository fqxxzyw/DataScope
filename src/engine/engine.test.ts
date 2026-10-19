import { describe, it, expect } from 'vitest';
import { defaults, type Dataset } from './types';
import { parseDataset } from './parser';
import { analyze, infer, normalizeSettings } from './analyze';
import { stats, pearson, numeric, quantile, validDate } from './statistics';
import { htmlReport, problemCsv } from './export';
import { wordFrequency } from './text';
import { parseInput, validateTags } from './formats';
import { convert, type ProcessingConfig } from './processing';
const data = (headers: string[], rows: string[][]): Dataset => ({
  name: 'test.csv',
  size: 100,
  headers,
  rows,
  warnings: [],
});
const cfg = (
  profile: ProcessingConfig['profile'],
  mapping: Record<string, string>,
): ProcessingConfig => ({
  profile,
  mapping,
  trim: false,
  normalize: false,
  collapseWhitespace: false,
  deduplicate: false,
  dropEmpty: false,
  tokenize: 'none',
});
describe('parser boundaries', () => {
  it('handles BOM, quoted commas and newlines', () => {
    const d = parseDataset(
      '\uFEFFtext,label\n"hi,\nworld",a\n',
      'x.csv',
      1,
      'auto',
      true,
      defaults,
    );
    expect(d.rows).toEqual([['hi,\nworld', 'a']]);
  });
  it('keeps intentional blank TXT records', () =>
    expect(parseDataset('a\n\nb\n', 'x.txt', 1, 'auto', true, defaults).rows).toEqual([
      ['a'],
      [''],
      ['b'],
    ]));
  it('rejects empty, header-only and ragged rows', () => {
    for (const s of ['', 'a,b', 'a,b\n1,2,3'])
      expect(() => parseDataset(s, 'x.csv', 1, ',', true, defaults)).toThrow();
  });
  it('disambiguates blank/duplicate headers without overwriting values', () => {
    const d = parseDataset('x,x,x_2,\na,b,c,d', 'x.csv', 1, ',', true, defaults);
    expect(new Set(d.headers).size).toBe(4);
    expect(d.rows[0]).toEqual(['a', 'b', 'c', 'd']);
  });
  it('warns about encoding replacement characters', () =>
    expect(parseDataset('x\n�', 'x.csv', 1, ',', true, defaults).warnings.join()).toContain(
      'UTF-8',
    ));
  it('rejects malformed quotes', () =>
    expect(() => parseDataset('x,y\n"unclosed,y', 'x.csv', 1, ',', true, defaults)).toThrow());
  it('enforces cell cap', () =>
    expect(() =>
      parseDataset('x,y\n1,2', 'x.csv', 1, ',', true, { ...defaults, maxCells: 2 }),
    ).toThrow());
});
describe('inference and quality', () => {
  it('separates whitespace from missing tokens', () => {
    const r = analyze(data(['text'], [['hello'], [''], [' '], ['N/A'], ['None']]), defaults);
    expect(r.missing).toBe(2);
    expect(r.columns[0].tokens).toEqual([
      ['N/A', 1],
      ['None', 1],
    ]);
  });
  it('counts extra duplicates separately from all group members', () => {
    const r = analyze(data(['x'], [['a'], ['b'], ['a'], ['a']]), defaults);
    expect(r.duplicateCount).toBe(2);
    expect(r.duplicates).toEqual([[0, 2, 3]]);
    expect(r.issues.find((i) => i.type === 'duplicate')?.affectedRows).toBe(3);
  });
  it('avoids delimiter hash collisions and prototype-key corruption', () => {
    const r = analyze(
      data(
        ['__proto__', 'text'],
        [
          ['a|b', 'c'],
          ['a', 'b|c'],
        ],
      ),
      defaults,
    );
    expect(r.duplicateCount).toBe(0);
    expect(r.columns[0].name).toBe('__proto__');
  });
  it('recognizes text/label even in tiny datasets', () => {
    expect(infer('sentence', ['好', '不好'], defaults)).toBe('Text');
    expect(infer('label', ['positive', 'negative'], defaults)).toBe('Categorical');
  });
  it('preserves leading-zero identifiers', () =>
    expect(infer('code', ['001', '002'], defaults)).toBe('ID'));
  it('does not turn unique continuous numbers into IDs', () =>
    expect(infer('price', ['11.2', '13.4', '19.5'], defaults)).toBe('Numeric'));
  it('handles all-missing columns', () => {
    const r = analyze(data(['x'], [[''], [' ']]), defaults);
    expect(r.columns[0].type).toBe('Unknown');
    expect(Number.isFinite(r.score)).toBe(true);
  });
  it('detects type overrides and mixed invalid values', () => {
    const r = analyze(data(['age'], [['1'], ['2'], ['oops']]), defaults, { age: 'Numeric' });
    expect(r.columns[0].invalid).toEqual([2]);
    expect(r.columns[0].stats?.mean).toBe(1.5);
  });
  it('only penalizes imbalance for explicit target', () => {
    const d = data(
      ['label'],
      Array.from({ length: 12 }, (_, i) => [i ? 'a' : 'b']),
    );
    expect(analyze(d, defaults).issues.some((i) => i.type === 'class_imbalance')).toBe(false);
    expect(analyze(d, defaults, {}, 'label').issues.some((i) => i.type === 'class_imbalance')).toBe(
      true,
    );
  });
  it('uses Unicode code points', () =>
    expect(analyze(data(['text'], [['😀中']]), defaults).columns[0].length?.max).toBe(2));
  it('settings normalization rejects NaN and clamps thresholds', () => {
    const s = normalizeSettings({ imbalance: -8, longPercentile: 200, shortText: NaN });
    expect(s.imbalance).toBe(1);
    expect(s.longPercentile).toBe(100);
    expect(s.shortText).toBe(2);
  });
});
describe('statistics', () => {
  it('matches describe values and sample std', () => {
    const s = stats([1, 2, 3, 4, 5]);
    expect(s.mean).toBeCloseTo(3);
    expect(s.std).toBeCloseTo(Math.sqrt(2.5));
    expect(s.q1).toBe(2);
    expect(s.q3).toBe(4);
  });
  it('returns null for empty stats and undefined correlations', () => {
    expect(stats([]).mean).toBeNull();
    expect(
      pearson([
        [1, 1],
        [1, 2],
      ]).r,
    ).toBeNull();
    expect(pearson([[1, 2]]).r).toBeNull();
  });
  it('handles extreme finite numbers without mean overflow', () => {
    expect(stats([1e308, 1e308]).mean).toBe(1e308);
    expect(stats([-1e308, 1e308]).mean).toBe(0);
    expect(stats([1e308]).histogram[0].count).toBe(1);
  });
  it('strict numeric parser excludes Infinity, empty and hex', () => {
    for (const s of ['', ' ', 'Infinity', 'NaN', '0xff', '12kg']) expect(numeric(s)).toBeNull();
    expect(numeric('1e3')).toBe(1000);
  });
  it('validates actual calendar dates', () => {
    expect(validDate('2024-02-29')).toBe(true);
    expect(validDate('2025-02-29')).toBe(false);
    expect(validDate('2024-13-01')).toBe(false);
  });
  it('computes interpolated quantiles and perfect correlation', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(
      pearson([
        [1, 2],
        [2, 4],
        [3, 6],
      ]).r,
    ).toBeCloseTo(1);
  });
  it('IQR marks potential outliers', () => {
    const r = analyze(
      data(
        ['x'],
        ['1', '2', '3', '4', '5', '6', '7', '100'].map((v) => [v]),
      ),
      defaults,
    );
    expect(r.columns[0].outliers).toEqual([7]);
  });
  it('pairwise deletion does not coerce blanks to zero', () => {
    const r = analyze(
      data(
        ['x', 'y'],
        [
          ['1', '2'],
          ['2', '4'],
          ['', '10'],
        ],
      ),
      defaults,
      { x: 'Numeric', y: 'Numeric' },
    );
    expect(r.correlations.find((p) => p.x === 'x' && p.y === 'y')).toMatchObject({ r: 1, n: 2 });
  });
});
describe('export security and text', () => {
  it('escapes malicious HTML in report', () => {
    const r = analyze(data(['text'], [['<script>alert(1)</script>']]), defaults);
    const html = htmlReport(r);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('escapes formula injection and preserves issue-column collision', () => {
    const d = data(['x', '_datascope_issue'], [['=1+1', 'original']]);
    const csv = problemCsv(d, [0], 'missing');
    expect(csv).toContain('_datascope_issue_');
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('original');
  });
  it('filters stop words and counts English words', () => {
    const r = wordFrequency(['The hotel is good. HOTEL!'], 'word', true, 20);
    expect(r.words).toContainEqual(['hotel', 2]);
    expect(r.words.find((x) => x[0] === 'the')).toBeUndefined();
  });
});
describe('format adapters', () => {
  it('round-trips multi-label fastText', () => {
    const d = parseInput('__label__a __label__b hello world', 'x.txt', 1, 'auto', false, defaults);
    expect(d.headers).toEqual(['text', 'labels']);
    const r = convert(d, cfg('fasttext', { text: 'text', labels: 'labels' }));
    expect(r.content).toBe('__label__a __label__b hello world');
    expect(r.invalid).toBe(0);
  });
  it('rejects invalid fastText line when explicitly requested', () =>
    expect(() =>
      parseInput('missing labels', 'x.txt', 1, 'auto', false, defaults, 'fasttext'),
    ).toThrow());
  it('reads sparse JSON objects and nested arrays safely', () => {
    const d = parseInput(
      '{"text":"a","labels":["x"]}\n{"id":2}',
      'x.jsonl',
      1,
      'auto',
      true,
      defaults,
    );
    expect(d.headers).toEqual(['text', 'labels', 'id']);
    expect(d.rows).toEqual([
      ['a', '["x"]', ''],
      ['', '', '2'],
    ]);
  });
  it('rejects non-record JSON and nested container', () => {
    expect(() => parseInput('[1,2]', 'x.json', 1, 'auto', true, defaults)).toThrow();
    expect(() => parseInput('{"data":[]}', 'x.json', 1, 'auto', true, defaults)).toThrow();
  });
  it('checks CoNLL sentence boundaries and BIO transitions', () => {
    const d = parseInput('北 B-LOC\n京 I-LOC\n\n好 O', 'x.conll', 1, 'auto', true, defaults);
    expect(d.rows.length).toBe(2);
    expect(validateTags(['a'], ['I-X'])).toBeTruthy();
    expect(validateTags(['a', 'b'], ['B-X', 'E-X'])).toBeUndefined();
    expect(validateTags(['a', 'b'], ['B-X', 'S-X'])).toBeTruthy();
  });
  it('requires explicit field mapping', () =>
    expect(() => convert(data(['text'], [['hi']]), cfg('bert', {}))).toThrow());
  it('validates BERT pair fields and keeps raw text (no fake tokens)', () => {
    const d = data(['a', 'b', 'y'], [['你好', '世界', 'yes']]);
    const r = convert(d, cfg('pair', { text: 'a', text_pair: 'b', label: 'y' }));
    expect(JSON.parse(r.content)).toEqual({ text: '你好', text_pair: '世界', label: 'yes' });
  });
  it('rejects invalid numeric regression targets', () =>
    expect(
      convert(data(['x', 'y'], [['a', 'NaN']]), cfg('regression', { text: 'x', label: 'y' }))
        .invalid,
    ).toBe(1));
  it('applies explicit cleaning without mutating input', () => {
    const d = data(['x'], [[' a '], ['a'], ['']]);
    const r = convert(d, {
      ...cfg('text', { text: 'x' }),
      trim: true,
      dropEmpty: true,
      deduplicate: true,
    });
    expect(r.content).toBe('a');
    expect(r.removed).toBe(2);
    expect(d.rows[0][0]).toBe(' a ');
  });
  it('blocks incomplete NER arrays', () =>
    expect(
      convert(
        data(['a', 'b'], [['["a"]', '["B-X","I-X"]']]),
        cfg('ner', { tokens: 'a', tags: 'b' }),
      ).invalid,
    ).toBe(1));
  it('validates QA offsets using Unicode code points', () => {
    const d = data(['c', 'q', 'a'], [['😀北京', '哪里', '{"text":["北京"],"answer_start":[1]}']]);
    expect(convert(d, cfg('qa', { context: 'c', question: 'q', answers: 'a' })).invalid).toBe(0);
  });
  it('rejects equal DPO answers and invalid chat role', () => {
    expect(
      convert(
        data(['p', 'c', 'r'], [['q', 'a', 'a']]),
        cfg('dpo', { prompt: 'p', chosen: 'c', rejected: 'r' }),
      ).invalid,
    ).toBe(1);
    expect(
      convert(data(['m'], [['[{"role":"bad","content":"hi"}]']]), cfg('chat', { messages: 'm' }))
        .invalid,
    ).toBe(1);
  });
  it('rejects whitespace in fastText labels', () =>
    expect(
      convert(data(['x', 'y'], [['hi', 'two words']]), cfg('fasttext', { text: 'x', labels: 'y' }))
        .invalid,
    ).toBe(1));
});
