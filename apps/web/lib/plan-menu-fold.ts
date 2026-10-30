// Fold the rollout plan's menu with a small swipe (#898, founder approved
// mock docs/mocks/plan-menu-fold, Oct 30, 2026).
//
// Folding is easy: a small move down the plan hides the toolbar, the tabs and
// the phase cards. Opening is deliberate: the page must already be at the top,
// then a pull past it. On a phone a hard flick down also opens it, because a
// finger's speed can be measured properly there. A mouse wheel sends the same
// step however hard it spins, and trackpad momentum keeps sending steps after
// the fingers lift, so the wheel has no speed rule. This file is the rule;
// usePlanMenuFoldGestures only feeds it measurements.

/** Move this far down the plan and the menu folds. */
export const HIDE_PX = 6;
/** Pull this far past the top to open it. */
export const PULL_OPEN_PX = 70;
/** A wheel pause this long starts a new gesture. */
export const GESTURE_GAP_MS = 180;
/** Finger speed that counts as a hard flick: about 1,600px a second. */
export const FLICK_PX_PER_MS = 1.6;
/** And the flick has to travel at least this far. */
export const FLICK_MIN_PX = 40;
/** The flick's speed is read over this last stretch of the gesture. */
export const FLICK_WINDOW_MS = 100;
/** At or under this the page counts as "at the very top". */
export const AT_TOP_PX = 1;

export type FoldAction = 'fold' | 'open' | null;

export type WheelState = {
  lastAt: number;
  startedAtTop: boolean;
  hideAcc: number;
  pullAcc: number;
};

export const INITIAL_WHEEL: WheelState = { lastAt: -Infinity, startedAtTop: false, hideAcc: 0, pullAcc: 0 };

export type FoldStep<S> = {
  state: S;
  action: FoldAction;
  /** How far a pull at the top has come, 0 to 1, for the pill to show. */
  pull: number;
};

/**
 * One wheel or trackpad event. Only a pull that STARTED at the top counts, so
 * momentum that runs into the top on its own never opens the menu.
 */
export function wheelStep(
  state: WheelState,
  input: { deltaY: number; deltaX: number; now: number; scrollTop: number; folded: boolean }
): FoldStep<WheelState> {
  // A sideways move (a trackpad drag along the timeline) leaves it alone.
  if (Math.abs(input.deltaY) < Math.abs(input.deltaX)) return { state, action: null, pull: 0 };
  const atTop = input.scrollTop <= AT_TOP_PX;
  const next: WheelState =
    input.now - state.lastAt > GESTURE_GAP_MS
      ? { lastAt: input.now, startedAtTop: atTop, hideAcc: 0, pullAcc: 0 }
      : { ...state, lastAt: input.now };

  if (input.deltaY > 0) {
    next.pullAcc = 0;
    next.hideAcc += input.deltaY;
    const action = !input.folded && next.hideAcc > HIDE_PX ? 'fold' : null;
    return { state: next, action, pull: 0 };
  }
  if (input.folded && next.startedAtTop && atTop) {
    next.pullAcc -= input.deltaY;
    const pull = Math.min(1, next.pullAcc / PULL_OPEN_PX);
    return { state: next, action: next.pullAcc >= PULL_OPEN_PX ? 'open' : null, pull };
  }
  return { state: next, action: null, pull: 0 };
}

type TouchSample = { y: number; t: number };

export type TouchState = {
  startY: number;
  startX: number;
  lastY: number;
  startedAtTop: boolean;
  samples: TouchSample[];
} | null;

export function touchStart(input: { x: number; y: number; now: number; scrollTop: number }): TouchState {
  return {
    startY: input.y,
    startX: input.x,
    lastY: input.y,
    startedAtTop: input.scrollTop <= AT_TOP_PX,
    samples: [{ y: input.y, t: input.now }],
  };
}

/** One finger move. Finger up the screen folds; a pull down at the top opens. */
export function touchMove(
  state: TouchState,
  input: { x: number; y: number; now: number; scrollTop: number; folded: boolean }
): FoldStep<TouchState> {
  if (!state) return { state, action: null, pull: 0 };
  const samples = [...state.samples, { y: input.y, t: input.now }].filter(
    (sample) => input.now - sample.t < FLICK_WINDOW_MS
  );
  const next = { ...state, lastY: input.y, samples };
  const up = state.startY - input.y;
  if (Math.abs(up) < Math.abs(state.startX - input.x)) return { state: next, action: null, pull: 0 };
  if (!input.folded && up > HIDE_PX) return { state: next, action: 'fold', pull: 0 };
  if (input.folded && state.startedAtTop && input.scrollTop <= AT_TOP_PX) {
    const pulled = input.y - state.startY;
    const pull = Math.max(0, Math.min(1, pulled / PULL_OPEN_PX));
    return { state: next, action: pulled >= PULL_OPEN_PX ? 'open' : null, pull };
  }
  return { state: next, action: null, pull: 0 };
}

/** The finger lifts: a hard flick down opens the menu from anywhere. */
export function touchEnd(state: TouchState, input: { folded: boolean }): FoldAction {
  if (!state || !input.folded || state.samples.length < 2) return null;
  const first = state.samples[0];
  const last = state.samples[state.samples.length - 1];
  const speed = (last.y - first.y) / Math.max(1, last.t - first.t);
  return speed >= FLICK_PX_PER_MS && state.lastY - state.startY >= FLICK_MIN_PX ? 'open' : null;
}
