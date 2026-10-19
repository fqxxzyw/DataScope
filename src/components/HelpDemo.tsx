import { useId, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { prepDemos, profileDemos, extraDemos } from './helpCatalog';
import { CircleHelp, ArrowDown, X } from 'lucide-react';
export const demos: Record<string, [string, string, string, string, string]> = {
  ...prepDemos,
  ...extraDemos,
  ...Object.fromEntries(Object.entries(profileDemos).map(([k, v]) => ['profile-' + k, v])),
  import: [
    '先确认原数据',
    '原文件：新闻标题 ⇥ 3',
    '无表头：补充 Text / Number',
    '预览两列 → 确认后分析',
    '列数不对时选择 Tab 分隔；首行是样本时选“没有标题”。系统补充名称不写回原文件。',
  ],
  append: [
    '追加样本',
    '表 A：正文 / 编号 · 2 行',
    '表 B：正文 / 编号 · 2 行',
    '相同列名 → 4 行样本',
    '只适用于结构一致的样本。不要把 class 或 stopwords 追加进去，也不要无意混合训练集与测试集。',
  ],
  rows: [
    '按行一一对应',
    '表 A 第 1 行：这部电影很好',
    '表 B 第 1 行：positive',
    '这部电影很好 | positive',
    '两文件必须是同一批样本、相同行数、相同顺序。类别清单 class.txt 不适用此方式。',
  ],
  key: [
    '按编号查字典',
    '表 A：新闻标题 | 编号 3',
    '表 B：编号 3 | education',
    '新闻标题 | 3 | education',
    '两表都已有编号列才选此方式。右表编号必须唯一；匹配不到时新增字段为空。',
  ],
  classes: [
    'class + train → fastText',
    'train.txt：新闻标题 | 3',
    'class.txt：第 4 行 education（从 0 编号）',
    '__label__education 新闻标题',
    '0 → finance，1 → realty，2 → stocks，3 → education。先确认编号起点和顺序，再把 train 正文与 class Label 映射到 fastText。',
  ],
  mapping: [
    '选择字段用途',
    'train.txt · Text → 正文',
    'class.txt · Label → 分类标签',
    '确认后带入格式处理和划分',
    '字段前缀表示来源文件；数字可以是类别编号，并非一定是连续数值。角色设置不会改变原始值。',
  ],
  fasttext: [
    '生成 fastText',
    '正文：新闻标题',
    '标签：education',
    '__label__education 新闻标题',
    '选择 fastText，text 对应正文，labels 对应类别列。先校验预览，再另存文件。数字标签也可直接使用。',
  ],
  processing: [
    '格式转换与校验',
    '源字段：正文 / 标签 / 其他列',
    '映射到所选适配器要求的字段',
    '校验 → 输出预览 → 另存副本',
    '不同模型的必需字段不同。缺失字段先补齐；不确定时查看每个映射下拉菜单的来源。',
  ],
  prepare: [
    '整理工作副本',
    '原数据：空值 / 重复 / 多余空格',
    '按顺序选择操作与目标列',
    '预览变化 → 确认应用',
    '先查看影响行数和前后变化，再应用；可恢复原始数据。步骤顺序会影响结果。',
  ],
  split: [
    '划分训练、验证、测试集',
    '完整样本集',
    '按比例 / 类别 / 时间 / 分组分配',
    '训练集 · 验证集 · 测试集',
    '分层尽量保持类别比例，分组避免同组泄漏，时间划分保留先后。如果已有 train/dev/test，通常无需重新划分。',
  ],
  chart: [
    '从字段到图表',
    'X：类别 / 时间 / 数值',
    'Y：数值或统计数量',
    '选择图形 → 查看字段关系',
    '所有列可选，但不是所有列都适合每种图。类别编号用于分类时，请在字段用途里确认标签。',
  ],
};
export function HelpDemo({
  kind,
  title,
  detail,
}: {
  kind: string;
  title?: string;
  detail?: string;
}) {
  const id = useId();
  const pinned = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const demo = demos[kind] || demos.prepare;
  const closeSoon = () => {
    if (pinned.current) return;
    timer.current = setTimeout(() => setOpen(false), 160);
  };
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    const r = button.current?.getBoundingClientRect();
    if (r)
      setPosition({
        left: Math.max(12, Math.min(r.left, window.innerWidth - 372)),
        top: Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 360)),
      });
    setOpen(true);
  };
  return (
    <span className="help-anchor" onMouseEnter={show} onMouseLeave={closeSoon}>
      <button
        ref={button}
        type="button"
        className="help-trigger"
        aria-label={`${title || demo[0]}：查看动画帮助`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onFocus={show}
        onBlur={closeSoon}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          pinned.current = true;
          show();
        }}
      >
        <CircleHelp size={16} />
      </button>
      {open &&
        createPortal(
          <aside
            id={id}
            role="dialog"
            aria-label={title || demo[0]}
            className="help-demo"
            style={{ ...position, maxHeight: `calc(100vh - ${position.top + 12}px)` }}
            onMouseEnter={() => {
              if (timer.current) clearTimeout(timer.current);
            }}
            onMouseLeave={closeSoon}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                pinned.current = false;
                setOpen(false);
              }
            }}
          >
            <div className="section-heading">
              <strong>{title || demo[0]}</strong>
              <button
                type="button"
                aria-label="关闭动画帮助"
                onClick={() => {
                  pinned.current = false;
                  setOpen(false);
                }}
              >
                <X size={15} />
              </button>
            </div>
            <div className="demo-table demo-a">
              <small>输入 A</small>
              {kind === 'classes' ? (
                <table className="demo-mini">
                  <thead>
                    <tr>
                      <th>train.txt · Text</th>
                      <th>编号</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>新闻标题</td>
                      <td className="demo-match">3</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                demo[1]
              )}
            </div>
            <div className="demo-table demo-b">
              <small>操作 / 输入 B</small>
              {kind === 'classes' ? (
                <table className="demo-mini">
                  <thead>
                    <tr>
                      <th>从 0 编号</th>
                      <th>class.txt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['finance', 'realty', 'stocks', 'education'].map((value, i) => (
                      <tr key={value} className={i === 3 ? 'demo-match' : ''}>
                        <td>{i}</td>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                demo[2]
              )}
            </div>
            <ArrowDown size={18} className="demo-arrow" />
            <div className="demo-result">{demo[3]}</div>
            <p>{detail || demo[4]}</p>
            <small>示意动画 · 不会执行操作或修改数据</small>
          </aside>,
          document.body,
        )}
    </span>
  );
}
