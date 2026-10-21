export type Status = 'unlabeled' | 'labeled' | 'skipped';
export interface Label {
  id: string;
  name: string;
  color: string;
  shortcut: string;
  description: string;
}
export interface SourceRow {
  data: Record<string, unknown>;
  source: string;
}
export interface Row extends SourceRow {
  id: string;
}
export interface Annotation {
  labels: string[];
  status: Status;
  updatedAt: string;
  predictedLabels?: string[];
  prediction?: { label: string; confidence: number };
}
export interface Filter {
  status: 'all' | Status;
  label: string;
  search: string;
}
export interface Project {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  mode: 'single';
  mainField: string;
  auxiliary: string[];
  idField: string;
  fields: string[];
  labels: Label[];
  currentId: string;
  filter: Filter;
  autoNext: boolean;
  revision: number;
  total: number;
  labeled: number;
  skipped: number;
}
export interface Change {
  id: string;
  before?: Annotation;
  after?: Annotation;
}
export interface History {
  id: string;
  projectId: string;
  at: string;
  action: string;
  changes: Change[];
  undone?: boolean;
}
export interface Session {
  id: string;
  projectId: string;
  start: string;
  end: string;
  count: number;
}
export interface Workspace {
  project: Project;
  rows: Row[];
  annotations: Record<string, Annotation>;
  history: History[];
  session: Session;
}
export interface Scan {
  rows: SourceRow[];
  fields: string[];
  files: number;
  warnings: string[];
}
export interface ScanRequest {
  files: File[];
  header: boolean | 'auto';
}
export type ScanMessage =
  | { type: 'progress'; count: number; total: number }
  | { type: 'result'; scan: Scan }
  | { type: 'error'; message: string };
export const limits = {
  files: 20000,
  bytes: 200 * 1024 * 1024,
  rows: 100000,
  page: 40,
  history: 200,
  preview: 800,
  undoChanges: 100000,
} as const;
