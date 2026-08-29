// The deferred first-release prompt (2026-08-28, founder call). Supersedes
// URG-217's immediate open: a zero-release account now lands on the workspace,
// sees it, and is OFFERED the create modal about half a minute in — once per
// browser session — instead of being met by it instantly. The founder's read
// was that the instant pop-up churned people who wanted to look around first.
//
// Pure state logic here so the countdown maths and the once-per-session rule
// are unit-testable; components/releases/useFirstReleasePrompt.ts owns the
// timer, the fire-time guards, and the modal callback.
//
// WHY sessionStorage: the countdown must SPAN the two surfaces that can host
// the prompt (/dashboard and /dashboard/urgans) — a per-mount timer would
// restart on every navigation and a user hopping between pages would never be
// prompted, or worse, be prompted on every page. Per tab, so a fresh session
// re-arms: a returning zero-release user gets one gentle re-prompt per visit.
//
// FAIL DIRECTION — the opposite of lib/first-release-required.ts, on purpose.
// The predicate fails OPEN (uncertain ⇒ not required) because a wrong `true`
// used to wall people in. THIS module fails CLOSED (storage broken ⇒ never
// auto-open) because the only cost of silence is that the prompt never offers
// itself — the "No releases yet" empty state and its Create release button
// remain the standing surface. armPrompt returning null is load-bearing: a
// caller that armed a timer without a stored armedAt would be running a
// private countdown that restarts on every mount.

/** Settle delay before the prompt offers itself — long enough to scan the
 *  empty workspace and click around once, short enough that someone who is
 *  ready isn't left hunting (the empty-state CTA is there sooner anyway). */
export const FIRST_RELEASE_PROMPT_DELAY_MS = 30_000;

export const FIRST_RELEASE_PROMPT_KEY = 'urganize.first-release.prompt';

/** armedAt: epoch ms the countdown started (the first time the predicate held
 *  this session). shownAt: epoch ms the prompt fired — or was consumed
 *  silently by a fire-time guard (another modal open, mid-conversation). */
export type FirstReleasePromptState = {
  armedAt: number;
  shownAt?: number;
};

export type FirstReleasePromptDecision =
  | { action: 'arm' }
  | { action: 'wait'; remainingMs: number }
  | { action: 'fire' }
  | { action: 'done' };

export function isFirstReleasePromptState(value: unknown): value is FirstReleasePromptState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as FirstReleasePromptState;
  if (typeof state.armedAt !== 'number' || !Number.isFinite(state.armedAt)) return false;
  if (state.shownAt !== undefined) {
    if (typeof state.shownAt !== 'number' || !Number.isFinite(state.shownAt)) return false;
  }
  return true;
}

/**
 * The whole decision, pure. `shownAt` outranks everything — once per session
 * means once, however stale the rest of the state looks. A future `armedAt`
 * (clock skew, hand-edited storage) clamps to a full delay rather than being
 * trusted: a bad clock must never produce an hour-long ambush.
 */
export function decideFirstReleasePrompt(
  state: FirstReleasePromptState | null,
  now: number
): FirstReleasePromptDecision {
  if (!state) return { action: 'arm' };
  if (state.shownAt !== undefined) return { action: 'done' };
  const elapsed = now - state.armedAt;
  if (elapsed >= FIRST_RELEASE_PROMPT_DELAY_MS) return { action: 'fire' };
  const remainingMs = Math.min(
    Math.max(FIRST_RELEASE_PROMPT_DELAY_MS - elapsed, 0),
    FIRST_RELEASE_PROMPT_DELAY_MS
  );
  return { action: 'wait', remainingMs };
}

// Storage plumbing — the planner-intake-draft shape (typeof window guard +
// try/catch), with reads strictly validated so junk counts as "nothing".

export function readPromptState(): FirstReleasePromptState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(FIRST_RELEASE_PROMPT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFirstReleasePromptState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Start the countdown. Returns the stored state, or null when the write
 *  failed — and on null the caller must NOT set a timer (see the fail-
 *  direction note above). */
export function armPrompt(now: number): FirstReleasePromptState | null {
  if (typeof window === 'undefined') return null;
  const state: FirstReleasePromptState = { armedAt: now };
  try {
    window.sessionStorage.setItem(FIRST_RELEASE_PROMPT_KEY, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

/** Record the prompt as spent for this session — fired for real, or consumed
 *  silently by a guard. Best effort: if this write fails the worst case is a
 *  second prompt later in the session, which is the tolerable direction. */
export function markPromptShown(now: number): void {
  if (typeof window === 'undefined') return;
  const state = readPromptState();
  try {
    window.sessionStorage.setItem(
      FIRST_RELEASE_PROMPT_KEY,
      JSON.stringify({ armedAt: state?.armedAt ?? now, shownAt: now } satisfies FirstReleasePromptState)
    );
  } catch {
    // Blocked storage. The hook only reaches markPromptShown once per armed
    // timer, so the practical effect is "once per mount" instead of "once per
    // session" — more prompts than intended, never a wall.
  }
}
