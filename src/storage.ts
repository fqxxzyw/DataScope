import type { Report } from './engine/types';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('datascope', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('reports', { keyPath: 'createdAt' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveHistory(report: Report) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite'),
      store = tx.objectStore('reports');
    store.put(report);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      keys.result
        .sort()
        .slice(0, -5)
        .forEach((k) => store.delete(k));
    };
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
export async function readHistory(): Promise<Report[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readonly'),
      req = tx.objectStore('reports').getAll();
    req.onsuccess = () =>
      resolve((req.result as Report[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
export async function clearHistory() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    tx.objectStore('reports').clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
