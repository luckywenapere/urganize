import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetIdbForTests, idbClear, idbDelete, idbGetAll, idbPut } from './idb';

/**
 * The vitest environment for this project is plain Node (see
 * vitest.config.ts), which has no IndexedDB global at all — unlike
 * `fetch`/`Request`/`Response`, which Node ships natively. Rather than add
 * a dependency (`fake-indexeddb`) purely to test four narrow operations on
 * one object store, this hand-rolls the minimal subset of the IndexedDB API
 * idb.ts actually calls — the same "stub exactly what's used" approach
 * lib/offline/sw-offline.test.ts already takes for the Cache API.
 */

type StoredRecord = { id: string; [key: string]: unknown };

function installFakeIndexedDb() {
  const store = new Map<string, StoredRecord>();

  class FakeRequest<T> {
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: T = undefined as T;
    error: Error | null = null;
    _resolve(value: T) {
      this.result = value;
      queueMicrotask(() => this.onsuccess && this.onsuccess());
    }
  }

  class FakeObjectStore {
    put(item: StoredRecord) {
      store.set(item.id, item);
      const request = new FakeRequest<void>();
      request._resolve(undefined);
      return request;
    }
    getAll() {
      const request = new FakeRequest<StoredRecord[]>();
      request._resolve(Array.from(store.values()));
      return request;
    }
    delete(id: string) {
      store.delete(id);
      const request = new FakeRequest<void>();
      request._resolve(undefined);
      return request;
    }
    clear() {
      store.clear();
      const request = new FakeRequest<void>();
      request._resolve(undefined);
      return request;
    }
  }

  class FakeTransaction {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    objectStore() {
      const os = new FakeObjectStore();
      queueMicrotask(() => this.oncomplete && this.oncomplete());
      return os;
    }
  }

  class FakeDatabase {
    objectStoreNames = { contains: () => store.size >= 0 || true };
    createObjectStore() {
      return new FakeObjectStore();
    }
    transaction() {
      return new FakeTransaction();
    }
  }

  const fakeIndexedDb = {
    open() {
      const request = new FakeRequest<FakeDatabase>();
      queueMicrotask(() => {
        request._resolve(new FakeDatabase());
      });
      return request;
    },
  };

  (globalThis as unknown as { indexedDB: unknown }).indexedDB = fakeIndexedDb;
  (globalThis as unknown as { window: unknown }).window = globalThis;

  return store;
}

describe('lib/offline/idb', () => {
  beforeEach(() => {
    __resetIdbForTests();
  });

  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.indexedDB;
    delete globalScope.window;
    __resetIdbForTests();
  });

  it('is a safe no-op when IndexedDB is unavailable (this repo\'s own test environment)', async () => {
    await expect(idbPut({ id: 'a' })).resolves.toBeUndefined();
    await expect(idbGetAll()).resolves.toEqual([]);
    await expect(idbDelete('a')).resolves.toBeUndefined();
    await expect(idbClear()).resolves.toBeUndefined();
  });

  it('puts and reads back an item', async () => {
    installFakeIndexedDb();
    await idbPut({ id: 'task-1', kind: 'task_create', payload: { title: 'Master the mix' } });
    const all = await idbGetAll<StoredRecord>();
    expect(all).toEqual([{ id: 'task-1', kind: 'task_create', payload: { title: 'Master the mix' } }]);
  });

  it('deletes an item by id', async () => {
    installFakeIndexedDb();
    await idbPut({ id: 'note-1', kind: 'note_create' });
    await idbPut({ id: 'note-2', kind: 'note_create' });
    await idbDelete('note-1');
    const all = await idbGetAll<StoredRecord>();
    expect(all.map((item) => item.id)).toEqual(['note-2']);
  });

  it('clears every item', async () => {
    installFakeIndexedDb();
    await idbPut({ id: 'x' });
    await idbPut({ id: 'y' });
    await idbClear();
    await expect(idbGetAll()).resolves.toEqual([]);
  });
});
