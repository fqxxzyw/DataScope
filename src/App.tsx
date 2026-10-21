import { Annotation } from './annotation/Annotation';
import { lazy, Suspense } from 'react';
const ContextMap = lazy(() =>
  import('./contextmap/ContextMap').then((m) => ({ default: m.ContextMap })),
);
import { droppedFiles, supportedDataFile } from './folder';
import { HelpDemo } from './components/HelpDemo';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Command,
  Database,
  Download,
  FileText,
  FolderOpen,
  GitCompareArrows,
  History,
  Layers,
  LayoutDashboard,
  Menu,
  Moon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { useStore, type Tab } from './store';
import type { Report } from './engine/types';
import { readHistory, clearHistory } from './storage';
import { demoFile } from './demo';
import { htmlReport } from './engine/export';
import { Dashboard } from './components/Dashboard';
import { RolesPanel } from './components/Explorer';
import { SettingsPage, download } from './components/AnalysisPages';

import { Preparation } from './components/Preparation';
import { SplitPage } from './components/SplitPage';
import { Processing } from './components/Processing';
import { ImportStudio } from './components/ImportStudio';
const nav: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'Overview', label: '分析工作台', icon: LayoutDashboard },
  { id: 'Annotation', label: '数据标注', icon: FileText },
  { id: 'ContextMap', label: '文本语义探索', icon: GitCompareArrows },
  { id: 'Prepare', label: '数据整理', icon: Settings2 },
  { id: 'Roles', label: '字段与训练配置', icon: Layers },
  { id: 'Processing', label: '格式与处理', icon: Sparkles },
  { id: 'Split', label: '数据集划分', icon: GitCompareArrows },
];
const workbenchTabs: Tab[] = [
  'Overview',
  'Data',
  'Columns',
  'Missing',
  'Duplicates',
  'Distribution',
  'Text',
  'Correlation',
  'Issues',
  'Next Steps',
];
function magnetic(e: PointerEvent<HTMLButtonElement>) {
  if (e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.08}px,${(e.clientY - r.top - r.height / 2) * 0.12}px)`;
}
export default function App() {
  const s = useStore(),
    fileRef = useRef<HTMLInputElement>(null),
    folderRef = useRef<HTMLInputElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null);
  const [drag, setDrag] = useState(false),
    [history, setHistory] = useState<Report[]>([]),
    [palette, setPalette] = useState(false),
    [command, setCommand] = useState(''),
    [showExport, setShowExport] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
  }, [s.theme]);
  useEffect(() => {
    readHistory()
      .then(setHistory)
      .catch(() => {});
  }, [s.report]);
  useEffect(() => {
    const open = palette || showExport;
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [palette, showExport]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if ((e.ctrlKey || e.metaKey) && ['o', 'e', 'k'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'o') fileRef.current?.click();
        if (e.key.toLowerCase() === 'e' && s.report) setShowExport(true);
        if (e.key.toLowerCase() === 'k') setPalette((v) => !v);
      }
      if (e.key === 'Escape') {
        setPalette(false);
        setShowExport(false);
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        s.setTab('Columns');
        setTimeout(() => document.getElementById('column-search')?.focus(), 50);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [s]);
  const openFiles = (files: File[]) => {
    if (!files.length) return;
    if (files.some((file) => !/\.(csv|tsv|txt|jsonl|json|conll|bio)$/i.test(file.name))) {
      s.setError('支持 CSV、TSV、TXT、JSON、JSONL、CoNLL 和 BIO。');
      return;
    }
    if (files.length > 40 || files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) {
      s.setError('一次最多导入 40 个文件、合计 100 MB。');
      return;
    }
    s.setImportFiles(files);
  };
  const r = s.report;
  const active = nav.find((n) => n.id === (workbenchTabs.includes(s.tab) ? 'Overview' : s.tab));
  return (
    <div className={`app ${s.sidebar ? '' : 'collapsed'}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className="sidebar glass">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            s.setTab('Overview');
          }}
        >
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            DataScope<small>DATA CLARITY, LOCALLY.</small>
          </span>
        </a>
        <button className="open-dataset" onClick={() => fileRef.current?.click()}>
          <FolderOpen size={18} />
          <span>打开数据集</span>
          <kbd>⌘ O</kbd>
        </button>
        <div className="folder-open-row">
          <button className="open-folder" onClick={() => folderRef.current?.click()}>
            <FolderOpen size={17} />
            打开数据文件夹
          </button>
          <HelpDemo kind="folder" />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              title={label}
              className={
                s.tab === id || (id === 'Overview' && workbenchTabs.includes(s.tab)) ? 'active' : ''
              }
              onClick={() => s.setTab(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'Issues' && r && <small>{r.issues.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={s.tab === 'Settings' ? 'active' : ''}
            onClick={() => s.setTab('Settings')}
          >
            <Settings2 size={18} />
            <span>分析设置</span>
          </button>
          <div className="privacy">
            <ShieldCheck size={19} />
            <div>
              <b>你的数据，只在本地。</b>
              <small>无上传 · 无追踪 · 无 AI API</small>
            </div>
          </div>
          <div className="version">
            DATASCOPE <span>V1.4</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button" aria-label="折叠导航" onClick={s.toggleSidebar}>
              <Menu size={19} />
            </button>
            <span>工作台</span>
            <ChevronRight size={14} />
            <b>{active?.label || '分析设置'}</b>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="打开命令面板"
              onClick={() => setPalette(true)}
            >
              <Command size={18} />
            </button>
            <button className="icon-button" aria-label="切换主题" onClick={s.toggleTheme}>
              {s.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              disabled={!r || s.busy}
              className="export-button"
              onClick={() => setShowExport(true)}
            >
              <Download size={16} />
              <span>导出报告</span>
            </button>
          </div>
        </header>
        <main>
          <input
            type="file"
            multiple
            ref={fileRef}
            hidden
            accept=".csv,.tsv,.txt,.json,.jsonl,.conll,.bio"
            onChange={(e) => {
              openFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <input
            type="file"
            hidden
            multiple
            aria-label="选择数据文件夹"
            ref={(el) => {
              folderRef.current = el;
              el?.setAttribute('webkitdirectory', '');
            }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []).filter(supportedDataFile);
              if (!files.length) s.setError('文件夹中没有受支持的数据文件。');
              else openFiles(files);
              e.target.value = '';
            }}
          />
          {r && !s.importFiles && (
            <div className="dataset-strip">
              <FileText size={16} />
              <b>{r.name}</b>
              <span>{(r.size / 1024).toFixed(1)} KB</span>
              <span>UTF-8</span>
              <span className="local-dot" /> <span>{s.hasRaw ? '设备本地' : '历史摘要'}</span>
            </div>
          )}
          {s.error && (
            <div className="alert" role="alert">
              <TriangleAlert size={18} />
              <span>{s.error}</span>
              <button aria-label="关闭错误" onClick={() => s.setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {s.notice && (
            <p className="notice" role="status">
              {s.notice}
            </p>
          )}
          {!s.importFiles &&
            r?.warnings.map((w) => (
              <p className="notice" key={w}>
                {w}
              </p>
            ))}
          {s.importFiles ? (
            <ImportStudio key={s.importFiles.map((f) => f.name).join('|')} />
          ) : s.busy ? (
            <section className="glass loading" aria-live="polite">
              <div className="loading-orbit">
                <Activity size={36} />
              </div>
              <h1>{s.status}</h1>
              <progress value={s.progress} max="100" />
              <p>{s.progress}% · 按阶段估计进度，不虚构已读取行数</p>
              <button onClick={s.cancel}>取消分析</button>
            </section>
          ) : s.tab === 'Annotation' ? (
            <Annotation />
          ) : s.tab === 'ContextMap' ? (
            <Suspense fallback={<p>正在打开文本语义探索…</p>}>
              <ContextMap />
            </Suspense>
          ) : !r ? (
            <>
              <div className="welcome">
                <div className="status-pill">
                  <span /> PRIVATE BY DESIGN
                </div>
                <h1>
                  从原始数据，
                  <br />
                  <em>到可用的训练样本。</em>
                </h1>
                <p>
                  导入正文、标签或表格，先看清每一行、每一列，
                  <br />
                  再选择你需要的整理、可视化与导出。
                </p>
              </div>
              <section
                className={`glass dropzone ${drag ? 'dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDrag(false);
                  const fallback = Array.from(e.dataTransfer.files);
                  try {
                    const files = await droppedFiles(e.dataTransfer.items);
                    openFiles(files.length ? files : fallback);
                  } catch (err) {
                    s.setError(String(err));
                  }
                }}
              >
                <button
                  className="drop-target magnetic"
                  onPointerMove={magnetic}
                  onPointerLeave={(e) => (e.currentTarget.style.transform = '')}
                  onClick={() => fileRef.current?.click()}
                >
                  <span className="upload-symbol">
                    <Upload size={28} />
                  </span>
                  <h2>将数据集拖到这里</h2>
                  <p>或点击选择文件</p>
                  <span className="file-types">CSV · TSV · TXT · JSONL · JSON · CoNLL</span>
                </button>
                <p className="import-help">
                  可一次选择多个文件。下一步先预览原数据，再选择表头、分隔符和标签关联方式。
                </p>
                <p className="footnote">
                  UTF-8 · 最大 50 MB / 200 万单元格 · 全部计算在你的浏览器内完成
                </p>
              </section>
              <div className="demo-buttons">
                <span>先探索一下？</span>
                <button onClick={() => s.load(demoFile(), '\t', true, 'table')}>
                  <Sparkles size={16} />
                  体验酒店评论数据 <ArrowUpRight size={15} />
                </button>
                <button onClick={() => s.load(demoFile(true), ',', true, 'table')}>
                  数值数据示例 <ArrowUpRight size={15} />
                </button>
              </div>
              {history.length > 0 && (
                <section className="recent">
                  <div className="section-heading">
                    <h2>
                      <History size={17} /> 最近分析
                    </h2>
                    <button
                      onClick={() =>
                        clearHistory()
                          .then(() => setHistory([]))
                          .catch(() => s.setError('无法清除历史记录。'))
                      }
                    >
                      清除历史
                    </button>
                  </div>
                  {history.map((h) => (
                    <button
                      key={h.createdAt}
                      className="glass history-row"
                      onClick={() => s.openHistory(h)}
                    >
                      <FileText size={20} />
                      <b>{h.name}</b>
                      <span>
                        {h.rowCount.toLocaleString()} 行 · {h.columns.length} 字段
                      </span>
                      <small>{new Date(h.createdAt).toLocaleString()}</small>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </section>
              )}
            </>
          ) : (
            <div
              className="page-content"
              key={`${workbenchTabs.includes(s.tab) ? 'workspace' : s.tab}-${s.tab === 'Prepare' ? 'editor' : r.createdAt}`}
            >
              {workbenchTabs.includes(s.tab) && <Dashboard />}
              {s.tab === 'Roles' && <RolesPanel />}
              {s.tab === 'Prepare' && <Preparation />}
              {s.tab === 'Settings' && <SettingsPage />}
              {s.tab === 'Processing' && <Processing />}
              {s.tab === 'Split' && <SplitPage />}
            </div>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} /> Your dataset stays on this device.
            </span>
            <span>BUILT FOR THOUGHTFUL EXPLORATION</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        className="glass modal"
        onCancel={() => {
          setPalette(false);
          setShowExport(false);
        }}
      >
        <div className="section-heading">
          <h2>
            {palette ? '前往…' : '导出分析成果'} {!palette && <HelpDemo kind="export" />}
          </h2>
          <button
            aria-label="关闭对话框"
            onClick={() => {
              setPalette(false);
              setShowExport(false);
            }}
          >
            <X size={20} />
          </button>
        </div>
        {palette ? (
          <>
            <input
              autoFocus
              aria-label="搜索命令"
              placeholder="搜索页面或操作"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
            {[
              ...nav.map((n) => ({ label: n.label, action: () => s.setTab(n.id) })),
              { label: '切换主题', action: s.toggleTheme },
              { label: '打开数据集', action: () => fileRef.current?.click() },
              { label: '导出报告', action: () => setShowExport(true) },
            ]
              .filter((x) => x.label.includes(command))
              .map((x) => (
                <button
                  className="command-item"
                  key={x.label}
                  onClick={() => {
                    setPalette(false);
                    x.action();
                  }}
                >
                  {x.label}
                  <ChevronRight size={16} />
                </button>
              ))}
          </>
        ) : (
          r && (
            <>
              <p>报告包含字段统计及部分实际值、词频。分享前请检查敏感信息。</p>
              <button
                className="export-option"
                onClick={() =>
                  download(htmlReport(r), `${r.name}-report.html`, 'text/html;charset=utf-8')
                }
              >
                <FileText />
                <span>
                  <b>HTML 完整报告</b>
                  <small>自包含 · 无需联网 · 双击即可阅读</small>
                </span>
                <Download size={18} />
              </button>
              <button
                className="export-option"
                onClick={() =>
                  download(
                    JSON.stringify(r, null, 2),
                    `${r.name}-analysis.json`,
                    'application/json',
                  )
                }
              >
                <Database />
                <span>
                  <b>JSON 分析结果</b>
                  <small>统计、问题、参数、行索引</small>
                </span>
                <Download size={18} />
              </button>
            </>
          )
        )}
      </dialog>
    </div>
  );
}
