import { HelpDemo } from './HelpDemo';
import { useState, useRef } from 'react';
import { useStore, request } from '../store';
import {
  profiles,
  type Profile,
  type ProcessingConfig,
  type ProcessingResult,
} from '../engine/processing';
import { formatMatrix } from '../engine/formats';
import { download } from './AnalysisPages';
const initial: ProcessingConfig = {
  profile: 'bert',
  mapping: {},
  trim: false,
  normalize: false,
  collapseWhitespace: false,
  dropEmpty: false,
  deduplicate: false,
  tokenize: 'none',
};
export function Processing() {
  const { report: r, hasRaw, setError, roles, setImportFiles } = useStore();
  const labelInput = useRef<HTMLInputElement>(null);
  const suggestedMapping = { text: roles.text || '', label: roles.truth, labels: roles.truth };
  const [config, setConfig] = useState<ProcessingConfig>({ ...initial, mapping: suggestedMapping }),
    [result, setResult] = useState<ProcessingResult | null>(null),
    [busy, setBusy] = useState(false);
  if (!r) return null;
  const update = (patch: Partial<ProcessingConfig>) => {
    setConfig({ ...config, ...patch });
    setResult(null);
  };
  async function preview() {
    setBusy(true);
    setResult(null);
    try {
      const m = await request({ type: 'convert', config });
      if (m.type === 'converted') setResult(m.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="glass panel">
        <span className="eyebrow">EXPLICIT RULES. DIFFERENT DESTINATIONS.</span>
        <h2>
          同一份数据，不同的模型入口。 <HelpDemo kind={`profile-${config.profile}`} />
        </h2>
        <p>
          明确选择适配器并映射字段，再预览、审核并另存副本。不会用大模型猜测格式，也不会修改原文件。
        </p>
        <div className="toolbar">
          <label>
            输出适配器 <HelpDemo kind={`profile-${config.profile}`} />
            <select
              aria-label="输出适配器"
              value={config.profile}
              onChange={(e) =>
                update({ profile: e.target.value as Profile, mapping: suggestedMapping })
              }
            >
              {Object.entries(profiles).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="task-guidance">
          <h3>你要准备什么？</h3>
          <p>
            {config.profile === 'fasttext'
              ? 'fastText 分类需要正文 + 标签。标签可以是 1–10、字母或类别名称；导出时程序添加 __label__ 前缀。若标签在另一个文件中，请先添加并关联。'
              : '先把下面的输出字段对应到你的数据列，再预览校验。数值回归、句对、NER、问答等任务分别使用对应适配器。'}
          </p>
          <input
            hidden
            type="file"
            ref={labelInput}
            multiple
            accept=".csv,.tsv,.txt,.json,.jsonl"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) setImportFiles(files);
              e.target.value = '';
            }}
          />
          <button onClick={() => labelInput.current?.click()}>标签在另一个文件？添加并关联</button>
          <p className="footnote">
            进入导入页后，勾选“使用当前导入的原始数据作为主表”，选择“类别列表”映射
            class.txt，或按行对应 / 按编号匹配，并检查组合预览。
          </p>
        </div>
        <div className="processing-grid">
          {(profiles[config.profile].fields as readonly string[]).map((key) => (
            <label key={key}>
              {key} <HelpDemo kind="mapping" title={`字段 ${key} 的用途`} />
              <select
                aria-label={`映射 ${key}`}
                value={config.mapping[key] || ''}
                onChange={(e) => update({ mapping: { ...config.mapping, [key]: e.target.value } })}
              >
                <option value="">请选择源字段</option>
                {r.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · {c.type}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <h3>
          可选处理 · 默认全部关闭 <HelpDemo kind="prepare" />
        </h3>
        <div className="toolbar">
          {(
            [
              { key: 'trim', label: '去除首尾空白' },
              { key: 'normalize', label: 'Unicode NFC 规范化' },
              { key: 'collapseWhitespace', label: '合并连续空白 / 换行' },
              { key: 'dropEmpty', label: '移除必需字段为空的行' },
              { key: 'deduplicate', label: '按映射后的完整记录去重' },
            ] as const
          ).map(({ key, label }) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={config[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
              />
              {label} <HelpDemo kind={key} />
            </label>
          ))}
        </div>
        {config.profile === 'fasttext' && (
          <label>
            正文分词 <HelpDemo kind="tokenize" />
            <select
              aria-label="fastText 分词"
              value={config.tokenize}
              onChange={(e) => update({ tokenize: e.target.value as ProcessingConfig['tokenize'] })}
            >
              <option value="none">保持原样</option>
              <option value="word">本地词分割 Intl.Segmenter</option>
              <option value="character">Unicode 字符</option>
            </select>
          </label>
        )}
        <p className="footnote">
          labels 支持单标签字符串或 JSON 字符串数组；tokens、tags、messages、answers 要求合法
          JSON。QA 偏移按 Unicode 码点验证。格式转换不等于训练可用性验证。
        </p>
        <div className="toolbar">
          <button
            className="primary"
            disabled={
              !hasRaw ||
              busy ||
              (profiles[config.profile].fields as readonly string[]).some((k) => !config.mapping[k])
            }
            onClick={preview}
          >
            {busy ? '正在校验…' : '校验并生成预览'}
          </button>
          {!hasRaw && <span>请重新打开原文件后进行转换。</span>}
        </div>
        {result && (
          <>
            <div className="notice">
              输入 {result.input} · 有效输出 {result.output} · 按选项移除 {result.removed} ·
              校验失败 {result.invalid}
            </div>
            {result.warnings.map((w) => (
              <p className="notice" key={w}>
                {w}
              </p>
            ))}
            {result.errors.length > 0 && (
              <details open>
                <summary>查看错误（最多前 100 条）</summary>
                <pre className="preview-code">{result.errors.join('\n')}</pre>
              </details>
            )}
            <h3>输出预览 · 前 6000 字符</h3>
            <pre className="preview-code">{result.preview}</pre>
            <button
              disabled={result.invalid > 0 || !result.output}
              onClick={() => {
                download(
                  result.content,
                  `datascope-${config.profile}.${result.extension}`,
                  'text/plain;charset=utf-8',
                );
                download(
                  JSON.stringify(
                    {
                      source: r.name,
                      config,
                      input: result.input,
                      output: result.output,
                      removed: result.removed,
                      warnings: result.warnings,
                    },
                    null,
                    2,
                  ),
                  'datascope-processing-manifest.json',
                  'application/json',
                );
              }}
            >
              确认预览并导出副本 + 处理记录
            </button>
          </>
        )}
      </section>
      <section className="glass panel">
        <h3>各输出格式的示例</h3>
        <div className="class-chips">
          {Object.entries(profiles).map(([key, p]) => (
            <span key={key}>
              {p.title}
              <HelpDemo kind={`profile-${key}`} />
            </span>
          ))}
        </div>
        <h2>
          格式与任务支持矩阵 <HelpDemo kind="processing" />
        </h2>
        <p>
          按语法与结构枚举，而非按模型名称猜测。“BERT 数据”没有统一文件格式，需由训练脚本规定字段和
          tokenizer。
        </p>
        <div className="table-scroll support-table">
          <table>
            <thead>
              <tr>
                <th>格式 / 任务</th>
                <th>支持范围</th>
                <th>约束</th>
              </tr>
            </thead>
            <tbody>
              {formatMatrix.map(([a, b, c]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
