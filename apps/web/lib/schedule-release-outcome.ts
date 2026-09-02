/**
 * The pure half of lib/schedule-release-client.ts — mapping a
 * `POST /api/releases/[releaseId]/schedule` response onto what the two
 * calling surfaces (SetReleaseDateCard, ReleaseSetupSheet) should say.
 * Kept import-free so vitest can hold it without the supabase client's
 * env-var requirement.
 */

export type ScheduleReleaseOutcome =
  /** Date saved; plan built (or nothing was pending). `message` is the toast. */
  | { kind: 'saved'; message: string }
  /** HTTP 207: the date IS saved but the plan build failed. Show `message`
   * in place — throwing here would misrepresent what happened. */
  | { kind: 'partial'; message: string }
  | { kind: 'error'; message: string };

export type SchedulePayload = {
  error?: string;
  activitiesCreated?: unknown;
};

export function interpretScheduleResponse(
  status: number,
  payload: SchedulePayload
): ScheduleReleaseOutcome {
  if (status === 207) {
    return {
      kind: 'partial',
      message:
        payload.error || 'Your release date was saved, but the plan could not be built.',
    };
  }
  if (status < 200 || status >= 300) {
    return {
      kind: 'error',
      message: payload.error || 'Could not save the release date.',
    };
  }
  const created = Number(payload.activitiesCreated || 0);
  return {
    kind: 'saved',
    message:
      created > 0 ? `Release date set. ${created} activities scheduled.` : 'Release date set.',
  };
}
