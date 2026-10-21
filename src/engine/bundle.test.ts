import { describe, it, expect } from 'vitest';
import { inferFileRole, buildBundle, type BundleOptions, type BundleFile } from './bundle';
import { parseInput } from './formats';
import { defaults } from './types';
import { makeZip } from './zip';
const parse = (text: string, name: string) =>
  parseInput(text, name, text.length, 'auto', false, defaults);
const options: BundleOptions = {
  indexBase: 0,
  useClasses: true,
  useStopwords: false,
  tokenize: 'none',
  confirmed: true,
};
const datasets = [
  parse('学校新闻\t1\n经济新闻\t0', 'train.txt'),
  parse('验证新闻\t1', 'dev.txt'),
  parse('测试新闻\t0', 'test.txt'),
  parse('finance\neducation', 'clasee.txt'),
  parse('的\n了', 'stop_word.txt'),
];
const files: BundleFile[] = datasets.map((d) => ({
  role: inferFileRole(d.name),
  textColumn: d.headers[0],
  labelColumn: d.headers[1] || '',
}));
describe('dataset folders', () => {
  it('suggests known filename roles but leaves unrelated files out', () => {
    expect(inferFileRole('dataset/clasee.txt')).toBe('classes');
    expect(inferFileRole('STOP_WORD.txt')).toBe('stopwords');
    expect(inferFileRole('validation.csv')).toBe('dev');
    expect(inferFileRole('notes.txt')).toBe('ignore');
  });
  it('keeps splits separate with one shared class convention', () => {
    const out = buildBundle(datasets, files, options);
    expect(out.map((v) => [v.name, v.rows])).toEqual([
      ['train.fasttext.txt', 2],
      ['dev.fasttext.txt', 1],
      ['test.fasttext.txt', 1],
    ]);
    expect(out[0].content).toContain('__label__education 学校新闻');
    expect(out[2].content).toBe('__label__finance 测试新闻');
    expect(datasets[0].rows[0]).toEqual(['学校新闻', '1']);
  });
  it('rejects ambiguous roles, incorrect labels and missing confirmation', () => {
    expect(() => buildBundle(datasets, files, { ...options, confirmed: false })).toThrow('核对');
    expect(() =>
      buildBundle(
        datasets,
        files.map((f, i) => (i === 1 ? { ...f, role: 'train' } : f)),
        options,
      ),
    ).toThrow('多个候选');
    expect(() =>
      buildBundle([parse('标题\t9', 'train.txt'), ...datasets.slice(1)], files, options),
    ).toThrow('范围');
  });
  it('removes full tokens only when enabled and rejects empty results', () => {
    const ds = [parse('我的学校\t0', 'train.txt'), datasets[3], parse('的', 'stop_word.txt')];
    const fs: BundleFile[] = ds.map((d) => ({
      role: inferFileRole(d.name),
      textColumn: d.headers[0],
      labelColumn: d.headers[1] || '',
    }));
    expect(
      buildBundle(ds, fs, { ...options, useStopwords: true, tokenize: 'character' })[0].content,
    ).toBe('__label__finance 我 学 校');
    expect(() => buildBundle(ds, fs, { ...options, useStopwords: true })).toThrow('完整词');
    expect(() =>
      buildBundle([parse('的\t0', 'train.txt'), ds[1], ds[2]], fs, {
        ...options,
        useStopwords: true,
        tokenize: 'character',
      }),
    ).toThrow('为空');
  });
  it('can retain numeric labels without a class table', () => {
    const out = buildBundle([datasets[0]], [files[0]], { ...options, useClasses: false });
    expect(out[0].content).toContain('__label__1 学校新闻');
  });
  it('creates a ZIP with valid lengths and standard CRC for a known vector', () => {
    const bytes = makeZip([{ name: 'a.txt', content: '123456789' }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    expect(view.getUint32(18, true)).toBe(9);
    expect(new TextDecoder().decode(bytes.slice(35, 44))).toBe('123456789');
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(1);
  });
});
