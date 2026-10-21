import { LIMITS } from './defaults';
import type { Analysis, Settings, Term, Edge } from './types';
export interface HistoryEntry {
  id: number;
  name: string;
  documents: number;
  tokens: number;
  uniqueTokens: number;
  settings: Settings;
  frequency: Term[];
  ngrams: [string, number][];
  edges: Edge[];
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('datascope-contextmap', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('history', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function readHistory(): Promise<HistoryEntry[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history');
    const q = tx.objectStore('history').getAll();
    tx.oncomplete = () => {
      db.close();
      resolve((q.result as HistoryEntry[]).sort((a, b) => b.id - a.id));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function saveHistory(name: string, a: Analysis) {
  const db = await database();
  // Only aggregate statistics: no documents, pipeline text, tokens per document or vectors.
  const entry: HistoryEntry = {
    id: Date.now(),
    name,
    documents: a.documents.length,
    tokens: a.tokenCount,
    uniqueTokens: a.frequency.length,
    settings: a.settings,
    frequency: a.frequency,
    ngrams: a.ngrams,
    edges: a.edges,
  };
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite'),
      store = tx.objectStore('history');
    store.put(entry);
    const q = store.getAllKeys();
    q.onsuccess = () =>
      q.result
        .sort((a, b) => Number(b) - Number(a))
        .slice(LIMITS.history)
        .forEach((k) => store.delete(k));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function clearHistory() {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    tx.objectStore('history').clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
