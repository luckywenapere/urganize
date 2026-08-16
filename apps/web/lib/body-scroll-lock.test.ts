import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression cover for the stacked-modal scroll lock (2026-08-16).
 *
 * Three modals — the task detail pop-up, the note delete dialog and the
 * release delete dialog — had never been migrated to this module and instead
 * hand-rolled `const original = document.body.style.overflow` /
 * restore-on-cleanup. That is precisely the bug the module's own header
 * describes: when two modals overlap, the second captures the FIRST's
 * 'hidden' as its "original" and writes it back on close, so the page stays
 * unscrollable until a full page reload.
 *
 * The task pop-up was the one that mattered, because TaskOutcomeSheet is
 * designed to stack on top of it and DOES use this module — so every
 * "complete a task from inside the pop-up" hit the interleave.
 *
 * The invariant these tests pin: overflow returns to its pre-lock value no
 * matter how many locks are taken or what order they are released in.
 *
 * vitest runs in the `node` environment here, so the handful of DOM bits the
 * module touches are stubbed rather than pulling in jsdom for one file.
 */

type Stub = { body: { style: { overflow: string; paddingRight: string } } };

let doc: Stub;

function installDom(scrollbarWidth = 0) {
  doc = { body: { style: { overflow: '', paddingRight: '' } } };
  vi.stubGlobal('document', {
    ...doc,
    documentElement: { clientWidth: 1000 },
  });
  vi.stubGlobal('window', { innerWidth: 1000 + scrollbarWidth });
  // Keep the same style object identity the module will mutate.
  (globalThis as unknown as { document: Stub }).document.body = doc.body;
}

/** Fresh module per test — lockCount lives at module scope. */
async function freshLock() {
  vi.resetModules();
  return (await import('./body-scroll-lock')).lockBodyScroll;
}

beforeEach(() => installDom());
afterEach(() => vi.unstubAllGlobals());

describe('lockBodyScroll', () => {
  it('locks on the first take and restores on the last release', async () => {
    const lock = await freshLock();
    expect(doc.body.style.overflow).toBe('');
    const release = lock();
    expect(doc.body.style.overflow).toBe('hidden');
    release();
    expect(doc.body.style.overflow).toBe('');
  });

  it('preserves a pre-existing overflow value rather than blanking it', async () => {
    const lock = await freshLock();
    doc.body.style.overflow = 'scroll';
    lock()();
    expect(doc.body.style.overflow).toBe('scroll');
  });

  // The exact interleave that broke: detail pop-up takes a lock, outcome
  // sheet stacks on top, then the pop-up closes FIRST. Under the hand-rolled
  // version this ended with overflow permanently 'hidden'.
  it('restores correctly when nested locks are released in reverse order', async () => {
    const lock = await freshLock();
    const first = lock();
    const second = lock();
    first();
    expect(doc.body.style.overflow).toBe('hidden'); // sheet still open
    second();
    expect(doc.body.style.overflow).toBe('');
  });

  it('restores correctly when nested locks are released in order', async () => {
    const lock = await freshLock();
    const first = lock();
    const second = lock();
    second();
    expect(doc.body.style.overflow).toBe('hidden');
    first();
    expect(doc.body.style.overflow).toBe('');
  });

  it('survives three overlapping modals in any release order', async () => {
    const lock = await freshLock();
    const releases = [lock(), lock(), lock()];
    expect(doc.body.style.overflow).toBe('hidden');
    // Middle, last, first.
    releases[1]();
    releases[2]();
    expect(doc.body.style.overflow).toBe('hidden');
    releases[0]();
    expect(doc.body.style.overflow).toBe('');
  });

  it('is idempotent per release handle, so a double cleanup cannot unbalance the count', async () => {
    const lock = await freshLock();
    const first = lock();
    const second = lock();
    first();
    first();
    first();
    // Still held by `second` — a stray extra release must not drop the lock.
    expect(doc.body.style.overflow).toBe('hidden');
    second();
    expect(doc.body.style.overflow).toBe('');
  });

  it('pads for the scrollbar once and restores it once', async () => {
    installDom(15);
    const lock = await freshLock();
    const first = lock();
    const second = lock();
    expect(doc.body.style.paddingRight).toBe('15px');
    first();
    second();
    expect(doc.body.style.paddingRight).toBe('');
  });
});
