/**
 * One client-side path to `POST /api/releases/[releaseId]/schedule` — the
 * route that sets a release date (and optionally a name) and, for a
 * plan-waiting release, builds the rollout plan.
 *
 * Shared by SetReleaseDateCard (the in-panel prompt) and ReleaseSetupSheet
 * (the type-first nudge), so the 207 handling and the toast copy cannot
 * drift between the two surfaces asking the same question. The schedule
 * route is deliberately the ONLY write path here: `PATCH /api/releases/[id]`
 * is a full-row PUT that nulls omitted fields (documented in that route),
 * so a sparse title+date write must never go through it.
 *
 * The pure response→outcome mapping lives in lib/schedule-release-outcome.ts
 * (vitest-covered, import-free); this wraps it with the token read, the
 * fetch, and the store refresh that makes the date card unmount.
 */

import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import {
  interpretScheduleResponse,
  type SchedulePayload,
  type ScheduleReleaseOutcome,
} from '@/lib/schedule-release-outcome';

export type { ScheduleReleaseOutcome } from '@/lib/schedule-release-outcome';

export async function scheduleRelease(
  releaseId: string,
  input: { releaseDate: string; title?: string }
): Promise<ScheduleReleaseOutcome> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token || '';
    if (!accessToken) {
      return { kind: 'error', message: 'Session expired. Please sign in again.' };
    }

    const response = await fetch(`/api/releases/${releaseId}/schedule`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        releaseDate: input.releaseDate,
        title: input.title?.trim() || undefined,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as SchedulePayload;
    const outcome = interpretScheduleResponse(response.status, payload);

    // The refresh is what unmounts the date card / updates the activities
    // list. On a clean save it is awaited so the caller's busy state holds
    // until the new plan is actually in the store; on 207 the date still
    // changed, so refresh without holding the caller hostage to it.
    if (outcome.kind === 'saved') {
      await useReleaseStore.getState().loadCommandCenter({ force: true });
    } else if (outcome.kind === 'partial') {
      void useReleaseStore.getState().loadCommandCenter({ force: true });
    }

    return outcome;
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Could not save the release date.',
    };
  }
}
