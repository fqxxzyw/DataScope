export interface TextDocument {
  text: string;
  label?: string;
}
export interface Settings {
  language: 'zh' | 'en';
  normalize: boolean;
  lowercase: boolean;
  punctuation: boolean;
  tokenize: boolean;
  stopWords: boolean;
  filter: boolean;
  minLength: number;
  n: 1 | 2 | 3;
  window: number;
  top: number;
  minFrequency: number;
  graphNodes: number;
  minEdge: number;
  similarityLimit: number;
}
export interface Stage {
  name: string;
  value: string | string[];
  enabled: boolean;
}
export interface Term {
  word: string;
  count: number;
  df: number;
}
export interface Edge {
  source: string;
  target: string;
  weight: number;
}
export type Vector = Record<string, number>;
export interface Analysis {
  documents: TextDocument[];
  stages: Stage[][];
  tokens: string[][];
  beforeStops: string[][];
  frequency: Term[];
  ngrams: [string, number][];
  vectors: Vector[];
  edges: Edge[];
  tokenCount: number;
  settings: Settings;
}
export interface Parsed {
  name: string;
  headers: string[];
  rows: string[][];
  generated: boolean;
}
export type WorkerRequest =
  | { type: 'parse'; text: string; name: string; header: boolean; whole: boolean }
  | { type: 'analyze'; documents: TextDocument[]; settings: Settings; stops: string[] }
  | { type: 'matrix'; indices: number[] };
export type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'parsed'; data: Parsed }
  | { type: 'result'; data: Analysis }
  | { type: 'matrix'; indices: number[]; values: [number, number, number][] }
  | { type: 'error'; message: string };
