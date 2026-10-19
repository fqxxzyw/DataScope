import { describe, it, expect } from 'vitest';
import { parseInput } from './formats';
import { defaults } from './types';
import { combineDatasets } from './combine';
import { convert, type ProcessingConfig } from './processing';
const parse = (text: string, name = 'data.txt', header: boolean | 'auto' = 'auto') =>
  parseInput(text, name, text.length, 'auto', header, defaults);
const config: ProcessingConfig = {
  profile: 'fasttext',
  mapping: { text: 'Text', labels: 'Number' },
  trim: false,
  normalize: false,
  collapseWhitespace: false,
  dropEmpty: false,
  deduplicate: false,
  tokenize: 'none',
};
describe('guided import and labels', () => {
  it('detects tab-delimited TXT without losing the first data row', () => {
    const d = parse('这是一条评论\t1\n另一个评论\t2');
    expect(d.headers).toEqual(['Text', 'Number']);
    expect(d.rows.length).toBe(2);
    expect(d.rows[0]).toEqual(['这是一条评论', '1']);
    expect(d.generatedHeaders).toEqual(['Text', 'Number']);
    expect(convert(d, config).content).toBe('__label__1 这是一条评论\n__label__2 另一个评论');
  });
  it('keeps alphabetic labels available as a separate column', () => {
    const d = parse('great\tA\npoor\tB');
    expect(d.headers.length).toBe(2);
    expect(d.rows[1][1]).toBe('B');
  });
  it('detects familiar headers and explicitly handles unknown headers', () => {
    expect(parse('text,label\nhello,1\nworld,2', 'data.csv').headers).toEqual(['text', 'label']);
    expect(parse('alpha,beta\nhello,1', 'data.csv', true).headers).toEqual(['alpha', 'beta']);
    expect(parse('hello,1\nworld,2', 'data.csv', false).rows[0]).toEqual(['hello', '1']);
  });
  it('retains literal text when plain-text mode is chosen', () => {
    const d = parseInput('a,b\nc,d', 'data.txt', 10, 'auto', false, defaults, 'text');
    expect(d.rows).toEqual([['a,b'], ['c,d']]);
  });
  it('joins row-aligned text and numeric labels without modifying either input', () => {
    const a = parse('hello\nworld'),
      b = parse('1\n2', 'labels.txt');
    const d = combineDatasets(a, b, {
      mode: 'rows',
      leftKey: '',
      rightKey: '',
      confirmOrder: true,
    });
    expect(convert(d, config).invalid).toBe(0);
    expect(d.rows).toEqual([
      ['hello', '1'],
      ['world', '2'],
    ]);
    expect(a.headers).toEqual(['Text']);
    expect(() =>
      combineDatasets(a, b, { mode: 'rows', leftKey: '', rightKey: '', confirmOrder: false }),
    ).toThrow('确认');
    expect(() =>
      combineDatasets(a, parse('1'), {
        mode: 'rows',
        leftKey: '',
        rightKey: '',
        confirmOrder: true,
      }),
    ).toThrow('行数');
  });
  it('joins dictionaries by exact key and preserves unmatched rows', () => {
    const a = parse('text,label\nhello,1\nworld,2\nother,3', 'a.csv');
    const b = parse('id,name\n2,negative\n1,positive', 'b.csv');
    const d = combineDatasets(a, b, {
      mode: 'key',
      leftKey: 'label',
      rightKey: 'id',
      confirmOrder: false,
    });
    expect(d.rows.map((r) => r[3])).toEqual(['positive', 'negative', '']);
    expect(d.warnings.at(-1)).toContain('未匹配 1');
    const duplicate = parse('id,name\n1,a\n1,b', 'b.csv');
    expect(() =>
      combineDatasets(a, duplicate, {
        mode: 'key',
        leftKey: 'label',
        rightKey: 'id',
        confirmOrder: false,
      }),
    ).toThrow('重复');
  });
  it('appends reordered fields by name and enforces memory limits', () => {
    const a = parse('text,label\nhello,1', 'a.csv'),
      b = parse('label,text\n2,world', 'b.csv');
    expect(
      combineDatasets(a, b, { mode: 'append', leftKey: '', rightKey: '', confirmOrder: false })
        .rows[1],
    ).toEqual(['world', '2']);
    expect(() =>
      combineDatasets(a, b, { mode: 'append', leftKey: '', rightKey: '', confirmOrder: false }, 2),
    ).toThrow('上限');
  });
});
