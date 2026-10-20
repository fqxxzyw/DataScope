import { describe, it, expect } from 'vitest';
import {
  analyze,
  cooccurrence,
  context,
  cosineSimilarity,
  countNgrams,
  frequency,
  idf,
  ngrams,
  pipeline,
  removeStopWords,
  sparseCosine,
  tf,
  tfidf,
  tokenize,
} from './nlp';
import { defaults, safeSettings, stopDefaults } from './defaults';
import { parseText, selectDocuments } from './parser';
import { exportAnalysis } from './export';
describe('ContextMap pure NLP', () => {
  it('counts occurrence and document frequency separately', () => {
    expect(frequency([['酒店', '服务', '酒店']])).toContainEqual({ word: '酒店', count: 2, df: 1 });
    expect(
      frequency([
        ['酒店', '服务'],
        ['酒店', '房间'],
        ['交通', '方便'],
      ]).find((t) => t.word === '酒店')?.df,
    ).toBe(2);
  });
  it('slides bigrams and trigrams without crossing documents', () => {
    const t = ['我', '喜欢', '学习', 'NLP'];
    expect(ngrams(t, 2)).toEqual([
      ['我', '喜欢'],
      ['喜欢', '学习'],
      ['学习', 'NLP'],
    ]);
    expect(ngrams(t, 3)).toEqual([
      ['我', '喜欢', '学习'],
      ['喜欢', '学习', 'NLP'],
    ]);
    expect(countNgrams([['a'], ['b']], 2)).toEqual([]);
  });
  it('uses length normalized TF and smoothed IDF', () => {
    expect(tf(2, 4)).toBe(0.5);
    expect(idf(3, 2)).toBeCloseTo(Math.log(4 / 3) + 1);
    expect(tfidf(2, 4, 3, 2)).toBeCloseTo(0.5 * (Math.log(4 / 3) + 1));
    expect(tf(0, 0)).toBe(0);
  });
  it('compares vector direction and handles zeros', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
    expect(sparseCosine({ a: 2, b: 1 }, { a: 4, b: 2 })).toBeCloseTo(1);
  });
  it('counts each distinct position pair once within radius', () => {
    const e = cooccurrence([['酒店', '服务', '很好']], 2);
    expect(e).toHaveLength(3);
    expect(e.every((e) => e.weight === 1)).toBe(true);
    expect(cooccurrence([['a', 'b', 'a']], 1)).toEqual([{ source: 'a', target: 'b', weight: 2 }]);
    expect(cooccurrence([['a'], ['b']], 2)).toEqual([]);
  });
  it('removes exact stopwords and finds KWIC boundaries', () => {
    expect(removeStopWords(['我', '喜欢', '学习', 'NLP'], new Set(['我']))).toEqual([
      '喜欢',
      '学习',
      'NLP',
    ]);
    expect(context([['酒店', '服务', '很好']], '服务', 1)).toEqual([
      { document: 0, before: ['酒店'], word: '服务', after: ['很好'] },
    ]);
  });
  it('segments Chinese locally and preserves punctuation stage differences', () => {
    expect(tokenize('酒店服务很好', 'zh')).toContain('酒店');
    expect(tokenize('Hello, world!', 'en')).toEqual(['Hello', 'world']);
    const off = pipeline('Ａ，酒店！', { ...defaults, punctuation: false }, new Set());
    expect(off.stages[3].value).toBe('A,酒店!');
    expect(off.stages[3].enabled).toBe(false);
    expect(pipeline('a,b', { ...defaults, language: 'en' }, new Set()).tokens).toEqual(['a', 'b']);
  });
  it('uses sparse vectors safely for prototype-like words', () => {
    const a = analyze(
      [{ text: 'constructor constructor prototype' }, { text: 'prototype' }],
      { ...defaults, language: 'en' },
      [],
    );
    expect(a.frequency.find((t) => t.word === 'constructor')?.count).toBe(2);
    expect(a.vectors[0].constructor).toBeCloseTo(tfidf(2, 3, 2, 1));
  });
  it('exports real counts and keeps source opt-in', () => {
    const a = analyze([{ text: '酒店 酒店 服务', label: 'private-label' }], defaults, []);
    const csv = exportAnalysis(a, 'frequency');
    expect(csv).toContain('"word","count","document_frequency"');
    expect(csv).toContain('"酒店","2","1"');
    const json = JSON.parse(exportAnalysis(a, 'analysis'));
    expect(json.source).toBeUndefined();
    expect(json.documents).toBe(1);
    expect(JSON.parse(exportAnalysis(a, 'analysis', true)).source[0].text).toBe('酒店 酒店 服务');
  });
  it('enforces bounded settings and document limits', () => {
    expect(
      safeSettings({ ...defaults, graphNodes: 10000, similarityLimit: 10000 }).graphNodes,
    ).toBe(100);
    expect(() =>
      analyze(
        Array.from({ length: 10001 }, () => ({ text: 'a' })),
        defaults,
        [],
      ),
    ).toThrow('10,000');
  });
  it('analyzes 10,000 small documents', () => {
    const a = analyze(
      Array.from({ length: 10000 }, () => ({ text: '酒店 服务 很好' })),
      defaults,
      stopDefaults.zh,
    );
    expect(a.documents).toHaveLength(10000);
    expect(a.frequency.find((t) => t.word === '酒店')?.df).toBe(10000);
  }, 20000);
});
describe('ContextMap import', () => {
  it('preserves headerless rows and numeric labels', () => {
    const p = parseText('酒店很好\t0\n房间太小\t1', 'train.tsv', false);
    expect(p.rows).toHaveLength(2);
    expect(selectDocuments(p, 0, 1)[0]).toEqual({ text: '酒店很好', label: '0' });
  });
  it('handles CSV quoting, duplicates and BOM', () => {
    const p = parseText('\uFEFFtext,text\n"hello, world",positive', 'data.csv');
    expect(p.headers[0]).not.toBe(p.headers[1]);
    expect(selectDocuments(p, 0, 1)[0].text).toBe('hello, world');
    expect(() => selectDocuments(p, 0, 0)).toThrow();
  });
  it('supports whole TXT and rejects broken tables', () => {
    expect(parseText('a\nb', 'a.txt', true, true).rows).toEqual([['a\nb']]);
    expect(() => parseText('a,b\n1,2,3', 'a.csv')).not.toThrow();
    expect(() => parseText('a,b\n1,2\n3,4,5', 'a.csv')).toThrow();
  });
});
