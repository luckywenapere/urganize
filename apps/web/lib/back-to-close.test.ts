import { describe, expect, it } from 'vitest';
import { createBackManager, type BackEnv } from './back-to-close';

function makeEnv(initialHref = 'https://x.test/dashboard') {
  let href = initialHref;
  let now = 0;
  let handler: (() => void) | null = null;
  const log: string[] = [];
  const timers: Array<() => void> = [];
  const env: BackEnv = {
    push: () => log.push('push'),
    back: (n) => log.push(`back${n}`),
    href: () => href,
    schedule: (fn) => timers.push(fn),
    now: () => now,
    listen: (h) => {
      handler = h;
      log.push('listen');
      return () => {
        handler = null;
        log.push('unlisten');
      };
    },
  };
  return {
    env,
    log,
    setHref: (h: string) => (href = h),
    advance: (ms: number) => (now += ms),
    popstate: () => handler?.(),
    hasListener: () => handler !== null,
    runTimers: () => timers.splice(0).forEach((t) => t()),
  };
}

describe('back-to-close', () => {
  it('pushes one entry per open overlay', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    m.register(() => {});
    expect(t.log.filter((l) => l === 'push')).toHaveLength(1);
    expect(m.depth()).toBe(1);
  });

  it('Back closes the overlay and leaves no extra entry behind', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    let closed = 0;
    const h = m.register(() => closed++, () => false);
    t.popstate();
    expect(closed).toBe(1);
    expect(t.log).not.toContain('back1');
    h.release(); // the component cleanup after it closed
    expect(t.log.filter((l) => l.startsWith('back'))).toHaveLength(0);
    expect(m.depth()).toBe(0);
    expect(t.hasListener()).toBe(false);
  });

  it('closing programmatically pops its entry exactly once, and its popstate is ignored', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    let closed = 0;
    const h = m.register(() => closed++);
    h.release();
    expect(t.log.filter((l) => l === 'back1')).toHaveLength(1);
    // the popstate our own go() causes must not close anything
    const other = m.register(() => closed++);
    t.popstate();
    expect(closed).toBe(0);
    expect(m.depth()).toBe(1);
    other.release();
  });

  it('stacks: Back closes the newest first, one per swipe', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    const order: string[] = [];
    m.register(() => order.push('a'), () => false);
    m.register(() => order.push('b'), () => false);
    t.popstate();
    expect(order).toEqual(['b']);
    t.popstate();
    expect(order).toEqual(['b', 'a']);
    expect(m.depth()).toBe(0);
  });

  it('an overlay that closes out of order leaves its entry to be drained, not stranded', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    const a = m.register(() => {});
    const order: string[] = [];
    m.register(() => order.push('b'), () => false);
    a.release(); // lower one closes first
    expect(t.log.filter((l) => l.startsWith('back'))).toHaveLength(0);
    t.popstate(); // Back closes b, and steps over a's stale entry
    expect(order).toEqual(['b']);
    expect(t.log).toContain('back1');
    expect(m.depth()).toBe(0);
  });

  it('both closing in the same tick unwind both entries in one go', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    const a = m.register(() => {});
    const b = m.register(() => {});
    a.release();
    b.release();
    expect(t.log.filter((l) => l.startsWith('back'))).toEqual(['back2']);
  });

  it('never walks history if the page moved on (a link inside the overlay)', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    const h = m.register(() => {});
    t.setHref('https://x.test/locked');
    h.release();
    expect(t.log.filter((l) => l.startsWith('back'))).toHaveLength(0);
  });

  it('a dialog that refuses to close gets its entry back', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    m.register(() => {} /* confirm cancelled: stays open */, () => true);
    t.popstate();
    expect(m.depth()).toBe(0);
    t.runTimers();
    expect(m.depth()).toBe(1);
    expect(t.log.filter((l) => l === 'push')).toHaveLength(2);
  });

  it('does not re-push when it did close', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    m.register(() => {}, () => false);
    t.popstate();
    t.runTimers();
    expect(m.depth()).toBe(0);
  });

  it('a popstate with nothing open is ignored (forward navigation)', () => {
    const t = makeEnv();
    createBackManager(t.env);
    t.popstate();
    expect(t.log).toEqual([]);
  });

  it('an expected popstate that never came does not swallow a real Back later', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    let closed = 0;
    const first = m.register(() => {});
    first.release(); // go(-1) with no event (e.g. no entry to go to)
    t.advance(5000);
    m.register(() => closed++, () => false);
    t.popstate();
    expect(closed).toBe(1);
  });

  it('releasing twice is harmless', () => {
    const t = makeEnv();
    const m = createBackManager(t.env);
    const h = m.register(() => {});
    h.release();
    h.release();
    expect(t.log.filter((l) => l === 'back1')).toHaveLength(1);
  });
});
