import { HelpDemo } from './HelpDemo';
import { useState } from 'react';
import { useStore } from '../store';
export function ColumnGuide() {
  const { report: r, roles, setRoles, setTab } = useStore();
  const suggestedText =
    r?.columns.find((c) => /text|sentence|content|正文|文本/i.test(c.name))?.name ||
    r?.columns.find((c) => c.type === 'Text')?.name ||
    '';
  const suggestedLabel =
    r?.columns.find((c) => /class.*Label/i.test(c.name))?.name ||
    r?.columns.find((c) => /label|target|类别|标签/i.test(c.name))?.name ||
    r?.columns.find((c) => c.name !== suggestedText && c.unique > 1 && c.unique <= 20)?.name ||
    '';
  const [text, setText] = useState(roles.text || suggestedText),
    [label, setLabel] = useState(roles.truth || suggestedLabel);
  const [confirmed, setConfirmed] = useState(false);
  if (!r) return null;
  return (
    <section className="glass panel">
      <div className="section-heading">
        <div>
          <h2>
            哪列是正文，哪列是标签？ <HelpDemo kind="mapping" />
          </h2>
          <p>
            以下是基于列名与取值的建议，不代表已确认。标签可以是数字或字母；分类标签不按连续数值解释。
          </p>
        </div>
        <span className="badge">{confirmed ? '已确认字段用途' : '建议 · 等你确认'}</span>
      </div>
      <div className="role-grid">
        {(
          [
            ['正文 / Text', text, setText],
            ['分类标签 / Label', label, setLabel],
          ] as const
        ).map(([title, value, setter]) => (
          <label key={title}>
            {title}
            <select
              aria-label={title}
              value={value}
              onChange={(e) => {
                setter(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">请选择对应列；不需要可留空</option>
              {r.columns.map((c, i) => (
                <option key={c.name} value={c.name}>
                  第 {i + 1} 列 · {c.name} · 示例：{c.counts[0]?.[0].slice(0, 36) || '空白'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="toolbar">
        <button
          className="primary"
          disabled={!text || text === label}
          onClick={() => {
            setRoles({
              ...roles,
              text,
              truth: label,
              task: 'classification',
              features: text ? [text] : [],
            });
            setConfirmed(true);
          }}
        >
          确认正文与标签
        </button>
        <button onClick={() => setTab('Roles')}>更多角色：回归 / ID / 时间 / 预测</button>
      </div>
      {text === label && text && <p className="notice">正文和标签需要选择不同列。</p>}
      {confirmed && (
        <p className="notice">
          已选择正文「{text}」{label ? `、分类标签「${label}」` : '，尚未提供标签'}
          。进入“格式与处理”后将预填对应列。
        </p>
      )}
    </section>
  );
}
