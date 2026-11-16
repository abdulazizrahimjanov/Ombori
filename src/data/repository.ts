import { DatabaseSnapshot } from '../types/models';
import { createSeedDatabase } from './seed';

const DB_NAME = 'shu_brend_ombor_db';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'primary';
const LS_FALLBACK_KEY = 'shu_brend_ombor_snapshot_v1';

export interface IRepository {
  load(): Promise<DatabaseSnapshot>;
  loadCached(): Promise<DatabaseSnapshot | null>;
  save(snapshot: DatabaseSnapshot): Promise<void>;
  clearCache(): Promise<void>;
  resetToDemo(): Promise<DatabaseSnapshot>;
  exportJson(snapshot: DatabaseSnapshot): string;
  importJson(rawJson: string): Promise<DatabaseSnapshot>;
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class LocalIndexedDBRepository implements IRepository {
  async loadCached(): Promise<DatabaseSnapshot | null> {
    const db = await openIndexedDb();
    if (db) {
      try {
        const data = await new Promise<DatabaseSnapshot | undefined>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const getReq = store.get(SNAPSHOT_KEY);
          getReq.onsuccess = () => resolve(getReq.result as DatabaseSnapshot | undefined);
          getReq.onerror = () => resolve(undefined);
        });
        if (data && Array.isArray(data.stores)) {
          return data;
        }
      } catch {
        // fall through
      }
    }

    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DatabaseSnapshot;
        if (parsed && Array.isArray(parsed.stores)) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage
    }
    return null;
  }

  async load(): Promise<DatabaseSnapshot> {
    const cached = await this.loadCached();
    if (cached && Array.isArray(cached.products)) {
      return cached;
    }
    const seeded = createSeedDatabase();
    await this.save(seeded);
    return seeded;
  }

  async save(snapshot: DatabaseSnapshot): Promise<void> {
    try {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore quota issues
    }

    const db = await openIndexedDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(snapshot, SNAPSHOT_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  }

  async clearCache(): Promise<void> {
    try {
      localStorage.removeItem(LS_FALLBACK_KEY);
    } catch {
      // ignore
    }
    const db = await openIndexedDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  }

  async resetToDemo(): Promise<DatabaseSnapshot> {
    const fresh = createSeedDatabase();
    await this.save(fresh);
    return fresh;
  }

  exportJson(snapshot: DatabaseSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  async importJson(rawJson: string): Promise<DatabaseSnapshot> {
    const parsed = JSON.parse(rawJson) as DatabaseSnapshot;
    if (!parsed || !Array.isArray(parsed.stores) || !Array.isArray(parsed.products)) {
      throw new Error("Zaxira fayli tuzilmasi noto'g'ri");
    }
    await this.save(parsed);
    return parsed;
  }
}

export const repository: IRepository = new LocalIndexedDBRepository();
