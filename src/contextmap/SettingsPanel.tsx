import { useState } from 'react';
import { useContextSettings } from './store';
import { stopDefaults } from './defaults';
import { Help } from './Help';
export function SettingsPanel() {
  const { settings: s, setSettings, stops, setStops, reset } = useContextSettings(),
    [word, setWord] = useState('');
  const list = stops[s.language];
  return (
    <details className="cm-settings">
      <summary>Analysis Settings · 分析设置（修改后自动重算）</summary>
      <div className="cm-controls">
        <label>
          Language{' '}
          <select
            value={s.language}
            onChange={(e) =>
              setSettings({
                language: e.target.value as 'zh' | 'en',
                lowercase: e.target.value === 'en',
              })
            }
          >
            <option value="zh">Chinese</option>
            <option value="en">English</option>
          </select>
        </label>
        {(
          ['normalize', 'lowercase', 'punctuation', 'tokenize', 'stopWords', 'filter'] as const
        ).map((key, i) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={s[key]}
              onChange={(e) => setSettings({ [key]: e.target.checked })}
            />
            {
              [
                'Normalize',
                'Lowercase',
                'Remove Punctuation',
                'Tokenize',
                'Remove Stop Words',
                'Filter Tokens',
              ][i]
            }
            <Help title={key} steps={['原文', '当前步骤', 'Tokens']}>
              {
                [
                  '统一全角、半角和空白。',
                  '英文统一为小写。',
                  '标点替换为空格；关闭后可在 Pipeline 观察保留的标点。分词器仍只提取词语。',
                  '关闭后仅按空白拆分，不做词典分词。',
                  '精确匹配停用词列表，不做子串删除。',
                  '过滤短于下方最短长度的词。',
                ][i]
              }
            </Help>
          </label>
        ))}
        {(
          [
            { key: 'minLength', label: '最短 Token 长度', max: 20 },
            { key: 'minFrequency', label: 'Minimum Frequency', max: 10000 },
            { key: 'graphNodes', label: 'Maximum Graph Nodes', max: 100 },
            { key: 'minEdge', label: 'Minimum Edge Weight', max: 10000 },
            { key: 'similarityLimit', label: 'Similarity Limit', max: 100 },
          ] as const
        ).map(({ key, label, max }) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min="1"
              max={max}
              value={s[key]}
              onChange={(e) => setSettings({ [key]: Number(e.target.value) })}
            />
            <Help title={label} steps={['设置阈值', '重新统计', '更新视图']}>
              范围 1–{max}；图表与结果使用同一份设置。词频下限只筛选展示与关系词表，不改变 TF-IDF
              的语料。
            </Help>
          </label>
        ))}
        <button onClick={reset}>Reset Defaults</button>
      </div>
      <div className="cm-stop">
        <h3>
          Stop Words{' '}
          <Help title="停用词" steps={['我 喜欢 酒店', '删除：我', '喜欢 酒店']}>
            按完整 Token 删除。设置只保存在此设备，不保存原始语料。
          </Help>
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (word.trim()) {
              setStops([...list, word.trim()]);
              setWord('');
            }
          }}
        >
          <input
            aria-label="Add Stop Word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="添加停用词"
          />
          <button>Add Stop Word</button>
          <button type="button" onClick={() => setStops(stopDefaults[s.language])}>
            Reset Stop Words
          </button>
        </form>
        <div className="cm-chips">
          {list.map((w) => (
            <button
              key={w}
              aria-label={`移除停用词 ${w}`}
              onClick={() => setStops(list.filter((v) => v !== w))}
            >
              {w} ×
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
