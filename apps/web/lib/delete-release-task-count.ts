/**
 * How many activities a rollout holds, for the delete confirmation
 * (DeleteReleaseDialog), and the words the dialog says about it.
 *
 * Why this exists (v1.92.2): the dialog used to be handed a count taken from
 * the client task store (`tasks.filter(t => t.releaseId === id).length`). That
 * store is empty before the first load, can be a stale cached copy, and is
 * capped at TASK_LIST_MAX_ROWS across the whole workspace, so it read 0 for a
 * rollout with 32 activities, and a 0 made the dialog say "This permanently
 * deletes the rollout and all attached files", as if it were empty. The count
 * now comes from the server (GET /api/releases/[releaseId]'s exact head-only
 * `retention.taskCount`), and until it is known the dialog never words itself
 * as if the rollout were empty.
 *
 * Pure apart from `fetchReleaseTaskCount`, whose fetch is injectable.
 */

export type ReleaseTaskCountState =
  | { status: 'loading' }
  | { status: 'known'; count: number }
  | { status: 'unknown' };

/** How long the dialog waits for the count before it gives up and uses the
 * wording that names no number. Deletion is never blocked past this. */
export const TASK_COUNT_TIMEOUT_MS = 8000;

/** Reads `retention.taskCount` from GET /api/releases/[releaseId]'s body.
 * Anything that is not a whole, non-negative number is "unknown" (null),
 * never 0. */
export function parseReleaseTaskCount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const retention = (payload as { retention?: unknown }).retention;
  if (!retention || typeof retention !== 'object') return null;
  const count = (retention as { taskCount?: unknown }).taskCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
  return count;
}

/**
 * Asks the server how many activities the rollout holds. Resolves to a
 * `known` or `unknown` state and never throws: a failed request, a non-2xx
 * answer, a body without the count, or a timeout all resolve to `unknown`.
 */
export async function fetchReleaseTaskCount(
  releaseId: string,
  accessToken: string,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<Exclude<ReleaseTaskCountState, { status: 'loading' }>> {
  if (!releaseId || !accessToken) return { status: 'unknown' };
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? TASK_COUNT_TIMEOUT_MS;

  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    const request = (async () => {
      const response = await fetchImpl(`/api/releases/${encodeURIComponent(releaseId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = (await response.json().catch(() => null)) as unknown;
      return parseReleaseTaskCount(payload);
    })().catch(() => null);

    const count = await Promise.race([request, timeout]);
    return count === null ? { status: 'unknown' } : { status: 'known', count };
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * The sentence under "Delete <title>?". Only a KNOWN zero may leave the
 * activities out; loading and unknown both say activities go with it, so the
 * dialog can never read as "this rollout is empty" when it is not.
 */
export function describeReleaseDeletion(state: ReleaseTaskCountState): string {
  const tail = 'This can\u2019t be undone.';
  if (state.status === 'known') {
    if (state.count === 0) {
      return `This permanently deletes the rollout and all attached files. ${tail}`;
    }
    const noun = state.count === 1 ? 'activity' : 'activities';
    return `This permanently deletes the rollout, its ${state.count} ${noun}, and all attached files. ${tail}`;
  }
  return `This permanently deletes the rollout, all of its activities, and all attached files. ${tail}`;
}

/** The small line under the sentence while the count is not settled. */
export function describeTaskCountStatus(state: ReleaseTaskCountState): string | null {
  if (state.status === 'loading') return 'Counting its activities\u2026';
  if (state.status === 'unknown') return 'We couldn\u2019t count its activities right now.';
  return null;
}

/** The Delete button waits while the count loads, never longer than the
 * timeout (which turns `loading` into `unknown`). */
export function isDeleteBlockedByCount(state: ReleaseTaskCountState): boolean {
  return state.status === 'loading';
}
