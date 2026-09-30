import { beforeEach, describe, expect, it } from 'vitest';
import { selectMenuPresent, useRailMenuStore } from '../stores/useRailMenuStore';

/**
 * The tiny store that lets a rollout menu rendered by WorkspaceView appear in
 * the right-hand column that AppShell owns. It holds two facts and nothing
 * else: WHERE the menu goes (the column's slot element) and WHO wants to be
 * there (an owner registry). "Is there a menu" is derived from both, in one
 * selector, so the column, the side menu and the workspace cannot disagree.
 *
 * The slot is faked with a plain object: this repo tests node-only, and the
 * store never looks inside the element, it only holds it.
 */
const fakeSlot = () => ({}) as unknown as HTMLElement;

beforeEach(() => {
  useRailMenuStore.setState({ slot: null, owners: [] });
});

describe('selectMenuPresent', () => {
  it('is false with nothing at all', () => {
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(false);
  });

  it('is false with an owner but nowhere to put the menu', () => {
    // A page that renders a menu but has no right-hand column (any route
    // without app chrome) must not reserve a column that does not exist.
    useRailMenuStore.getState().claim('a');
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(false);
  });

  it('is false with a slot but nobody wanting it', () => {
    // The column exists on every chrome page. Without a rollout open it must
    // reserve nothing, exactly as the old closed rail did.
    useRailMenuStore.getState().setSlot(fakeSlot());
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(false);
  });

  it('is true once there is both a slot and an owner', () => {
    useRailMenuStore.getState().setSlot(fakeSlot());
    useRailMenuStore.getState().claim('a');
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(true);
  });

  it('turns false again when the slot goes away', () => {
    // The column unmounting (navigating to the assistant page, where the rail
    // renders nowhere) must take the menu with it rather than leave a claim
    // pointing at a detached element.
    useRailMenuStore.getState().setSlot(fakeSlot());
    useRailMenuStore.getState().claim('a');
    useRailMenuStore.getState().setSlot(null);
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(false);
  });
});

describe('claim and release', () => {
  it('is idempotent: claiming twice is one owner', () => {
    const { claim, release } = useRailMenuStore.getState();
    claim('a');
    claim('a');
    expect(useRailMenuStore.getState().owners).toEqual(['a']);
    release('a');
    expect(useRailMenuStore.getState().owners).toEqual([]);
  });

  it('keeps the menu present until EVERY owner has let go', () => {
    // The loading skeleton and the real menu are both owners for a frame while
    // one hands over to the other. If the skeleton's release emptied the set
    // the column would collapse and reopen, a visible jump at the exact moment
    // the page finishes loading.
    useRailMenuStore.getState().setSlot(fakeSlot());
    const { claim, release } = useRailMenuStore.getState();
    claim('skeleton');
    claim('menu');
    release('skeleton');
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(true);
    release('menu');
    expect(selectMenuPresent(useRailMenuStore.getState())).toBe(false);
  });

  it('ignores releasing an owner that was never there', () => {
    const before = useRailMenuStore.getState().owners;
    useRailMenuStore.getState().release('ghost');
    expect(useRailMenuStore.getState().owners).toBe(before);
  });

  it('does not create a new array when nothing changed', () => {
    // Zustand notifies on reference change. A repeat claim that swapped in an
    // equal-but-new array would re-render every subscriber for nothing.
    useRailMenuStore.getState().claim('a');
    const before = useRailMenuStore.getState().owners;
    useRailMenuStore.getState().claim('a');
    expect(useRailMenuStore.getState().owners).toBe(before);
  });
});

describe('setSlot', () => {
  it('holds the element it was given', () => {
    const slot = fakeSlot();
    useRailMenuStore.getState().setSlot(slot);
    expect(useRailMenuStore.getState().slot).toBe(slot);
  });

  it('is a stable function, so it is safe to hand to React as a ref', () => {
    // An inline ref callback is a NEW function every render, which React
    // answers by calling the old one with null and the new one with the
    // element. That would unmount and remount the portalled menu on every
    // render of the column, losing focus each time. The store's own action is
    // one function for the life of the app.
    const first = useRailMenuStore.getState().setSlot;
    useRailMenuStore.getState().claim('a');
    useRailMenuStore.getState().setSlot(fakeSlot());
    expect(useRailMenuStore.getState().setSlot).toBe(first);
  });
});
