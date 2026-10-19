import type { Dataset, Settings } from './types';
import { parseDataset } from './parser';
export const formatMatrix = [
  ['CSV / TSV / 分隔文本', '导入、EDA、导出', '表格，含引号、换行字段；可选表头和分隔符'],
  ['纯文本 TXT', '导入、EDA、导出', '每行一条文本；空白行保留'],
  ['fastText 单 / 多标签', '导入、校验、导出', '__label__ 前缀；多个标签保留为 JSON 数组'],
  [
    'BERT 单句 / 句对分类',
    '字段映射、JSONL 导出',
    'text / text_pair / label；tokenizer 必须在训练端指定',
  ],
  ['多标签分类', '字段映射、JSONL 导出', 'labels 必须是非空 JSON 字符串数组'],
  ['数值回归', '字段映射、JSONL 导出', 'label 必须为有限数值'],
  [
    'CoNLL / BIO / BIOES / BILOU',
    '导入、校验、导出',
    '每行 token + tag，句子以空行分隔；检查标签转移',
  ],
  ['JSON / JSONL 对象记录', '导入、EDA、导出', '字段并集；嵌套结构保留 JSON 字符串，不自动展平'],
  ['Seq2Seq / 摘要 / 翻译', '字段映射、JSONL 导出', 'source / target；不自动判断语言和语义质量'],
  ['指令数据', '字段映射、JSONL 导出', 'instruction / input / output'],
  ['对话 messages', '校验、JSONL 导出', 'role / content 消息数组；不应用模型专用 chat template'],
  ['偏好比较 DPO', '字段映射、JSONL 导出', 'prompt / chosen / rejected；检查回答不同'],
  [
    '抽取式问答',
    '校验、JSONL 导出',
    'context / question / answers；按 Unicode 码点验证 answer_start',
  ],
  ['向量检索 / 对比学习', '字段映射、JSONL 导出', 'anchor / positive / negative'],
  ['图像 / 音频 / 视频', '仅元数据表 EDA', '不解码媒体或验证文件存在性'],
  [
    'Parquet / Arrow / Excel / 数据库',
    '暂不支持直接导入',
    '请先导出 CSV / JSONL；不假装支持二进制格式',
  ],
  ['TFRecord / LibSVM / 模型 token IDs', '暂不支持', '依赖专用 schema、词表、稀疏结构或 tokenizer'],
  [
    '嵌套 SQuAD / ShareGPT / 自定义结构',
    '需先转换为明确记录结构',
    '不基于文件名推断语义，不静默重写未知格式',
  ],
];
export function validateTags(tokens: unknown, tags: unknown): string | undefined {
  if (
    !Array.isArray(tokens) ||
    !Array.isArray(tags) ||
    !tokens.length ||
    tokens.length !== tags.length
  )
    return 'tokens 与 tags 必须是等长非空数组';
  if (!tokens.every((t) => typeof t === 'string' && t.trim() && !/\s/.test(t)))
    return 'token 必须是无空白的非空字符串';
  if (!tags.every((t) => typeof t === 'string' && /^(O|[BIESUL]-.+)$/.test(t)))
    return '标签必须为 O 或 B/I/E/S/U/L-实体类型';
  const explicit = tags.some((t) => /^[ESUL]-/.test(t));
  let active = '';
  for (const tag of tags) {
    const p = tag[0],
      kind = tag.slice(2);
    if (p === 'I' || p === 'E' || p === 'L') {
      if (active !== kind) return `非法标签转移：${tag} 缺少同类型 B/I 前缀`;
      if (p === 'E' || p === 'L') active = '';
    } else {
      if (explicit && active) return 'BIOES/BILOU 实体缺少结束标签';
      active = p === 'B' ? kind : '';
    }
  }
  if (explicit && active) return 'BIOES/BILOU 句末实体未闭合';
  return undefined;
}
export function parseInput(
  text: string,
  name: string,
  size: number,
  delimiter: string,
  header: boolean,
  settings: Settings,
  format = 'auto',
): Dataset {
  text = text.replace(/^\uFEFF/, '');
  let chosen = format;
  if (chosen === 'auto') {
    if (/\.jsonl$/i.test(name)) chosen = 'jsonl';
    else if (/\.json$/i.test(name)) chosen = 'json';
    else if (/\.(conll|bio)$/i.test(name)) chosen = 'conll';
    else if (
      /\.txt$/i.test(name) &&
      text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .every((l) => /^__label__\S+\s/.test(l))
    )
      chosen = 'fasttext';
    else chosen = 'table';
  }
  if (chosen === 'table') return parseDataset(text, name, size, delimiter, header, settings);
  if (chosen === 'text')
    return { ...parseDataset(text, 'plain.txt', size, 'auto', false, settings), name };
  const warnings = [`已按 ${chosen} 规则读取；请核对字段及任务含义。`];
  if (text.includes('\uFFFD')) warnings.push('文件可能不是 UTF-8 编码。');
  let headers: string[] = [],
    rows: string[][];
  if (chosen === 'json' || chosen === 'jsonl') {
    let records: unknown[];
    try {
      const parsed: unknown =
        chosen === 'json'
          ? JSON.parse(text)
          : text
              .split(/\r?\n/)
              .filter((l) => l.trim())
              .map((l, i) => {
                try {
                  return JSON.parse(l);
                } catch (cause) {
                  throw new Error(`JSONL 第 ${i + 1} 条记录无效`, { cause });
                }
              });
      if (!Array.isArray(parsed)) throw new Error('需要 JSON 对象数组，而不是嵌套数据集容器');
      records = parsed;
    } catch (e) {
      throw new Error(`JSON 解析失败：${e instanceof Error ? e.message : '格式无效'}`, {
        cause: e,
      });
    }
    if (!records.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r)))
      throw new Error('每条 JSON 记录必须是对象');
    headers = [...new Set(records.flatMap((r) => Object.keys(r as object)))];
    rows = records.map((r) =>
      headers.map((h) => {
        const v = (r as Record<string, unknown>)[h];
        return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      }),
    );
    warnings.push('JSON null 与不存在的键映射为空白；嵌套对象和数组保留为 JSON 字符串。');
  } else if (chosen === 'fasttext') {
    headers = ['text', 'labels'];
    rows = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((line, i) => {
        const words = line.trim().split(/\s+/),
          labels: string[] = [];
        while (words[0]?.startsWith('__label__')) {
          const label = words.shift()!.slice(9);
          if (!label) throw new Error(`第 ${i + 1} 行标签为空`);
          labels.push(label);
        }
        if (!labels.length || !words.length)
          throw new Error(`fastText 第 ${i + 1} 行需要标签和正文`);
        if (words.some((w) => w.startsWith('__label__')))
          throw new Error(`第 ${i + 1} 行标签混入正文；请将标签统一放在行首`);
        return [words.join(' '), JSON.stringify(labels)];
      });
    warnings.push('fastText 读取会将词间空白规范为一个空格；标签保留为 JSON 数组。');
  } else if (chosen === 'conll') {
    headers = ['tokens', 'tags'];
    const blocks = text.trim().split(/\r?\n\s*\r?\n/);
    rows = blocks.map((block, i) => {
      const pairs = block.split(/\r?\n/).map((l) => l.trim().split(/\s+/));
      if (pairs.some((p) => p.length !== 2))
        throw new Error(`句子 ${i + 1} 需要严格的两列 token/tag；多列 CoNLL 请先选出目标列。`);
      const tokens = pairs.map((p) => p[0]),
        tags = pairs.map((p) => p[1]),
        error = validateTags(tokens, tags);
      if (error) throw new Error(`句子 ${i + 1}：${error}`);
      return [JSON.stringify(tokens), JSON.stringify(tags)];
    });
  } else throw new Error('不支持的格式，请手动选择已支持的适配器');
  if (!rows.length || !headers.length) throw new Error('没有可分析的记录或字段');
  if (rows.length * headers.length > settings.maxCells)
    throw new Error('超过单元格保护上限，请拆分文件');
  return { name, size, rows, headers, warnings };
}
