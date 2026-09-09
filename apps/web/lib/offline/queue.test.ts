import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetIdbForTests } from './idb';
import {
  MAX_SERVER_ERROR_ATTEMPTS,
  decideFlushOutcome,
  enqueue,
  flush,
  listQueued,
  mutateQueuedPayload,
  removeQueued,
  pendingCount,
  subscribeQueueChanges,
  type QueuedMutation,
} from './queue';

/** Same hand-rolled fake IndexedDB approach as idb.test.ts — this repo's
 * vitest environment is plain Node with no IndexedDB global. */
function installFakeIndexedDb() {
  const store = new Map<string, QueuedMutation>();

  class FakeRequest<T> {
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: T = undefined as T;
    _resolve(value: T) {
      this.result = value;
      queueMicrotask(() => this.onsuccess && this.onsuccess());
    }
  }
  class FakeObjectStore {
    put(item: QueuedMutation) {
      store.set(item.id, item);
      const r = new FakeRequest<void>();
      r._resolve(undefined);
      return r;
    }
    getAll() {
      const r = new FakeRequest<QueuedMutation[]>();
      r._resolve(Array.from(store.values()));
      return r;
    }
    delete(id: string) {
      store.delete(id);
      const r = new FakeRequest<void>();
      r._resolve(undefined);
      return r;
    }
    clear() {
      store.clear();
      const r = new FakeRequest<void>();
      r._resolve(undefined);
      return r;
    }
  }
  class FakeTransaction {
    oncomplete: (() => void) | null = null;
    objectStore() {
      const os = new FakeObjectStore();
      queueMicrotask(() => this.oncomplete && this.oncomplete());
      return os;
    }
  }
  class FakeDatabase {
    objectStoreNames = { contains: () => true };
    createObjectStore() {
      return new FakeObjectStore();
    }
    transaction() {
      return new FakeTransaction();
    }
  }
  const fakeIndexedDb = {
    open() {
      const r = new FakeRequest<FakeDatabase>();
      queueMicrotask(() => r._resolve(new FakeDatabase()));
      return r;
    },
  };
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = fakeIndexedDb;
  (globalThis as unknown as { window: unknown }).window = globalThis;
  return store;
}

describe('decideFlushOutcome', () => {
  it('dequeues on success', () => {
    expect(decideFlushOutcome({ kind: 'success' }, 0)).toEqual({ action: 'dequeue' });
  });

  it('stops the whole flush on a network failure, regardless of attempt count', () => {
    expect(decideFlushOutcome({ kind: 'network_failure' }, 0)).toEqual({ action: 'stop' });
    expect(decideFlushOutcome({ kind: 'network_failure' }, 2)).toEqual({ action: 'stop' });
  });

  it('drops a client error (4xx) immediately, never retries it', () => {
    expect(decideFlushOutcome({ kind: 'client_error', status: 400 }, 0)).toEqual({
      action: 'drop',
      reason: 'client_error',
    });
    expect(decideFlushOutcome({ kind: 'client_error', status: 403 }, 2)).toEqual({
      action: 'drop',
      reason: 'client_error',
    });
  });

  it('requeues a server error under the attempt cap', () => {
    expect(decideFlushOutcome({ kind: 'server_error', status: 500 }, 0)).toEqual({ action: 'requeue' });
    expect(decideFlushOutcome({ kind: 'server_error', status: 503 }, MAX_SERVER_ERROR_ATTEMPTS - 2)).toEqual({
      action: 'requeue',
    });
  });

  it('drops a server error once the attempt cap is reached', () => {
    expect(
      decideFlushOutcome({ kind: 'server_error', status: 500 }, MAX_SERVER_ERROR_ATTEMPTS - 1)
    ).toEqual({ action: 'drop', reason: 'exhausted' });
  });
});

