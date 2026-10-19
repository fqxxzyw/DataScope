import type { PrepStep, PrepResult } from './prepare';
import type { ExploreConfig, ExploreResult, EvaluateResult } from './explore';
import type { SplitConfig, SplitResult } from './split';
import type { ProcessingConfig, ProcessingResult } from './processing';
export type ColumnType = 'Numeric' | 'Categorical' | 'Text' | 'Boolean' | 'Date' | 'ID' | 'Unknown';
export interface Settings {
  shortText: number;
  longPercentile: number;
  categoryRatio: number;
  idRatio: number;
  imbalance: number;
  numericRatio: number;
  maxCategories: number;
  maxFileMB: number;
  maxCells: number;
  correlationColumns: number;
}
export const defaults: Settings = {
  shortText: 2,
  longPercentile: 99,
  categoryRatio: 0.05,
  idRatio: 0.95,
  imbalance: 5,
  numericRatio: 0.9,
  maxCategories: 20,
  maxFileMB: 50,
  maxCells: 2000000,
  correlationColumns: 20,
};
export interface Dataset {
  name: string;
  size: number;
  headers: string[];
  rows: string[][];
  warnings: string[];
}
export interface Stats {
  count: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  p95: number | null;
  p99: number | null;
  histogram: { label: string; count: number }[];
}
export interface Column {
  name: string;
  type: ColumnType;
  missing: number;
  nonNull: number;
  unique: number;
  duplicateValues: number;
  tokens: [string, number][];
  counts: [string, number][];
  stats?: Stats;
  length?: Stats;
  outliers: number[];
  short: number[];
  long: number[];
  invalid: number[];
  missingRows: number[];
  tokenRows: number[];
}
export type IssueType =
  | 'missing_value'
  | 'duplicate'
  | 'class_imbalance'
  | 'short_text'
  | 'long_text'
  | 'high_cardinality'
  | 'constant'
  | 'potential_id'
  | 'numeric_outlier'
  | 'missing_token'
  | 'mixed_type';
export interface DataIssue {
  id: string;
  type: IssueType;
  severity: 'info' | 'warning' | 'error';
  column?: string;
  affectedRows: number;
  ratio: number;
  title: string;
  description: string;
  suggestion: string;
  rows: number[];
}
export interface Report {
  name: string;
  size: number;
  createdAt: string;
  rowCount: number;
  columns: Column[];
  duplicates: number[][];
  duplicateCount: number;
  missing: number;
  issues: DataIssue[];
  score: number;
  penalties: { label: string; value: number }[];
  correlations: { x: string; y: string; r: number | null; n: number }[];
  target?: string;
  settings: Settings;
  warnings: string[];
  wordSummary: Record<string, [string, number][]>;
}
export type WorkerRequest =
  | { type: 'prepare'; id: number; steps: PrepStep[]; apply: boolean }
  | { type: 'restore'; id: number; original: boolean }
  | { type: 'saveData'; id: number; format: 'csv' | 'jsonl'; columns: string[] }
  | { type: 'explore'; id: number; config: ExploreConfig }
  | {
      type: 'evaluate';
      id: number;
      truth: string;
      prediction: string;
      task: 'classification' | 'regression';
    }
  | { type: 'split'; id: number; config: SplitConfig }
  | { type: 'convert'; id: number; config: ProcessingConfig }
  | {
      type: 'load';
      file: File;
      delimiter: string;
      header: boolean;
      settings: Settings;
      format?: string;
    }
  | {
      type: 'reanalyze';
      settings: Settings;
      overrides: Record<string, ColumnType>;
      target?: string;
    }
  | {
      type: 'rows';
      id: number;
      search: string;
      column: string;
      mode: string;
      sort: number;
      desc: boolean;
      offset: number;
      issueRows?: number[];
    }
  | {
      type: 'words';
      id: number;
      column: string;
      target?: string;
      label?: string;
      mode: 'word' | 'character';
      hideStop: boolean;
      top: number;
    }
  | { type: 'export'; id: number; rows: number[]; issue: string };
export type WorkerResponse =
  | {
      type: 'prepared';
      id: number;
      audit: PrepResult['audit'];
      warnings: string[];
      headers: string[];
      preview: string[][];
      rows: number;
      report?: Report;
    }
  | { type: 'savedData'; id: number; content: string }
  | { type: 'explored'; id: number; result: ExploreResult }
  | { type: 'evaluated'; id: number; result: EvaluateResult }
  | { type: 'splitResult'; id: number; result: SplitResult }
  | { type: 'converted'; id: number; result: ProcessingResult }
  | { type: 'progress'; value: number; message: string }
  | { type: 'report'; report: Report }
  | { type: 'error'; message: string }
  | { type: 'rows'; id: number; rows: { index: number; values: string[] }[]; total: number }
  | { type: 'words'; id: number; words: [string, number][]; fallback: boolean }
  | { type: 'export'; id: number; csv: string };
