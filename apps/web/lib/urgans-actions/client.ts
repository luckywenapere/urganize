// Browser-side helpers for embedded UrgAns actions. Two jobs: build a
// rollout plan through release.draft_plan (trying the gated endpoint first,
// falling back to the ungated POST /api/releases/[id]/plan when the
// embedded-actions feature is switched off, so the planner keeps working
// exactly as it always has), and apply/discard a run once it has an actionId
// (the press kit's draft-a-section action still goes that way).
//
// A CLIENT-SIDE TIMEOUT, DELIBERATELY — there is no client-side fetch timeout
// anywhere else in this codebase, but this is the spec's own acceptance line
// for the embedded actions feature, so it is honored here rather than
// silently dropped. It matches the route's own 60s ceiling: the server hands
// the model a 52s deadline (PLANNER_DEADLINE_MS) and writes the activities in
// what is left, so a request the client is still waiting on at 60s is one
// the platform has already cut off.

import { supabase } from '@/lib/supabase/client';
import type { CreatedPlan, ReleasePlanIntake } from '@/lib/release-planning';

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
 *  always ending "Nothing was created." for anything past a plain validation
 *  error — a refused build never leaves the release half-planned. */
function classifyRunError(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  if (status === 429) return 'UrgAns is busy. Try again in a bit. Nothing was created.';
  if (status === 503 || status === 504) return 'UrgAns is unavailable right now. Nothing was created.';
  return 'Could not build the plan. Nothing was created.';
}

/**
 * Why a build was refused, when the server said. `plan_required` is the
 * entitlement gate (render UrgansLockedSheet, not a toast);
 * `tailoring_unavailable` is the model failing while the manager had typed
 * notes (nothing created, the answers are kept, offer to try again);
 * `tasks_exist` and `plan_in_progress` mean somebody got there first.
 */
export type CreatePlanRefusal =
  | 'plan_required'
  | 'tailoring_unavailable'
  | 'tasks_exist'
  | 'plan_in_progress'
  | 'missing_release_date';

const REFUSALS: readonly CreatePlanRefusal[] = [
  'plan_required',
  'tailoring_unavailable',
  'tasks_exist',
  'plan_in_progress',
  'missing_release_date',
];

function readRefusal(payload: { reason?: unknown; code?: unknown }): CreatePlanRefusal | undefined {
  for (const candidate of [payload.reason, payload.code]) {
    if (typeof candidate === 'string' && (REFUSALS as readonly string[]).includes(candidate)) {
      return candidate as CreatePlanRefusal;
    }
  }
  return undefined;
}

export type CreateReleasePlanParams = {
  releaseId: string;
  /** The planning questions' answers. Required: the plan is shaped by them,
   *  and nothing here invents an intake from the release row any more. */
  intake: ReleasePlanIntake;
};

export type CreateReleasePlanResult =
  | { ok: true; plan: CreatedPlan }
  | {
      ok: false;
      status: number;
      error: string;
      reason?: CreatePlanRefusal;
      minimumPlan?: string;
    };

/** The gated route answers `{ actionId, output }` with the plan as the
 *  output; the plain route answers `{ plan }`. Either way the plan is the
 *  thing with a task count on it. */
function readCreatedPlan(payload: Record<string, unknown>): CreatedPlan | null {
  for (const candidate of [payload.plan, payload.output]) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as { tasksCreated?: unknown }).tasksCreated === 'number'
    ) {
      return candidate as CreatedPlan;
    }
  }
  return null;
}

function failureFromThrown(error: unknown): CreateReleasePlanResult {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { ok: false, status: 504, error: 'That took too long. Try again. Nothing was created.' };
  }
  return { ok: false, status: 0, error: 'Could not reach UrgAns. Try again. Nothing was created.' };
}

async function createReleasePlanDirect(
  params: CreateReleasePlanParams,
  token: string
): Promise<CreateReleasePlanResult> {
  try {
    const response = await postJson(`/api/releases/${params.releaseId}/plan`, token, {
      intake: params.intake,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: classifyRunError(response.status, typeof payload.error === 'string' ? payload.error : undefined),
        reason: readRefusal(payload),
      };
    }
    const plan = readCreatedPlan(payload);
    if (!plan) return builtButUnreported();
    return { ok: true, plan };
  } catch (error) {
    return failureFromThrown(error);
  }
}

/** A 2xx with no plan in it. The activities exist by then, so this must not
 *  read like a refusal — "nothing was created" would be a lie. */
function builtButUnreported(): CreateReleasePlanResult {
  return {
    ok: false,
    status: 502,
    error: 'The plan was built, but UrgAns could not report on it. Reload to see the activities.',
  };
}

/**
 * Build a rollout's plan from the planning questions' answers. Tries the
 * gated action endpoint first; on a 404 (NEXT_PUBLIC_FEATURE_URGANS_ACTIONS
 * is off), falls back to the ungated plan route so the planner behaves
 * exactly as it did before the embedded-actions feature existed — same
 * questions, same plan, different transport.
 */
export async function createReleasePlan(params: CreateReleasePlanParams): Promise<CreateReleasePlanResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, status: 401, error: 'Your session expired. Sign in again.' };
  }

  try {
    const response = await postJson('/api/urgans/actions', token, {
      actionType: 'release.draft_plan',
      objectId: params.releaseId,
      input: { intake: params.intake },
    });

    if (response.status === 404) {
      return createReleasePlanDirect(params, token);
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: classifyRunError(response.status, typeof payload.error === 'string' ? payload.error : undefined),
        reason: readRefusal(payload),
        minimumPlan: typeof payload.minimumPlan === 'string' ? payload.minimumPlan : undefined,
      };
    }

    const plan = readCreatedPlan(payload);
    if (!plan) return builtButUnreported();
    return { ok: true, plan };
  } catch (error) {
    return failureFromThrown(error);
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
        error: payload.error || 'Could not apply that. Your draft is untouched. Try again.',
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
      return { ok: false, status: response.status, error: payload.error || 'Could not discard that.' };
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
