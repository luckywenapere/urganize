/**
 * A minimal promise wrapper around IndexedDB — the storage a queued
 * mutation's blob (a cover-art File) needs, since a 25 MiB
 * File cannot live in localStorage (lib/persisted-state.ts's envelope is
 * quota-limited well below that, and every other cache in this codebase is
 * JSON-serializable data for exactly that reason). This is the first use of
 * IndexedDB in the repo, justified under CLAUDE.md principle 5 ("no new
 * patterns unless they're solving a documented problem the existing stack
 * can't handle") — a File object is that problem.
 *
 * Hand-rolled rather than a dependency (`idb`, `localforage`): the surface
 * needed is four operations on one object store, the same "boring stack"
 * call this repo already made for the MCP JSON-RPC layer and the FCM
 * sender. IndexedDB's native callback API is wrapped in promises purely so
 * callers can use async/await; nothing here adds behavior IndexedDB itself
 * doesn't already have.
 */

const DB_NAME = 'urganize-offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** A write only really lands once its TRANSACTION completes, not once the
 * individual request inside it succeeds — the request can succeed and the
 * transaction can still abort (quota, a conflicting close). */
function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** All four operations return a resolved no-op ('unsupported'-safe default)
 * when IndexedDB isn't available (very old browsers, some locked-down
 * embedded webviews, private-browsing modes that disable it) — a queue
 * that silently can't queue is the correct degrade: mutations simply run
 * online-only, same as before this feature existed. */

export async function idbPut<T extends { id: string }>(item: T): Promise<void> {
  if (!isIndexedDbSupported()) return;
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(item);
  await promisifyTransaction(tx).catch(() => undefined);
}

export async function idbGetAll<T>(): Promise<T[]> {
  if (!isIndexedDbSupported()) return [];
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const result = await promisifyRequest(tx.objectStore(STORE_NAME).getAll() as IDBRequest<T[]>).catch(
    () => [] as T[]
  );
  return result;
}

export async function idbDelete(id: string): Promise<void> {
  if (!isIndexedDbSupported()) return;
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await promisifyTransaction(tx).catch(() => undefined);
}

export async function idbClear(): Promise<void> {
  if (!isIndexedDbSupported()) return;
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await promisifyTransaction(tx).catch(() => undefined);
}

/** Test-only: forces the next call to re-open the database. Production code
 * never needs this — the module-level cache is intentional. */
export function __resetIdbForTests(): void {
  dbPromise = null;
}