describe('queue storage', () => {
  beforeEach(() => {
    installFakeIndexedDb();
    __resetIdbForTests();
  });

  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.indexedDB;
    delete globalScope.window;
    __resetIdbForTests();
  });

  it('enqueues and lists items oldest-first', async () => {
    const first = await enqueue({
      kind: 'task_create',
      userId: 'user-1',
      payload: { title: 'First', releaseId: 'r1' },
    });
    const second = await enqueue({
      kind: 'task_create',
      userId: 'user-1',
      payload: { title: 'Second', releaseId: 'r1' },
    });
    const items = await listQueued('user-1');
    expect(items.map((i) => i.id)).toEqual([first.id, second.id]);
  });

  it('scopes listing and pendingCount to a single user', async () => {
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'Mine' } });
    await enqueue({ kind: 'note_create', userId: 'user-2', payload: { body: 'Not mine' } });
    expect(await pendingCount('user-1')).toBe(1);
    expect(await pendingCount('user-2')).toBe(1);
    const items = await listQueued('user-1');
    expect(items).toHaveLength(1);
    expect((items[0].payload as { body: string }).body).toBe('Mine');
  });

  it('mutateQueuedPayload merges into a still-queued item without touching others', async () => {
    const item = await enqueue({
      kind: 'note_create',
      userId: 'user-1',
      payload: { body: 'draft one' },
    });
    await mutateQueuedPayload<Extract<QueuedMutation, { kind: 'note_create' }>>(item.id, {
      body: 'draft two',
    });
    const [reloaded] = await listQueued('user-1');
    expect(reloaded.payload).toEqual({ body: 'draft two' });
  });

  it('mutateQueuedPayload is a no-op when the item is already gone', async () => {
    await expect(
      mutateQueuedPayload('missing-id', { body: 'irrelevant' })
    ).resolves.toBeUndefined();
  });

  it('notifies subscribers on enqueue and on a flush that changes the queue', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueueChanges(listener);
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'x' } });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'y' } });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('flush', () => {
  beforeEach(() => {
    installFakeIndexedDb();
    __resetIdbForTests();
  });

  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.indexedDB;
    delete globalScope.window;
    __resetIdbForTests();
  });

  it('syncs every item in order and empties the queue on success', async () => {
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'A', releaseId: 'r1' } });
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'B', releaseId: 'r1' } });

    const replayed: string[] = [];
    const outcome = await flush('user-1', async () => 'token', {
      replay: async (item) => {
        replayed.push((item.payload as { title: string }).title);
        return { kind: 'success', data: { id: 'server-id' } };
      },
    });

    expect(outcome).toEqual({ synced: 2, dropped: 0 });
    expect(replayed).toEqual(['A', 'B']);
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('stops at the first network failure, leaving that item and everything after it queued', async () => {
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'A', releaseId: 'r1' } });
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'B', releaseId: 'r1' } });

    const attempted: string[] = [];
    const outcome = await flush('user-1', async () => 'token', {
      replay: async (item) => {
        attempted.push((item.payload as { title: string }).title);
        return { kind: 'network_failure' };
      },
    });

    expect(outcome).toEqual({ synced: 0, dropped: 0 });
    expect(attempted).toEqual(['A']); // never even tries B
    expect(await listQueued('user-1')).toHaveLength(2);
  });

  it('drops a client error and keeps going to the next item', async () => {
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'Bad', releaseId: 'gone' } });
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'Good', releaseId: 'r1' } });

    const onDropped = vi.fn();
    const outcome = await flush('user-1', async () => 'token', {
      replay: async (item) => {
        const title = (item.payload as { title: string }).title;
        return title === 'Bad' ? { kind: 'client_error', status: 400 } : { kind: 'success' };
      },
      onDropped,
    });

    expect(outcome).toEqual({ synced: 1, dropped: 1 });
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('requeues a server error and keeps it in the queue with an incremented attempt count', async () => {
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'Flaky', releaseId: 'r1' } });

    await flush('user-1', async () => 'token', {
      replay: async () => ({ kind: 'server_error', status: 500 }),
    });

    const [remaining] = await listQueued('user-1');
    expect(remaining.attempts).toBe(1);
  });

  it('drops a server error once it has exhausted its retry budget across multiple flushes', async () => {
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'Flaky', releaseId: 'r1' } });

    const onDropped = vi.fn();
    for (let i = 0; i < MAX_SERVER_ERROR_ATTEMPTS; i += 1) {
      await flush('user-1', async () => 'token', {
        replay: async () => ({ kind: 'server_error', status: 503 }),
        onDropped,
      });
    }

    expect(onDropped).toHaveBeenCalledWith(expect.anything(), 'exhausted');
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('never replays another user\'s queued items', async () => {
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'mine' } });
    await enqueue({ kind: 'note_create', userId: 'user-2', payload: { body: 'theirs' } });

    const replayed: string[] = [];
    await flush('user-1', async () => 'token', {
      replay: async (item) => {
        replayed.push((item.payload as { body: string }).body);
        return { kind: 'success' };
      },
    });

    expect(replayed).toEqual(['mine']);
    expect(await pendingCount('user-2')).toBe(1);
  });

  it('stops without attempting anything when no access token is available', async () => {
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'x' } });
    const replay = vi.fn();
    const outcome = await flush('user-1', async () => '', { replay });
    expect(outcome).toEqual({ synced: 0, dropped: 0 });
    expect(replay).not.toHaveBeenCalled();
    expect(await pendingCount('user-1')).toBe(1);
  });

  it('treats a replay handler that throws as a network failure rather than corrupting the queue', async () => {
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'x' } });
    const outcome = await flush('user-1', async () => 'token', {
      replay: async () => {
        throw new Error('handler bug');
      },
    });
    expect(outcome).toEqual({ synced: 0, dropped: 0 });
    expect(await pendingCount('user-1')).toBe(1);
  });

  it('calls onSynced with the replay result data, for swapping a temp id', async () => {
    const item = await enqueue({
      kind: 'task_create',
      userId: 'user-1',
      payload: { title: 'A', releaseId: 'r1' },
    });
    const onSynced = vi.fn();
    await flush('user-1', async () => 'token', {
      replay: async () => ({ kind: 'success', data: { id: 'server-task-1' } }),
      onSynced,
    });
    expect(onSynced).toHaveBeenCalledWith(
      expect.objectContaining({ id: item.id }),
      { id: 'server-task-1' }
    );
  });
});

