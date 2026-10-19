import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { HelpDemo, demos } from './HelpDemo';
export function HelpLibrary() {
  const [query, setQuery] = useState('');
  return (
    <details className="help-library glass">
      <summary>
        <BookOpen size={17} /> 操作图解 · 查看每一步如何改变数据
      </summary>
      <div className="help-library-body">
        <p>
          绿色表示处理前的数据，红色表示关联表或处理规则，蓝色表示结果。悬停、聚焦或点击问号查看动画；所有示例都不会修改你的数据。
        </p>
        <input
          aria-label="搜索操作图解"
          placeholder="搜索：去重、类别、fastText、划分…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="help-library-grid">
          {Object.entries(demos)
            .filter(([, d]) => d.join(' ').toLowerCase().includes(query.toLowerCase()))
            .map(([key, d]) => (
              <div key={key}>
                <span>{d[0]}</span>
                <HelpDemo kind={key} />
              </div>
            ))}
        </div>
      </div>
    </details>
  );
}
