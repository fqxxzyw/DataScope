import { create } from 'zustand';
import {
  defaults,
  type Settings,
  type Dataset,
  type Report,
  type ColumnType,
  type WorkerRequest,
  type WorkerResponse,
} from './engine/types';
import { normalizeSettings } from './engine/analyze';
import { saveHistory } from './storage';
export type Tab =
  | 'Overview'
  | 'Data'
  | 'Columns'
  | 'Missing'
  | 'Duplicates'
  | 'Distribution'
  | 'Text'
  | 'Correlation'
  | 'Issues'
  | 'Next Steps'
  | 'Settings'
  | 'Processing'
  | 'Split'
  | 'Roles'
  | 'Prepare';
function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem('datascope-preferences') || '{}');
  } catch {
    return {};
  }
}
const pref = loadPreferences();
let worker: Worker | undefined,
  serial = 0;
const waiting = new Map<
  number,
  { resolve: (m: WorkerResponse) => void; reject: (e: Error) => void }
>();
export function request(
  message:
    | Omit<Extract<WorkerRequest, { type: 'prepare' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'restore' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'saveData' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'explore' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'evaluate' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'split' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'convert' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'rows' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'words' }>, 'id'>
    | Omit<Extract<WorkerRequest, { type: 'export' }>, 'id'>,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('需要重新打开原始文件。'));
      return;
    }
    const id = ++serial;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...message, id });
  });
}
function stopWorker() {
  worker?.terminate();
  worker = undefined;
  for (const pending of waiting.values()) pending.reject(new Error('请求已取消'));
  waiting.clear();
}
export interface Roles {
  text?: string;
  truth: string;
  prediction: string;
  features: string[];
  id: string;
  time: string;
  task: 'classification' | 'regression';
}
interface State {
  importFiles: File[] | null;
  setImportFiles: (files: File[] | null) => void;
  sourceDataset: Dataset | null;
  roles: Roles;
  setRoles: (roles: Roles) => void;
  report: Report | null;
  tab: Tab;
  theme: 'light' | 'dark';
  settings: Settings;
  overrides: Record<string, ColumnType>;
  busy: boolean;
  progress: number;
  status: string;
  error: string;
  notice: string;
  hasRaw: boolean;
  reviewed: string[];
  sidebar: boolean;
  setTab: (tab: Tab) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setError: (error: string) => void;
  load: (
    file: File | Dataset,
    delimiter: string,
    header: boolean | 'auto',
    format?: string,
  ) => void;
  cancel: () => void;
  recompute: (settings: Settings, overrides?: Record<string, ColumnType>, target?: string) => void;
  openHistory: (report: Report) => void;
  review: (id: string) => void;
}
function persist() {
  const s = useStore.getState();
  try {
    localStorage.setItem(
      'datascope-preferences',
      JSON.stringify({
        theme: s.theme,
        analysisSettings: s.settings,
        sidebarState: s.sidebar,
        lastSelectedTab: s.tab,
      }),
    );
  } catch {
    useStore.setState({ notice: '浏览器阻止偏好保存；当前分析仍可使用。' });
  }
}
const tabs: Tab[] = [
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
  'Settings',
  'Processing',
  'Split',
  'Roles',
  'Prepare',
];
export const useStore = create<State>((set, get) => ({
  importFiles: null,
  setImportFiles: (importFiles) => set({ importFiles, error: '', notice: '' }),
  sourceDataset: null,
  roles: { truth: '', prediction: '', features: [], id: '', time: '', task: 'classification' },
  setRoles: (roles) => set({ roles }),
  report: null,
  tab: tabs.includes(pref.lastSelectedTab) ? pref.lastSelectedTab : 'Overview',
  theme: pref.theme === 'dark' ? 'dark' : 'light',
  settings: normalizeSettings(pref.analysisSettings || defaults),
  overrides: {},
  busy: false,
  progress: 0,
  status: '',
  error: '',
  notice: '',
  hasRaw: false,
  reviewed: [],
  sidebar: pref.sidebarState !== false,
  setTab: (tab) => {
    set({ tab });
    persist();
  },
  toggleTheme: () => {
    set({ theme: get().theme === 'light' ? 'dark' : 'light' });
    persist();
  },
  toggleSidebar: () => {
    set({ sidebar: !get().sidebar });
    persist();
  },
  setError: (error) => set({ error }),
  load: (file, delimiter, header, format) => {
    stopWorker();
    set({
      busy: true,
      importFiles: null,
      sourceDataset: file instanceof File ? null : file,
      progress: 0,
      status: '准备读取',
      error: '',
      notice: '',
      report: null,
      hasRaw: false,
      roles: { truth: '', prediction: '', features: [], id: '', time: '', task: 'classification' },
      overrides: {},
      reviewed: [],
      tab: 'Overview',
    });
    try {
      worker = new Worker(new URL('./engine/analysis.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onerror = () => {
        stopWorker();
        set({
          busy: false,
          hasRaw: false,
          error: '分析进程意外中止，可能内存不足。请缩小数据集后重试。',
        });
      };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if ('id' in m) {
          const p = waiting.get(m.id);
          waiting.delete(m.id);
          p?.resolve(m);
          return;
        }
        if (m.type === 'progress') set({ progress: m.value, status: m.message });
        if (m.type === 'error') {
          set({ busy: false, error: m.message });
          for (const p of waiting.values()) p.reject(new Error(m.message));
          waiting.clear();
        }
        if (m.type === 'report') {
          set({ report: m.report, busy: false, progress: 100, hasRaw: true, reviewed: [] });
          saveHistory(m.report).catch(() =>
            set({ notice: '分析完成，但浏览器无法保存历史。你仍可导出报告。' }),
          );
        }
      };
      worker.postMessage({
        type: 'load',
        ...(file instanceof File ? { file } : { dataset: file }),
        delimiter,
        header,
        format,
        settings: get().settings,
      } satisfies WorkerRequest);
    } catch {
      set({ busy: false, error: '无法启动 Web Worker，请使用现代浏览器通过本地服务器打开应用。' });
    }
  },
  cancel: () => {
    stopWorker();
    set({
      busy: false,
      hasRaw: false,
      status: '已取消',
      notice: '分析已取消；重新打开文件可继续。',
    });
  },
  recompute: (settings, overrides = get().overrides, target = get().report?.target) => {
    if (!worker) {
      set({ error: '历史记录为只读摘要。请重新导入原文件后更改分析配置。' });
      return;
    }
    const valid = normalizeSettings(settings);
    set({ settings: valid, overrides, busy: true, progress: 0, error: '' });
    persist();
    worker.postMessage({
      type: 'reanalyze',
      settings: valid,
      overrides,
      target,
    } satisfies WorkerRequest);
  },
  openHistory: (report) => {
    stopWorker();
    set({
      sourceDataset: null,
      importFiles: null,
      roles: {
        text: '',
        truth: '',
        prediction: '',
        features: [],
        id: '',
        time: '',
        task: 'classification',
      },
      report,
      settings: report.settings,
      hasRaw: false,
      busy: false,
      tab: 'Overview',
      error: '',
      reviewed: [],
      notice: '只读历史摘要：查看原始行、重新分词或调整分析时，请重新打开原文件。',
    });
  },
  review: (id) =>
    set({
      reviewed: get().reviewed.includes(id)
        ? get().reviewed.filter((v) => v !== id)
        : [...get().reviewed, id],
    }),
}));
