// Browser-side helpers for embedded UrgAns actions. Two jobs: run
// release.draft_plan (trying the new gated endpoint first, falling back to
// the legacy, ungated /plan/generate route when the feature is switched off
// so the planner keeps working exactly as it always has), and apply/discard
// a run once it has an actionId.
//
// A CLIENT-SIDE TIMEOUT, DELIBERATELY — there is no client-side fetch timeout
// anywhere else in this codebase (every other planner call just awaits
// indefinitely), but this is the spec's own acceptance line for the embedded
// actions feature, so it is honored here rather than silently dropped.

import { supabase } from '@/lib/supabase/client';
import { buildAutoIntake, type ReleasePlanIntake } from '@/lib/release-planning';

const CLIENT_TIMEOUT_MS = 60_000;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function postJson(
  url: string,
  token: string,
  body: unknown,
  timeoutMs: number = CLIENT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a status + the server's own message into what the caller shows,
 *  always ending "No changes made." for anything past a plain validation
 *  error — nothing on this path ever leaves the release half-drafted. */
function classifyRunError(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  if (status === 429) return 'UrgAns is busy. Try again in a bit. No changes made.';
  if (status === 503 || status === 504) return 'UrgAns is unavailable right now. No changes made.';
  return 'Could not draft the plan. No changes made.';
}

export type DraftReleasePlanParams = {
  releaseId: string;
  release: { releaseType?: string | null; artistName?: string | null; releaseDate?: string | null };
  /** Present for the refine path (the seven-question modal's answers).
   *  Absent means the one-tap path: the gated endpoint derives it server-side
   *  via buildAutoIntake, and the legacy fallback derives the identical
   *  intake client-side with the same function. */
  intake?: ReleasePlanIntake;
  replace?: boolean;
};

export type DraftReleasePlanResult =
  | { ok: true; actionId: string | null }
  | {
      ok: false;
      status: number;
      error: string;
      /** Set only on the entitlement refusal, so the caller can render
       *  UrgansLockedSheet instead of a generic error toast. */
      reason?: 'plan_required';
      minimumPlan?: string;
    };

async function draftReleasePlanLegacy(
  params: DraftReleasePlanParams,
  token: string
): Promise<DraftReleasePlanResult> {
  const { releaseId, release, intake, replace } = params;
  const resolvedIntake =
    intake ??
    buildAutoIntake({
      release_type: release.releaseType,
      artist_name: release.artistName,
      release_date: release.releaseDate,
    });

  try {
    const response = await postJson(`/api/releases/${releaseId}/plan/generate`, token, {
      intake: resolvedIntake,
      replace: replace === true,
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, status: response.status, error: classifyRunError(response.status, payload.error) };
    }
    return { ok: true, actionId: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, status: 504, error: 'That took too long. Try again. No changes made.' };
    }
    return { ok: false, status: 0, error: 'Could not reach UrgAns. Try again. No changes made.' };
  }
}

/**
 * Draft a release's rollout plan. Tries the new gated action endpoint first;
 * on a 404 (NEXT_PUBLIC_FEATURE_URGANS_ACTIONS is off), falls back to the
 * legacy, ungated /plan/generate route so the planner behaves exactly as it
 * did before this feature existed — same one-tap UX, different transport.
 */
export async function draftReleasePlan(params: DraftReleasePlanParams): Promise<DraftReleasePlanResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, status: 401, error: 'Your session expired. Sign in again.' };
  }

  try {
    const response = await postJson('/api/urgans/actions', token, {
      actionType: 'release.draft_plan',
      objectId: params.releaseId,
      input: params.intake !== undefined ? { intake: params.intake, replace: params.replace === true } : undefined,
    });

    if (response.status === 404) {
      return draftReleasePlanLegacy(params, token);
    }

    const payload = (await response.json().catch(() => ({}))) as {
      actionId?: string;
      error?: string;
      reason?: string;
      minimumPlan?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: classifyRunError(response.status, payload.error),
        reason: payload.reason === 'plan_required' ? 'plan_required' : undefined,
        minimumPlan: payload.minimumPlan,
      };
    }

    return { ok: true, actionId: payload.actionId || null };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, status: 504, error: 'That took too long. Try again. No changes made.' };
    }
    return { ok: false, status: 0, error: 'Could not reach UrgAns. Try again. No changes made.' };
  }
}

export type RunActionApplyResult =
  | { ok: true; result: unknown }
  | { ok: false; status: number; error: string };

/** Apply a drafted action. Idempotent on the server, so a double call
 *  (a slow network retry, two tabs) is safe. */
export async function applyRunAction(actionId: string, token: string): Promise<RunActionApplyResult> {
  try {
    const response = await postJson(`/api/urgans/actions/${actionId}/apply`, token, {});
    const payload = (await response.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload.error || 'Could not schedule the plan. Your draft is untouched. Try again.',
      };
    }
    return { ok: true, result: payload.result };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Could not reach UrgAns. Your draft is untouched. Try again.',
    };
  }
}

export type RunActionDiscardResult = { ok: true } | { ok: false; status: number; error: string };

export async function discardRunAction(actionId: string, token: string): Promise<RunActionDiscardResult> {
  try {
    const response = await postJson(`/api/urgans/actions/${actionId}/discard`, token, {});
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, status: response.status, error: payload.error || 'Could not discard the plan.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach UrgAns.' };
  }
}

/**
 * A Solo team tapped Upgrade on the locked sheet. Ledger-only on the server
 * (no founder alert — see billing-events.ts) — best-effort and never allowed
 * to block the navigation it precedes.
 */
export async function trackUpgradeClicked(actionType: string): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    await fetch('/api/billing/track', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'upgrade_clicked', actionType }),
    });
  } catch {
    // Best-effort telemetry.
  }
}
