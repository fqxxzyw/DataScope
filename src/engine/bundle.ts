import type { Dataset } from './types';
import { combineDatasets } from './combine';
import { convert } from './processing';
export type FileRole = 'train' | 'dev' | 'test' | 'classes' | 'stopwords' | 'ignore';
export const roleNames: Record<FileRole, string> = {
  train: '训练集 train',
  dev: '验证集 dev',
  test: '测试集 test',
  classes: '类别表 class',
  stopwords: '停用词表 stop_word',
  ignore: '不参与此次处理',
};
export function inferFileRole(name: string): FileRole {
  const stem = name
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[-_\s]/g, '');
  if (['train', 'training'].includes(stem)) return 'train';
  if (['dev', 'valid', 'val', 'validation'].includes(stem)) return 'dev';
  if (['test', 'testing'].includes(stem)) return 'test';
  if (['class', 'classes', 'clasee', 'labelnames', 'classnames'].includes(stem)) return 'classes';
  if (['stopword', 'stopwords'].includes(stem)) return 'stopwords';
  return 'ignore';
}
export interface BundleFile {
  role: FileRole;
  textColumn: string;
  labelColumn: string;
}
export interface BundleOptions {
  indexBase: 0 | 1;
  useClasses: boolean;
  useStopwords: boolean;
  tokenize: 'none' | 'word' | 'character';
  confirmed: boolean;
}
export interface BundleOutput {
  name: string;
  content: string;
  rows: number;
  preview: string;
}
export function buildBundle(
  datasets: (Dataset | null)[],
  files: BundleFile[],
  options: BundleOptions,
): BundleOutput[] {
  if (!options.confirmed) throw new Error('请核对文件用途、字段、类别顺序和编号起点，并勾选确认。');
  const find = (role: FileRole) => files.map((f, i) => ({ f, i })).filter((v) => v.f.role === role);
  for (const role of ['train', 'dev', 'test', 'classes', 'stopwords'] as FileRole[])
    if (find(role).length > 1)
      throw new Error(`${roleNames[role]}有多个候选，请明确选择一个，其余设为不参与。`);
  const get = (i: number) => {
    const d = datasets[i];
    if (!d) throw new Error('等待选中文件读取完成，或修正读取错误。');
    return d;
  };
  const classIndex = find('classes')[0]?.i;
  const stopIndex = find('stopwords')[0]?.i;
  if (options.useClasses && classIndex === undefined)
    throw new Error('请指定一份类别表，或关闭类别名称映射。');
  if (options.useStopwords && stopIndex === undefined)
    throw new Error('请指定停用词表，或关闭停用词处理。');
  if (options.useStopwords && options.tokenize === 'none')
    throw new Error('停用词按完整词匹配，请先选择本地词分割或字符分割。');
  const stop = new Set<string>();
  if (options.useStopwords) {
    const d = get(stopIndex!);
    if (d.headers.length !== 1)
      throw new Error('停用词表应为每行一个词，请将该文件设为纯文本、没有标题。');
    for (const row of d.rows) if (row[0].trim()) stop.add(row[0].trim());
  }
  const outputs: BundleOutput[] = [];
  for (const role of ['train', 'dev', 'test'] as const) {
    const item = find(role)[0];
    if (!item) continue;
    const source = get(item.i),
      { textColumn, labelColumn } = item.f;
    if (!source.rows.length) throw new Error(`${source.name} 没有样本。`);
    if (
      textColumn === labelColumn ||
      !source.headers.includes(textColumn) ||
      !source.headers.includes(labelColumn)
    )
      throw new Error(`${source.name}：请分别选择正文列和标签列。`);
    let d = source,
      text = textColumn,
      label = labelColumn;
    if (options.useClasses) {
      d = combineDatasets(source, get(classIndex!), {
        mode: 'classes',
        leftKey: labelColumn,
        rightKey: '',
        confirmOrder: true,
        indexBase: options.indexBase,
      });
      text = d.headers[source.headers.indexOf(textColumn)];
      label = d.headers.at(-1)!;
    }
    let contentData = d;
    if (options.useStopwords) {
      const ti = d.headers.indexOf(text);
      const segmenter =
        options.tokenize === 'word' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
      contentData = {
        ...d,
        rows: d.rows.map((row, i) => {
          const tokens = segmenter
            ? Array.from(segmenter.segment(row[ti]))
                .filter((v) => v.isWordLike)
                .map((v) => v.segment)
            : Array.from(row[ti]).filter((v) => v.trim());
          const result = tokens.filter((v) => !stop.has(v)).join(' ');
          if (!result.trim())
            throw new Error(
              `${source.name} 第 ${i + 1} 行在去停用词后为空，请调整停用词表；未导出任何文件。`,
            );
          const copy = [...row];
          copy[ti] = result;
          return copy;
        }),
      };
    }
    const result = convert(contentData, {
      profile: 'fasttext',
      mapping: { text, labels: label },
      trim: false,
      normalize: false,
      collapseWhitespace: false,
      dropEmpty: false,
      deduplicate: false,
      tokenize: options.useStopwords ? 'none' : options.tokenize,
    });
    if (result.invalid)
      throw new Error(`${source.name}：${result.invalid} 行未通过校验。${result.errors[0]}`);
    outputs.push({
      name: `${role}.fasttext.txt`,
      content: result.content,
      rows: result.output,
      preview: result.preview.slice(0, 1600),
    });
  }
  if (!outputs.length) throw new Error('至少指定一个训练、验证或测试文件。');
  return outputs;
}
