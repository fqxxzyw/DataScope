import Papa from 'papaparse';
import type { Dataset, Report } from './types';
export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function problemCsv(data: Dataset, indexes: number[], issue: string) {
  let extra = '_datascope_issue';
  while (data.headers.includes(extra)) extra += '_';
  return Papa.unparse(
    {
      fields: [...data.headers, extra],
      data: [...new Set(indexes)]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < data.rows.length)
        .map((i) => [...data.rows[i], issue]),
    },
    { escapeFormulae: true },
  );
}
export function htmlReport(r: Report) {
  const e = escapeHtml;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DataScope · ${e(r.name)}</title><style>body{font:16px/1.7 system-ui;color:#243248;background:#f4f6fa;max-width:1000px;margin:40px auto;padding:24px}section{background:white;border:1px solid #ddd;border-radius:20px;padding:24px;margin:20px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#617086}h1{font-size:36px}h2{color:#315fbd}</style><h1>DataScope · 数据体检报告</h1><p>${e(r.name)} · ${e(r.createdAt)} · UTF-8</p><section><h2>数据概览</h2><p>${r.rowCount} 行 / ${r.columns.length} 字段 · 空白 ${r.missing} · 重复副本 ${r.duplicateCount} · 健康评分 ${r.score}/100</p><p>评分是规则摘要，不表示数据适合建模。${r.penalties.map((p) => `${e(p.label)}：−${p.value.toFixed(2)}`).join('；')}</p>${r.warnings.map((w) => `<p>${e(w)}</p>`).join('')}</section><section><h2>字段与缺失值</h2><table><tr><th>字段</th><th>类型</th><th>非空</th><th>空白</th><th>唯一</th></tr>${r.columns.map((c) => `<tr><td>${e(c.name)}</td><td>${c.type}</td><td>${c.nonNull}</td><td>${c.missing}</td><td>${c.unique}</td></tr>`).join('')}</table></section>${r.columns.map((c) => `<section><h2>${e(c.name)} · ${c.type}${r.target === c.name ? ' · Target' : ''}</h2><p>疑似缺失标记：${e(JSON.stringify(c.tokens))}</p>${c.stats ? `<h3>数值统计 · 样本标准差（n−1）</h3><pre>${e(JSON.stringify(c.stats, null, 2))}</pre><p>IQR 潜在异常 ${c.outliers.length} 行；统计异常不等于错误。</p>` : ''}${c.length ? `<h3>文本长度 · Unicode 码点</h3><pre>${e(JSON.stringify(c.length, null, 2))}</pre><h3>高频词（分词，隐藏停用词，Top 100）</h3><pre>${e(JSON.stringify(r.wordSummary[c.name], null, 2))}</pre>` : ''}<h3>非空值分布（最多 100 项）</h3><table>${c.counts.map(([v, n]) => `<tr><td>${e(v)}</td><td>${n}</td><td>${((100 * n) / Math.max(1, c.nonNull)).toFixed(2)}%</td></tr>`).join('')}</table></section>`).join('')}<section><h2>重复组 · 数据行索引从 1 开始</h2><pre>${e(JSON.stringify(r.duplicates.map((g) => g.map((i) => i + 1))))}</pre></section><section><h2>Pearson 相关性</h2><p>成对有效值计算，常量列或样本不足为 null。相关性不代表因果。</p><pre>${e(JSON.stringify(r.correlations, null, 2))}</pre></section><section><h2>问题与下一步建议</h2>${r.issues.map((i) => `<article><h3>${e(i.title)} · ${e(i.column || '全表')}</h3><p>${e(i.description)}</p><p>□ ${e(i.suggestion)}</p><small>影响 ${i.affectedRows} 行（${(i.ratio * 100).toFixed(2)}%）</small></article>`).join('') || '<p>当前规则未发现问题；仍需结合业务验证。</p>'}</section><section><h2>分析参数</h2><pre>${e(JSON.stringify(r.settings, null, 2))}</pre><p>所有分析在浏览器本地完成。本报告含字段值、词频等派生信息，分享前请复核敏感内容。</p></section></html>`;
}
