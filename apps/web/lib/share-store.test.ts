import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShareStore } from '@/stores/useShareStore';

// The share sheet's launcher sits in the middle of the create-rollout flow: a
// create hands it `then`, the rest of its own sequence (the planner intake, the
// new-rollout guide). The property worth pinning is that this sequence can
// never stall. Lives under lib/ only because that is where vitest looks.

beforeEach(() => {
  useShareStore.setState({ request: null, mounted: 0 });
});

describe('useShareStore', () => {
  it('carries straight on when no sheet is mounted to show the request', () => {
    const then = vi.fn();
    useShareStore.getState().open({ releaseId: 'rel-1', source: 'first_release', then });
    expect(then).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request).toBeNull();
  });

  it('holds the continuation while the sheet is open, and runs it once on close', () => {
    const unregister = useShareStore.getState().registerSheet();
    const then = vi.fn();
    useShareStore.getState().open({ releaseId: 'rel-1', source: 'first_release', then });
    expect(then).not.toHaveBeenCalled();
    expect(useShareStore.getState().request?.releaseId).toBe('rel-1');

    useShareStore.getState().close();
    expect(then).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request).toBeNull();

    useShareStore.getState().close();
    expect(then).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('runs the continuation after the sheet reads as closed', () => {
    const unregister = useShareStore.getState().registerSheet();
    let seenOpen: boolean | null = null;
    useShareStore.getState().open({
      releaseId: 'rel-1',
      source: 'first_release',
      then: () => {
        seenOpen = useShareStore.getState().request !== null;
      },
    });
    useShareStore.getState().close();
    expect(seenOpen).toBe(false);
    unregister();
  });

  it('never drops a continuation when a second open replaces the first', () => {
    const unregister = useShareStore.getState().registerSheet();
    const first = vi.fn();
    useShareStore.getState().open({ releaseId: 'rel-1', source: 'first_release', then: first });
    useShareStore.getState().open({ releaseId: 'rel-2', source: 'rollout_menu' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(useShareStore.getState().request?.releaseId).toBe('rel-2');
    unregister();
  });

  it('says whether a sheet took the request, so an offer is only spent when shown', () => {
    // A caller that spends a once-only offer should do so only on true. A
    // false here with the offer spent would burn it on a sheet nobody saw.
    expect(useShareStore.getState().open({ releaseId: 'rel-1', source: 'first_release' })).toBe(
      false
    );
    const unregister = useShareStore.getState().registerSheet();
    expect(useShareStore.getState().open({ releaseId: 'rel-1', source: 'first_release' })).toBe(
      true
    );
    useShareStore.getState().close();
    unregister();
  });

  it('gives every open a fresh token, so the sheet resets between opens', () => {
    const unregister = useShareStore.getState().registerSheet();
    useShareStore.getState().open({ releaseId: 'rel-1', source: 'rollout_menu' });
    const firstToken = useShareStore.getState().request?.token;
    useShareStore.getState().close();
    useShareStore.getState().open({ releaseId: 'rel-1', source: 'rollout_menu' });
    expect(useShareStore.getState().request?.token).not.toBe(firstToken);
    unregister();
  });
});
