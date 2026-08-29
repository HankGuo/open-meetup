const DB_NAME = 'open-meetup';
const DB_VERSION = 1;
const STORE_TEMPLATES = 'templates';
const MAX_TEMPLATES = 12;
const MAX_TOTAL_BYTES = 160 * 1024 * 1024;

export interface StoredTemplate {
  id: string;
  name: string;
  pageCount: number;
  assetCount: number;
  sizeBytes: number;
  savedAt: number;
  zip: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        const store = db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function listTemplates(): Promise<StoredTemplate[]> {
  try {
    const db = await openDb();
    try {
      const store = db.transaction(STORE_TEMPLATES, 'readonly').objectStore(STORE_TEMPLATES);
      const all = await requestToPromise(store.getAll() as IDBRequest<StoredTemplate[]>);
      return all.sort((a, b) => b.savedAt - a.savedAt);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function saveTemplate(input: {
  name: string;
  pageCount: number;
  assetCount: number;
  zip: Blob;
}): Promise<StoredTemplate | null> {
  try {
    const db = await openDb();
    try {
      const record: StoredTemplate = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: input.name,
        pageCount: input.pageCount,
        assetCount: input.assetCount,
        sizeBytes: input.zip.size,
        savedAt: Date.now(),
        zip: input.zip,
      };

      const tx = db.transaction(STORE_TEMPLATES, 'readwrite');
      const store = tx.objectStore(STORE_TEMPLATES);
      const existing = await requestToPromise(store.getAll() as IDBRequest<StoredTemplate[]>);
      const keep = existing.filter((item) => item.id !== record.id).sort((a, b) => b.savedAt - a.savedAt);

      // 容量保护：超过条数或总大小时按最旧优先淘汰
      let totalBytes = record.sizeBytes;
      const survivors: StoredTemplate[] = [];
      for (const item of keep) {
        if (survivors.length >= MAX_TEMPLATES - 1) {
          break;
        }
        if (totalBytes + item.sizeBytes > MAX_TOTAL_BYTES) {
          break;
        }
        survivors.push(item);
        totalBytes += item.sizeBytes;
      }
      const removed = keep.filter((item) => !survivors.includes(item));
      for (const item of removed) {
        store.delete(item.id);
      }
      await requestToPromise(store.put(record) as IDBRequest<IDBValidKey>);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      });
      return record;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_TEMPLATES, 'readwrite');
      tx.objectStore(STORE_TEMPLATES).delete(id);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {}
}

export function downloadStoredTemplate(template: StoredTemplate): void {
  const objectUrl = URL.createObjectURL(template.zip);
  const link = document.createElement('a');
  const timestamp = new Date(template.savedAt).toISOString().replace(/[:.]/g, '-');
  link.href = objectUrl;
  link.download = `open-meetup-${template.name || 'layout'}-${timestamp}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
