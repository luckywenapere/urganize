import { describe, expect, it } from 'vitest';
import {
  GESTURE_GAP_MS,
  INITIAL_WHEEL,
  touchEnd,
  touchMove,
  touchStart,
  wheelStep,
  type FoldAction,
  type TouchState,
  type WheelState,
} from './plan-menu-fold';

type Wheel = { deltaY: number; deltaX?: number; at: number; scrollTop: number };

/** Runs wheel events in order, flipping `folded` as the rule says. */
function wheel(events: Wheel[], folded: boolean) {
  let state: WheelState = INITIAL_WHEEL;
  let pull = 0;
  for (const event of events) {
    const step = wheelStep(state, { deltaY: event.deltaY, deltaX: event.deltaX ?? 0, now: event.at, scrollTop: event.scrollTop, folded });
    state = step.state;
    pull = step.pull;
    if (step.action === 'fold') folded = true;
    if (step.action === 'open') folded = false;
  }
  return { folded, pull };
}

/** A straight finger drag from one y to another over `ms`, in six moves. */
function swipe(from: number, to: number, ms: number, scrollTop: number, folded: boolean) {
  let state: TouchState = touchStart({ x: 100, y: from, now: 0, scrollTop });
  for (let i = 1; i <= 6; i++) {
    const step = touchMove(state, { x: 100, y: from + ((to - from) * i) / 6, now: (ms * i) / 6, scrollTop, folded });
    state = step.state;
    if (step.action === 'fold') folded = true;
    if (step.action === 'open') folded = false;
  }
  const end: FoldAction = touchEnd(state, { folded });
  if (end === 'open') folded = false;
  return folded;
}

describe('wheel and trackpad', () => {
  it('folds on a small scroll down the plan', () => {
    expect(wheel([{ deltaY: 4, at: 0, scrollTop: 0 }, { deltaY: 4, at: 16, scrollTop: 4 }], false).folded).toBe(true);
  });

  it('does not fold on a sideways drag along the timeline', () => {
    expect(wheel([{ deltaY: 10, deltaX: 40, at: 0, scrollTop: 0 }], false).folded).toBe(false);
  });

  it('stays folded while scrolling back up mid-page', () => {
    expect(wheel([{ deltaY: -80, at: 0, scrollTop: 300 }, { deltaY: -80, at: 16, scrollTop: 220 }], true).folded).toBe(true);
  });

  it('does not open when momentum runs into the top in the same gesture', () => {
    const events = [
      { deltaY: -60, at: 0, scrollTop: 120 },
      { deltaY: -60, at: 16, scrollTop: 0 },
      { deltaY: -60, at: 32, scrollTop: 0 },
    ];
    expect(wheel(events, true).folded).toBe(true);
  });

  it('opens on a fresh pull of 70px at the top, and reports progress on the way', () => {
    const start = GESTURE_GAP_MS + 1;
    expect(wheel([{ deltaY: -30, at: start, scrollTop: 0 }], true)).toEqual({ folded: true, pull: 30 / 70 });
    expect(wheel([{ deltaY: -30, at: start, scrollTop: 0 }, { deltaY: -45, at: start + 16, scrollTop: 0 }], true).folded).toBe(false);
  });
});

describe('touch', () => {
  it('folds on a slow small swipe up, even in tiny steps', () => {
    expect(swipe(300, 290, 150, 300, false)).toBe(true);
  });

  it('stays folded on a normal drag down mid-page', () => {
    expect(swipe(300, 360, 300, 300, true)).toBe(true);
  });

  it('stays folded on a fast but short flick', () => {
    expect(swipe(300, 330, 15, 300, true)).toBe(true);
  });

  it('opens on a hard flick down from anywhere', () => {
    expect(swipe(200, 320, 60, 300, true)).toBe(false);
  });

  it('opens on a slow pull of 70px at the top, not 50px', () => {
    expect(swipe(200, 250, 400, 0, true)).toBe(true);
    expect(swipe(200, 280, 400, 0, true)).toBe(false);
  });

  it('does not open on a pull that began below the top', () => {
    let state: TouchState = touchStart({ x: 100, y: 200, now: 0, scrollTop: 40 });
    const step = touchMove(state, { x: 100, y: 300, now: 500, scrollTop: 0, folded: true });
    state = step.state;
    expect(step.action).toBeNull();
    expect(touchEnd(state, { folded: true })).toBeNull();
  });
});
