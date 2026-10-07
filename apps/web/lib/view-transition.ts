/**
 * A smooth hand-off between two pages, built on the browser's View Transitions
 * API. The Home chat box and the full chat's composer carry the same
 * `view-transition-name`, so the browser glides one into the other while the
 * rest of the page cross-fades (rules in globals.css, scoped to the `vt-urgans`
 * class this helper sets for the length of the transition).
 *
 * It only ever wraps a navigation: where the API is missing, or the person
 * asked for less motion, the push happens at once exactly as before.
 */

export const COMPOSER_TRANSITION_NAME = 'urgans-composer';
/** Marks the full chat's composer, so we know the destination has painted it. */
export const COMPOSER_ATTRIBUTE = 'data-urgans-composer';
/** Marks the Home box, so a plain-fade return can switch its morph off. */
export const SOURCE_ATTRIBUTE = 'data-urgans-source';

const ACTIVE_CLASS = 'vt-urgans';
const PLAIN_CLASS = 'vt-plain';
/** A slow destination never holds the old page frozen for longer than this. */
export const DESTINATION_TIMEOUT_MS = 1200;

/** Pure: whether to animate at all. */
export function shouldAnimateNavigation(input: {
  supported: boolean;
  reducedMotion: boolean;
  /** A background tab is never rendered, so a transition there would stall. */
  visible?: boolean;
}): boolean {
  return input.supported && !input.reducedMotion && input.visible !== false;
}

/** Pure: has the destination page arrived and painted what we morph into? */
export function destinationReady(input: {
  pathname: string;
  href: string;
  needsComposer: boolean;
  hasComposer: boolean;
}): boolean {
  if (input.pathname !== input.href) return false;
  return input.needsComposer ? input.hasComposer : true;
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => {
    finished: Promise<void>;
  };
};

export function navigateWithTransition(
  push: () => void,
  href: string,
  options: { shared?: boolean } = {}
): void {
  const shared = options.shared !== false;
  if (typeof document === 'undefined') {
    push();
    return;
  }
  const doc = document as TransitionDocument;
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (
    !shouldAnimateNavigation({
      supported: typeof doc.startViewTransition === 'function',
      reducedMotion,
      visible: document.visibilityState !== 'hidden',
    })
  ) {
    push();
    return;
  }

  const root = document.documentElement;
  root.classList.add(ACTIVE_CLASS);
  if (!shared) root.classList.add(PLAIN_CLASS);
  const cleanup = () => root.classList.remove(ACTIVE_CLASS, PLAIN_CLASS);
  // The browser runs the update callback on its next frame. If that never
  // comes (the page lost focus mid-click), navigate anyway rather than leave
  // the person standing still.
  let started = false;
  const watchdog = window.setTimeout(() => {
    if (started) return;
    started = true;
    cleanup();
    push();
  }, 600);

  try {
    const transition = doc.startViewTransition!(
      () =>
        new Promise<void>((resolve) => {
          if (started) {
            resolve();
            return;
          }
          started = true;
          window.clearTimeout(watchdog);
          let done = false;
          let observer: MutationObserver | null = null;
          const finish = () => {
            if (done) return;
            done = true;
            observer?.disconnect();
            window.clearTimeout(timer);
            // One more frame so the new page has laid out before it is captured.
            requestAnimationFrame(() => resolve());
          };
          const check = () => {
            if (
              destinationReady({
                pathname: window.location.pathname,
                href,
                needsComposer: shared,
                hasComposer: document.querySelector(`[${COMPOSER_ATTRIBUTE}]`) !== null,
              })
            ) {
              finish();
            }
          };
          const timer = window.setTimeout(finish, DESTINATION_TIMEOUT_MS);
          observer = new MutationObserver(check);
          observer.observe(document.body, { childList: true, subtree: true });
          push();
          check();
        })
    );
    void transition.finished.then(cleanup, cleanup);
  } catch {
    cleanup();
    push();
  }
}
