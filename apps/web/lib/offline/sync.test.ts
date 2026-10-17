import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetIdbForTests } from './idb';
import { enqueue, listQueued, type QueuedMutation } from './queue';

const getSessionMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSessionMock() } },
}));

const uploadCoverArtMock = vi.fn();
vi.mock('@/lib/cover-art-upload', () => ({
  uploadCoverArt: (...args: unknown[]) => uploadCoverArtMock(...args),
}));

import { useTaskStore } from '@/stores/useTaskStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { flushOfflineQueue } from './sync';

/** Same hand-rolled fake IndexedDB as idb.test.ts / queue.test.ts. */
function installFakeIndexedDb() {
  const store = new Map<string, { id: string; [key: string]: unknown }>();
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
    put(item: { id: string }) {
      store.set(item.id, item as { id: string; [key: string]: unknown });
      const r = new FakeRequest<void>();
      r._resolve(undefined);
      return r;
    }
    getAll() {
      const r = new FakeRequest<unknown[]>();
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
}

describe('flushOfflineQueue', () => {
  beforeEach(() => {
    installFakeIndexedDb();
    __resetIdbForTests();
    getSessionMock.mockReset();
    uploadCoverArtMock.mockReset();
    useTaskStore.setState({ tasks: [], error: '' });
  });

  afterEach(() => {
    const globalScope = globalThis as unknown as Record<string, unknown>;
    delete globalScope.indexedDB;
    delete globalScope.window;
    delete globalScope.fetch;
    __resetIdbForTests();
    vi.restoreAllMocks();
  });

  function mockSession(userId: string | null, token = 'token-123') {
    getSessionMock.mockResolvedValue({
      data: { session: userId ? { user: { id: userId }, access_token: token } : null },
    });
  }

  it('does nothing when nobody is signed in', async () => {
    mockSession(null);
    const outcome = await flushOfflineQueue();
    expect(outcome).toEqual({ synced: 0, dropped: 0 });
  });

  it('replays a queued task_create and swaps the local placeholder for the server row', async () => {
    mockSession('user-1');
    useTaskStore.setState({
      tasks: [
        {
          id: 'offline-task-1',
          pendingSync: true,
        } as unknown as ReturnType<typeof useTaskStore.getState>['tasks'][number],
      ],
    });
    await enqueue({
      id: 'offline-task-1',
      kind: 'task_create',
      userId: 'user-1',
      payload: { title: 'Master the mix', releaseId: 'release-1' },
    });

    const serverTask = { id: 'real-task-1', title: 'Master the mix' };
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ task: serverTask }),
    });

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 1, dropped: 0 });
    expect(useTaskStore.getState().tasks).toEqual([serverTask]);
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('leaves a task_create queued when the network is down', async () => {
    mockSession('user-1');
    await enqueue({
      kind: 'task_create',
      userId: 'user-1',
      payload: { title: 'Offline task', releaseId: 'release-1' },
    });
    (globalThis as unknown as { fetch: unknown }).fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 0, dropped: 0 });
    expect(await listQueued('user-1')).toHaveLength(1);
  });

  it('drops a task_create rejected outright by the server (4xx)', async () => {
    mockSession('user-1');
    await enqueue({
      kind: 'task_create',
      userId: 'user-1',
      payload: { title: 'Bad task', releaseId: 'deleted-release' },
    });
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Release not found.' }),
    });

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 0, dropped: 1 });
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('replays a queued cover-art upload and runs the same write-through the interactive flow uses', async () => {
    mockSession('user-1');
    const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });
    await enqueue<Extract<QueuedMutation, { kind: 'cover_art_upload' }>>({
      kind: 'cover_art_upload',
      userId: 'user-1',
      payload: { releaseId: 'release-1', dimensions: { width: 3000, height: 3000 } },
      blob: file,
    });

    const coverArt = { id: 'asset-1', url: 'https://signed.example/cover.jpg' };
    uploadCoverArtMock.mockResolvedValue({ ok: true, coverArt });
    const setSceneSpy = vi.spyOn(useSceneDataStore.getState(), 'setScene').mockImplementation(() => {});
    const loadCommandCenterSpy = vi
      .spyOn(useReleaseStore.getState(), 'loadCommandCenter')
      .mockResolvedValue(null);

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 1, dropped: 0 });
    expect(uploadCoverArtMock).toHaveBeenCalledWith(
      expect.objectContaining({ releaseId: 'release-1', file, token: 'token-123' })
    );
    expect(setSceneSpy).toHaveBeenCalledWith('release-1', 'coverart', { coverArt });
    expect(loadCommandCenterSpy).toHaveBeenCalledWith({ force: true });
  });

  it('keeps a cover-art upload queued when the upload flow reports a retryable failure', async () => {
    mockSession('user-1');
    const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });
    await enqueue<Extract<QueuedMutation, { kind: 'cover_art_upload' }>>({
      kind: 'cover_art_upload',
      userId: 'user-1',
      payload: { releaseId: 'release-1' },
      blob: file,
    });
    uploadCoverArtMock.mockResolvedValue({ ok: false, step: 2, error: 'Upload failed.', retryable: true });

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 0, dropped: 0 });
    expect(await listQueued('user-1')).toHaveLength(1);
  });

  it('drops a cover-art upload the flow reports as terminal (not retryable)', async () => {
    mockSession('user-1');
    const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });
    await enqueue<Extract<QueuedMutation, { kind: 'cover_art_upload' }>>({
      kind: 'cover_art_upload',
      userId: 'user-1',
      payload: { releaseId: 'release-1' },
      blob: file,
    });
    uploadCoverArtMock.mockResolvedValue({ ok: false, step: 1, error: 'File too large.', retryable: false });

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 0, dropped: 1 });
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('drops a song upload queued before song upload was removed (Oct 17, 2026)', async () => {
    mockSession('user-1');
    const file = new File(['bytes'], 'song.mp3', { type: 'audio/mpeg' });
    await enqueue({
      kind: 'song_upload',
      userId: 'user-1',
      payload: { releaseId: 'release-1' },
      blob: file,
    } as unknown as Parameters<typeof enqueue>[0]);

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 0, dropped: 1 });
    expect(await listQueued('user-1')).toHaveLength(0);
  });

  it('only replays the signed-in user\'s own queued items', async () => {
    mockSession('user-1');
    await enqueue({ kind: 'task_create', userId: 'user-2', payload: { title: 'Not mine', releaseId: 'r' } });
    const fetchMock = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const outcome = await flushOfflineQueue();

    expect(outcome).toEqual({ synced: 0, dropped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await listQueued('user-2')).toHaveLength(1);
  });

  it('coalesces concurrent calls into a single in-flight flush', async () => {
    mockSession('user-1');
    await enqueue({ kind: 'task_create', userId: 'user-1', payload: { title: 'A', releaseId: 'r1' } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ task: { id: 'server-1' } }),
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const first = flushOfflineQueue();
    const second = flushOfflineQueue();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 10000);
});
