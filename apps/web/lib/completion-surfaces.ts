/**
 * The bottom of the screen after an activity is ticked off holds at most ONE
 * thing: the cover art ask, the vouch, the "how did it go?" check-in, or the
 * Undo toast. These four live as separate slots in `useTaskStore`, and the
 * slots used to be written independently (`snapshot ?? state.x`), so ticking
 * off a second activity while the first one's sheet was still open left both
 * set and both sheets mounted at once.
 *
 * This is the one rule for moving between those states. Every writer in the
 * store that OPENS a surface goes through it; the writers that only CLOSE one
 * (dismiss, reopen, rollback) cannot create a second open slot and stay as
 * they are.
 */

/** Priority order, highest first. Cover art wins because it is actionable. */
export const COMPLETION_SURFACE_ORDER = [
  'coverArtPrompt',
  'vouchPrompt',
  'outcomePrompt',
  'completionToast',
] as const;

export type CompletionSurfaceKey = (typeof COMPLETION_SURFACE_ORDER)[number];

type Slots<S extends Record<CompletionSurfaceKey, unknown>> = Pick<S, CompletionSurfaceKey>;

/**
 * The slots after a completion offers `incoming`.
 *
 * - The new completion offers something: that surface opens and every other
 *   one closes. If a caller offers more than one, the priority above decides.
 * - It offers nothing (quiet mode, a bulk tick with nothing done): whatever is
 *   open stays open, unchanged.
 */
export function nextCompletionSurfaces<S extends Record<CompletionSurfaceKey, unknown>>(
  current: S,
  incoming: Partial<{ [K in CompletionSurfaceKey]: S[K] | null }>
): Slots<S> {
  const winner = COMPLETION_SURFACE_ORDER.find(
    (key) => incoming[key] !== undefined && incoming[key] !== null
  );
  if (!winner) {
    return {
      completionToast: current.completionToast,
      outcomePrompt: current.outcomePrompt,
      coverArtPrompt: current.coverArtPrompt,
      vouchPrompt: current.vouchPrompt,
    } as Slots<S>;
  }
  const next = {
    completionToast: null,
    outcomePrompt: null,
    coverArtPrompt: null,
    vouchPrompt: null,
  } as Record<CompletionSurfaceKey, unknown>;
  next[winner] = incoming[winner];
  return next as Slots<S>;
}
