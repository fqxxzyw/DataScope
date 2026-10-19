import Papa from 'papaparse';
import type { Dataset } from './types';
import { numeric } from './statistics';
import { validateTags } from './formats';
export const profiles = {
  csv: { title: '通用 CSV', fields: [] },
  tsv: { title: '通用 TSV', fields: [] },
  jsonl: { title: '通用 JSONL', fields: [] },
  text: { title: '纯文本', fields: ['text'] },
  fasttext: { title: 'fastText 单 / 多标签', fields: ['text', 'labels'] },
  bert: { title: 'BERT / HF 单句分类', fields: ['text', 'label'] },
  pair: { title: 'BERT / HF 句对分类', fields: ['text', 'text_pair', 'label'] },
  multilabel: { title: '多标签 JSONL', fields: ['text', 'labels'] },
  regression: { title: '文本回归', fields: ['text', 'label'] },
  conll: { title: 'CoNLL 标注', fields: ['tokens', 'tags'] },
  ner: { title: 'Token classification JSONL', fields: ['tokens', 'tags'] },
  seq2seq: { title: 'Seq2Seq / 翻译 / 摘要', fields: ['source', 'target'] },
  instruction: { title: '指令微调', fields: ['instruction', 'input', 'output'] },
  chat: { title: 'Chat messages', fields: ['messages'] },
  dpo: { title: '偏好比较 DPO', fields: ['prompt', 'chosen', 'rejected'] },
  qa: { title: '抽取式问答', fields: ['context', 'question', 'answers'] },
  triplet: { title: '检索三元组', fields: ['anchor', 'positive', 'negative'] },
} as const;
export type Profile = keyof typeof profiles;
export interface ProcessingConfig {
  profile: Profile;
  mapping: Record<string, string>;
  trim: boolean;
  normalize: boolean;
  collapseWhitespace: boolean;
  dropEmpty: boolean;
  deduplicate: boolean;
  tokenize: 'none' | 'word' | 'character';
}
export interface ProcessingResult {
  content: string;
  extension: string;
  input: number;
  output: number;
  removed: number;
  invalid: number;
  errors: string[];
  preview: string;
  warnings: string[];
}
function stringArray(value: string): string[] {
  let v: unknown;
  try {
    v = JSON.parse(value);
  } catch {
    return [value];
  }
  if (!Array.isArray(v) || !v.every((t) => typeof t === 'string'))
    throw new Error('标签需为字符串或 JSON 字符串数组');
  return v;
}
export function convert(data: Dataset, c: ProcessingConfig): ProcessingResult {
  const fields = profiles[c.profile].fields as readonly string[],
    headers = fields.length ? [...fields] : data.headers;
  for (const key of fields)
    if (!data.headers.includes(c.mapping[key])) throw new Error(`请映射必需字段 ${key}`);
  const errors: string[] = [],
    warnings: string[] = [],
    result: Record<string, unknown>[] = [],
    seen = new Set<string>();
  let removed = 0,
    invalid = 0;
  const transform = (v: string) => {
    let t = v;
    if (c.trim) t = t.trim();
    if (c.normalize) t = t.normalize('NFC');
    if (c.collapseWhitespace) t = t.replace(/\s+/g, ' ');
    return t;
  };
  data.rows.forEach((row, index) => {
    try {
      const obj: Record<string, unknown> = Object.create(null);
      for (const key of headers)
        obj[key] = transform(row[data.headers.indexOf(fields.length ? c.mapping[key] : key)]);
      const empty = fields.some((k) => k !== 'input' && !String(obj[k]).trim());
      if (empty) {
        if (c.dropEmpty) {
          removed++;
          return;
        }
        throw new Error('必需字段为空；可复核后选择移除空白映射行');
      }
      if (['fasttext', 'multilabel'].includes(c.profile)) {
        const labels = stringArray(String(obj.labels));
        if (!labels.length || labels.some((l) => !l.trim()))
          throw new Error('标签数组不能为空或含空标签');
        obj.labels = labels;
      }
      if (c.profile === 'regression') {
        const n = numeric(String(obj.label));
        if (n === null) throw new Error('回归标签必须为有限数值');
        obj.label = n;
      }
      if (['conll', 'ner'].includes(c.profile)) {
        obj.tokens = JSON.parse(String(obj.tokens));
        obj.tags = JSON.parse(String(obj.tags));
        const error = validateTags(obj.tokens, obj.tags);
        if (error) throw new Error(error);
      }
      if (c.profile === 'chat') {
        const a: unknown = JSON.parse(String(obj.messages));
        if (
          !Array.isArray(a) ||
          !a.length ||
          !a.every(
            (m) =>
              m &&
              typeof m === 'object' &&
              ['system', 'user', 'assistant', 'tool'].includes(m.role) &&
              typeof m.content === 'string',
          )
        )
          throw new Error('messages 需要非空 role/content 对象数组');
        obj.messages = a;
      }
      if (c.profile === 'qa') {
        const a: unknown = JSON.parse(String(obj.answers));
        if (
          !a ||
          typeof a !== 'object' ||
          !('text' in a) ||
          !('answer_start' in a) ||
          !Array.isArray(a.text) ||
          !Array.isArray(a.answer_start) ||
          a.text.length !== a.answer_start.length
        )
          throw new Error('answers 需要等长 text 与 answer_start 数组');
        const context = Array.from(String(obj.context));
        for (let i = 0; i < a.text.length; i++) {
          const t = a.text[i],
            p = a.answer_start[i];
          if (
            typeof t !== 'string' ||
            !Number.isInteger(p) ||
            p < 0 ||
            context.slice(p, p + Array.from(t).length).join('') !== t
          )
            throw new Error('答案偏移与 context 不一致（按 Unicode 码点）');
        }
        obj.answers = a;
      }
      if (c.profile === 'dpo' && obj.chosen === obj.rejected)
        throw new Error('chosen 与 rejected 相同，无法构成偏好对');
      if (c.profile === 'fasttext') {
        const labels = obj.labels as string[];
        if (labels.some((l) => /\s/.test(l) || l.startsWith('__label__')))
          throw new Error('fastText 标签不能含空白或重复前缀');
        let text = String(obj.text);
        if (/[\r\n]/.test(text)) throw new Error('fastText 正文必须为单行；可启用合并空白');
        if (/(^|\s)__label__/.test(text)) throw new Error('正文含保留标签前缀');
        if (c.tokenize === 'character')
          text = Array.from(text)
            .filter((t) => t.trim())
            .join(' ');
        if (c.tokenize === 'word') {
          if (typeof Intl.Segmenter !== 'function')
            throw new Error('当前浏览器不支持 Intl.Segmenter，请选字符或不分词');
          text = Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(text))
            .filter((s) => s.isWordLike)
            .map((s) => s.segment)
            .join(' ');
        }
        obj.text = text;
      }
      if (c.profile === 'text' && /[\r\n]/.test(String(obj.text)))
        throw new Error('纯文本导出要求每条单行；可启用合并空白');
      const key = JSON.stringify(obj);
      if (c.deduplicate && seen.has(key)) {
        removed++;
        return;
      }
      seen.add(key);
      result.push(obj);
    } catch (e) {
      invalid++;
      if (errors.length < 100)
        errors.push(`数据行 ${index + 1}：${e instanceof Error ? e.message : '格式错误'}`);
    }
  });
  let content: string,
    extension = 'jsonl';
  if (['csv', 'tsv'].includes(c.profile)) {
    content = Papa.unparse(
      { fields: headers, data: result.map((o) => headers.map((h) => String(o[h] ?? ''))) },
      { delimiter: c.profile === 'tsv' ? '\t' : ',', escapeFormulae: true },
    );
    extension = c.profile;
  } else if (c.profile === 'text') {
    content = result.map((o) => o.text).join('\n');
    extension = 'txt';
  } else if (c.profile === 'fasttext') {
    content = result
      .map((o) => (o.labels as string[]).map((l) => '__label__' + l).join(' ') + ' ' + o.text)
      .join('\n');
    extension = 'txt';
  } else if (c.profile === 'conll') {
    content = result
      .map((o) =>
        (o.tokens as string[]).map((t, i) => `${t}\t${(o.tags as string[])[i]}`).join('\n'),
      )
      .join('\n\n');
    extension = 'conll';
  } else content = result.map((o) => JSON.stringify(o)).join('\n');
  if (invalid) warnings.push(`${invalid} 行校验失败；必须解决后才能导出，避免静默丢弃。`);
  if (['bert', 'pair', 'ner', 'chat'].includes(c.profile))
    warnings.push(
      '这是训练前的记录格式，不包含模型 tokenizer、attention_mask、special tokens 或 chat template。',
    );
  if (c.profile === 'fasttext' && c.tokenize === 'none')
    warnings.push('fastText 使用空白分词；中文通常需要明确选择分词方式。');
  if (c.profile === 'jsonl')
    warnings.push('通用 JSONL 保留当前表格的字符串类型；嵌套 JSON 字段不会自动还原。');
  return {
    content,
    extension,
    input: data.rows.length,
    output: result.length,
    removed,
    invalid,
    errors,
    preview: content.slice(0, 6000),
    warnings,
  };
}