describe('removeQueued', () => {
  // Same fake-IndexedDB harness as the blocks above: this repo's vitest
  // environment is plain Node, so without it every storage call no-ops and
  // the assertions here would pass vacuously against an empty store.
  beforeEach(() => {
    installFakeIndexedDb();
    __resetIdbForTests();
  });

  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.indexedDB;
    delete globalScope.window;
    __resetIdbForTests();
  });
  /** Deleting a note that never reached the server means dropping its
   *  queued create — there is no server row to DELETE, and leaving the item
   *  would resurrect the note on the next flush. */
  it('drops one item and leaves the rest', async () => {
    const keep = await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'keep' } });
    const drop = await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'drop' } });
    await removeQueued(drop.id);
    const left = await listQueued('user-1');
    expect(left.map((item) => item.id)).toEqual([keep.id]);
  });

  /** Already synced, already dropped, or simply never there — all the same
   *  to a caller that just wants it gone. */
  it('is a no-op for an id that is not queued', async () => {
    await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'x' } });
    await expect(removeQueued('nope')).resolves.toBeUndefined();
    expect(await pendingCount('user-1')).toBe(1);
  });

  it('notifies subscribers so a pending count can re-read', async () => {
    const item = await enqueue({ kind: 'note_create', userId: 'user-1', payload: { body: 'x' } });
    let calls = 0;
    const stop = subscribeQueueChanges(() => { calls += 1; });
    await removeQueued(item.id);
    stop();
    expect(calls).toBeGreaterThan(0);
  });
});
