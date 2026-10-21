// The OS back-swipe / browser Back closes the topmost open overlay (QA,
// 2026-10-21). Only Settings used to do this; every other sheet and dialog let
// Back navigate away from the page underneath.
//
// Opening an overlay pushes ONE history entry (state null, same URL: the
// settings-history trick, so Next syncs it). Back pops it and closes the
// overlay. Closing by its own X / scrim / Escape gives the entry back with
// go(-n), so no duplicate page is left behind. Overlays stack: Back closes the
// newest one first. Pure (the environment is injected) so vitest holds the
// rules; lib/use-back-to-close.ts is the React wrapper.

export type BackEnv = {
  /** Push a history entry for the current URL (state null). */
  push: () => void;
  /** history.go(-steps). */
  back: (steps: number) => void;
  /** The current URL, used to detect that the page moved on underneath us. */
  href: () => string;
  /** Run `fn` after `ms` (injected so tests do not wait). */
  schedule: (fn: () => void, ms: number) => void;
  now: () => number;
  /** Attach the one popstate listener; returns its remover. */
  listen: (handler: () => void) => () => void;
};

export type BackHandle = { release: () => void };

type Entry = {
  id: number;
  onBack: () => void;
  isOpen: () => boolean;
  /** Pushed at this URL; a go() is only safe while the URL is still this one. */
  href: string;
  /** The overlay closed out of order: its history entry is still there, to be
   *  drained when the entries above it go. */
  inactive: boolean;
};

/** How long we wait for the popstate our own go() causes before giving up. */
const PROGRAMMATIC_WINDOW_MS = 1000;
/** After Back closes an overlay, how long it has to actually go away. */
const REPUSH_CHECK_MS = 120;

export function createBackManager(env: BackEnv) {
  const stack: Entry[] = [];
  let nextId = 1;
  let unlisten: (() => void) | null = null;
  // popstate events our own go() will cause: they are not the person's Back.
  let pending = 0;
  let pendingUntil = 0;

  const markProgrammatic = () => {
    pending += 1;
    pendingUntil = env.now() + PROGRAMMATIC_WINDOW_MS;
  };

  /** Inactive entries now on top of the stack: their history entries are stale. */
  const drainInactiveTop = (): number => {
    let drained = 0;
    while (stack.length > 0 && stack[stack.length - 1].inactive) {
      stack.pop();
      drained += 1;
    }
    return drained;
  };

  const detachIfIdle = () => {
    if (stack.length === 0 && unlisten) {
      unlisten();
      unlisten = null;
    }
  };

  const attach = () => {
    if (unlisten) return;
    unlisten = env.listen(onPopState);
  };

  function onPopState() {
    if (pending > 0) {
      if (env.now() <= pendingUntil) {
        pending -= 1;
        return;
      }
      pending = 0; // the expected event never came; do not swallow a real one
    }
    // The browser removed the top history entry, which is the top overlay's
    // (the top is never stale at rest: releasing it pops it).
    const top = stack.pop();
    if (!top) {
      detachIfIdle();
      return;
    }
    // Overlays that closed out of order left entries under it: step over them.
    const stale = drainInactiveTop();
    if (stale > 0) {
      markProgrammatic();
      env.back(stale);
    }
    top.onBack();
    // A dialog that guards unsaved work may refuse to close. It is still on
    // screen with no entry behind it, so put one back.
    env.schedule(() => {
      if (!top.isOpen()) return;
      top.inactive = false;
      top.href = env.href();
      env.push();
      stack.push(top);
      attach();
    }, REPUSH_CHECK_MS);
    detachIfIdle();
  }

  return {
    /** An overlay opened. Returns the handle to release when it closes. */
    register(onBack: () => void, isOpen: () => boolean = () => true): BackHandle {
      const entry: Entry = {
        id: nextId++,
        onBack,
        isOpen,
        href: env.href(),
        inactive: false,
      };
      env.push();
      stack.push(entry);
      attach();
      return {
        release: () => {
          const index = stack.indexOf(entry);
          // Already taken off by the browser's Back (or released twice).
          if (index === -1) return;
          if (index !== stack.length - 1) {
            // Closed out of order: its entry stays until the ones above go.
            entry.inactive = true;
            return;
          }
          stack.pop();
          const stale = drainInactiveTop();
          const steps = 1 + stale;
          // Only unwind history while the page is still the one we pushed on.
          // If the person navigated elsewhere (a link inside the overlay),
          // back() would undo that navigation.
          if (env.href() === entry.href) {
            markProgrammatic();
            env.back(steps);
          }
          detachIfIdle();
        },
      };
    },
    /** Test and debug aid. */
    depth: () => stack.length,
  };
}

export function browserBackEnv(): BackEnv {
  return {
    push: () => {
      window.history.pushState(null, '', window.location.href);
    },
    back: (steps) => {
      window.history.go(-steps);
    },
    href: () => window.location.href,
    schedule: (fn, ms) => {
      window.setTimeout(fn, ms);
    },
    now: () => Date.now(),
    listen: (handler) => {
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    },
  };
}
