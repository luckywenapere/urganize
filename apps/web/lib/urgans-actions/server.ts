// The I/O half of embedded UrgAns actions: resolve who may act on what and at
// what plan tier, run an action, apply its draft, or discard it. Pure decision
// logic (the claim state machine, the daily guard) lives in sibling files;
// this is where those decisions become conditional database writes.
//
// THREE THINGS THIS FILE DOES NOT DO, on purpose:
//  - It never reads the CALLER's own tier. Every check is against the
//    RELEASE OWNER's team (via resolveActionScope -> getWorkspaceTier), the
//    same rule invite-link redemption already established: a teammate acting
//    on someone else's release is gated by that release's plan, not their own
//    empty-shell trial.
//  - It never returns a NextResponse. Every function here returns a plain
//    { ok, ... } discriminated union — the boundary
//    lib/release-planning-actions-server.ts already draws, for the same
//    reason: an action runner is not an HTTP handler.
//  - It never writes the row's status to 'applied' anywhere but inside the
//    conditional UPDATE that IS the claim. Anything that reads the row first
//    and writes 'applied' second, unconditionally, would recreate the exact
//    race decideApplyClaim exists to close.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { PricingTierId } from '@urganize/pricing';
import { PRICING_TIERS } from '@urganize/pricing';

import { getEntitlement, minimumTierWith } from '../entitlements';
import { getWorkspaceTier } from '../team-billing-server';
import { logBillingEvent } from '../billing-events-server';
import { isReleasePlannerEnabled } from '../release-planning';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  type ReleaseAccessSummary,
} from '../release-access-server';
import { ensurePressKitAccess } from '../press-kit-access-server';
import { checkEmbeddedActionsGuard } from './guard-server';
import { getTeamAccessForUser } from '../team-billing-server';
import { beginEmbeddedRun, settleEmbeddedRun } from '../credits/embedded-server';
import { recordRequestUsage } from '../ai/usage-log-server';
import { usageFeatureForAction } from './usage-feature';
import { isCreditsEnabled } from '../credits/config';
import { embeddedCharge, embeddedUsageSummary } from '../credits/embedded';
import { decideApplyClaim, type UrgansActionRowForClaim } from './claim';
import { getUrgansAction } from './registry';
import type { UrgansActionAccessLevel, UrgansActionObjectType } from './types';

export const URGANS_ACTIONS_TABLE = 'urgans_actions';

/**
 * The embedded-actions surface stays dark until BOTH flags are on: its own,
 * and the release planner's — release.draft_plan is worthless without a
 * planner to draft into, and the migration behind it
 * (release_plan_drafts) is the planner's own. Checked here so every route
 * (run/apply/discard) agrees on the same combined answer rather than three
 * copies of the AND.
 */
export function isUrgansActionsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_URGANS_ACTIONS === 'true' && isReleasePlannerEnabled();
}

// ── Scope: who is this, acting on what, at what tier ────────────────────────

export type ActionScope = {
  objectType: UrgansActionObjectType;
  /** Present only for a release action. Nothing downstream reads it today —
   *  an action's execute() gets the objectId and re-reads whatever it needs —
   *  but it costs nothing to carry and a release action that wants the summary
   *  should take it from here rather than reading the row a second time. */
  release: ReleaseAccessSummary | null;
  ownerUserId: string;
  workspaceId: string | null;
  tier: PricingTierId;
};

export type ResolveActionScopeResult =
  | { ok: true; scope: ActionScope }
  | { ok: false; status: number; error: string };

/** The owner-workspace lookup every tier check needs. A small private
 *  duplicate rather than a shared helper — lib/release-cap-server.ts's own
 *  findOwnedWorkspaceId is the established convention for exactly this
 *  query, and it stays private to its own module too. */
async function findOwnedWorkspaceId(
  admin: SupabaseClient,
  ownerUserId: string
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('workspaces')
      .select('id')
      .eq('owner_id', ownerUserId)
      .maybeSingle();
    if (error || !data) return null;
    return String((data as { id: string }).id) || null;
  } catch {
    return null;
  }
}

/** Read the { status, error } an access-check NextResponse already carries,
 *  so this module can stay decoupled from NextResponse in its own return
 *  types. Safe to consume: the response was just constructed and nothing has
 *  read its body yet. */
async function unwrapAccessError(
  response: NextResponse
): Promise<{ status: number; error: string }> {
  const status = response.status;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error) {
      return { status, error: body.error };
    }
  } catch {
    // Fall through to the generic message below.
  }
  return { status, error: 'Could not check rollout access.' };
}

/**
 * Resolve access + tier for one action acting on one object.
 *
 * Takes only the one field it reads (`access`) rather than a full
 * UrgansActionDefinition — that type is generic over Input/Output/Result, and
 * this function needs none of the three, so accepting the whole thing would
 * just invite an unnecessary generic-inference fight at every call site.
 *
 * TWO object types now. Each resolves through its own access check, and both
 * checks answer the same question the same way: a member of the owning team
 * may act, a guest is read-only, and a non-member gets a 404 that does not
 * confirm the thing exists. ensurePressKitAccess reuses decideReleaseAccess
 * for exactly that reason — one rule, several object types — so adding this
 * branch did not add a second access model, only a second way in.
 *
 * An action declares ONE object type today. registry-guard.test.ts asserts
 * that, because this function has to pick a single access check and a list of
 * two would make that choice arbitrary.
 *
 * Tier resolution FAILS OPEN, matching every other tier check in this
 * codebase (lib/release-cap-server.ts, lib/seats-server.ts): an unresolvable
 * workspace or an unresolvable tier both resolve to 'label', which is
 * uncapped. A team whose plan we cannot confidently place on a lower tier
 * must never be refused an action it may already be paying for.
 */
export async function resolveActionScope(
  admin: SupabaseClient,
  action: { access: UrgansActionAccessLevel; objectTypes: UrgansActionObjectType[] },
  objectId: string,
  user: User
): Promise<ResolveActionScopeResult> {
  // One object type per action — see the note above, and the registry-guard
  // test that holds it. Defaulting to 'release' keeps a malformed definition
  // on the path that has always existed rather than silently reaching a
  // different access check.
  const objectType: UrgansActionObjectType = action.objectTypes[0] || 'release';
  // 'owner_write' resolves through READ access, not write — the ownership
  // check right below is the real gate, and routing it through write access
  // first would 403 a read-only guest before we ever got to that check,
  // leaking "you have SOME access here" to someone who should see nothing
  // but a plain 404. Team read access is also what makes the 404 itself
  // visibility-preserving: a non-member gets exactly the same refusal a
  // non-owner MEMBER gets, and neither can be told apart from "does not
  // exist" — see the access-level comment in ./types.ts.
  const write = action.access === 'team_write';

  if (objectType === 'press_kit') {
    const kitAccess = await ensurePressKitAccess(admin, objectId, user, write);
    if ('error' in kitAccess) {
      const unwrapped = await unwrapAccessError(kitAccess.error);
      return { ok: false, ...unwrapped };
    }
    if (action.access === 'owner_write' && kitAccess.ownerUserId !== user.id) {
      return { ok: false, status: 404, error: 'Press kit not found.' };
    }

    const kitWorkspaceId = await findOwnedWorkspaceId(admin, kitAccess.ownerUserId);
    const kitTier = kitWorkspaceId ? await getWorkspaceTier(kitWorkspaceId) : null;

    return {
      ok: true,
      scope: {
        objectType,
        release: null,
        ownerUserId: kitAccess.ownerUserId,
        workspaceId: kitWorkspaceId,
        tier: kitTier ?? 'label',
      },
    };
  }

  const access = write
    ? await ensureReleaseTeamWriteAccess(admin, objectId, user)
    : await ensureReleaseTeamReadAccess(admin, objectId, user);

  if ('error' in access) {
    const unwrapped = await unwrapAccessError(access.error);
    return { ok: false, ...unwrapped };
  }

  if (action.access === 'owner_write' && access.release.ownerUserId !== user.id) {
    return { ok: false, status: 404, error: 'Rollout not found.' };
  }

  const release = access.release;
  const workspaceId = await findOwnedWorkspaceId(admin, release.ownerUserId);
  const tier = workspaceId ? await getWorkspaceTier(workspaceId) : null;

  return {
    ok: true,
    scope: {
      objectType,
      release,
      ownerUserId: release.ownerUserId,
      workspaceId,
      tier: tier ?? 'label',
    },
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────

export type RunActionParams = {
  actionType: string;
  objectId: string;
  actor: User;
  input?: unknown;
};

export type RunActionResult =
  | { ok: true; actionId: string; output: unknown }
  | {
      ok: false;
      status: number;
      error: string;
      /** Set only on the entitlement refusal, so the client can render the
       *  locked sheet rather than a generic error. */
      reason?: 'plan_required' | 'out_of_credits';
      minimumPlan?: PricingTierId;
    };

/**
 * Run one embedded action: check access, check the entitlement, check the
 * runaway-usage guard, call the action's own execute(), and log exactly one
 * urgans_actions row either way. This is the "draft" step — nothing product
 * data is written here; that is Apply's job.
 */
export async function runUrgansAction(
  admin: SupabaseClient,
  params: RunActionParams
): Promise<RunActionResult> {
  const action = getUrgansAction(params.actionType);
  if (!action) return { ok: false, status: 404, error: 'Not found.' };

  const scopeResult = await resolveActionScope(admin, action, params.objectId, params.actor);
  if (!scopeResult.ok) return { ok: false, status: scopeResult.status, error: scopeResult.error };
  const { scope } = scopeResult;

  const allowed = getEntitlement(scope.tier, 'urgans_embedded_actions');
  if (!allowed) {
    if (scope.workspaceId) {
      await logBillingEvent(admin, {
        workspaceId: scope.workspaceId,
        ownerUserId: scope.ownerUserId,
        actorUserId: params.actor.id,
        type: 'upgrade_prompt_shown',
        metadata: { actionType: action.id },
      });
    }
    const minimumPlan = minimumTierWith('urgans_embedded_actions');
    const planLabel = minimumPlan ? PRICING_TIERS[minimumPlan].label : 'a higher plan';
    return {
      ok: false,
      status: 403,
      error: `UrgAns can ${action.label.toLowerCase()} for you on ${planLabel}.`,
      reason: 'plan_required',
      minimumPlan: minimumPlan ?? undefined,
    };
  }

  // The daily runaway guard is the credit-less world's only brake on usage. With
  // credits on (founder spec, 2026-10-01) the balance replaces it: every run
  // costs real credits, so a busy team is stopped by running out, not by a
  // blanket count that would refuse someone who has paid for more.
  if (scope.workspaceId && !isCreditsEnabled()) {
    const guard = await checkEmbeddedActionsGuard(admin, {
      workspaceId: scope.workspaceId,
      ownerUserId: scope.ownerUserId,
      actorUserId: params.actor.id,
    });
    if (!guard.allowed) {
      return { ok: false, status: 429, error: guard.message };
    }
  }

  // Credits, when switched on: the hold. The run starts only if the balance
  // covers it (embedded.ts), and is charged only if it succeeds, so a refusal
  // here costs nothing. 429 and not 402, which the browser turns into a redirect
  // to the paywall. Which team pays: the OWNER's, the same as the entitlement.
  const ownerTeam = await getTeamAccessForUser(scope.ownerUserId, null);
  const gate = await beginEmbeddedRun(admin, {
    workspaceId: ownerTeam.primaryWorkspaceId ?? scope.workspaceId,
    ownerUserId: scope.ownerUserId,
    team: ownerTeam,
  });
  if (gate.metered && !gate.ok) {
    return { ok: false, status: 429, error: gate.message, reason: 'out_of_credits' };
  }

  const outcome = await action.execute({
    admin,
    objectId: params.objectId,
    actor: { id: params.actor.id, email: params.actor.email },
    ownerUserId: scope.ownerUserId,
    workspaceId: scope.workspaceId,
    tier: scope.tier,
    input: params.input,
  });

  // A ONE-SHOT action's execute() already did the whole job — there is no
  // draft awaiting a later Apply, so the row is logged as already 'applied'
  // and `output` is mirrored into `applied_result` right here. That mirror is
  // what makes decideApplyClaim's return_cached path fire on a stray later
  // call to POST .../apply, so such an action's own apply() (which does not
  // exist) is never reached. This is the smallest change that keeps
  // decideApplyClaim itself untouched: it still only ever reads the row, and
  // a one-shot row simply always answers 'applied' with a result already on
  // it.
  const oneShot = outcome.ok && action.oneShot === true;

  const insert = await admin
    .from(URGANS_ACTIONS_TABLE)
    .insert({
      workspace_id: scope.workspaceId,
      owner_user_id: scope.ownerUserId,
      actor_user_id: params.actor.id,
      plan_at_time: scope.tier,
      action_type: action.id,
      // From the scope, NEVER a literal. This was hardcoded 'release' until
      // 2026-09-07, so every embedded press-kit draft was filed as a release —
      // wrong in the console's own object grouping, and enough to make any
      // lookup filtering on object_type never find a kit's own drafted run.
      object_type: scope.objectType,
      object_id: params.objectId,
      status: outcome.ok ? (oneShot ? 'applied' : 'drafted') : 'failed',
      // What the run used goes on EVERY run (credits on or off), so flat prices
      // can be decided later from real runs: model, input, cached and output
      // tokens per call, and what was charged.
      input_summary: outcome.ok
        ? {
            ...outcome.inputSummary,
            usage: embeddedUsageSummary(outcome.usageCalls ?? [], embeddedCharge(outcome.usageCalls ?? [])),
          }
        : {},
      output: outcome.ok ? outcome.output : null,
      applied_result: oneShot ? (outcome as { output: unknown }).output : null,
      applied_at: oneShot ? new Date().toISOString() : null,
      model: outcome.ok ? outcome.model : null,
      prompt_version: action.promptVersion,
      tokens_in: outcome.ok ? outcome.tokensIn : null,
      tokens_out: outcome.ok ? outcome.tokensOut : null,
      error: outcome.ok ? null : outcome.error,
    })
    .select('id')
    .single();

  // The ids the usage log and the credit charge share for this run.
  const usageWorkspaceId = ownerTeam.primaryWorkspaceId ?? scope.workspaceId;
  const usageFeature = usageFeatureForAction(action.id);
  const logUsage = async (requestId: string, creditsCharged: number): Promise<void> => {
    // An action with no label is skipped, never mislabelled: usage-feature.test.ts
    // fails the build for a registered action that has none.
    if (!usageFeature) return;
    await recordRequestUsage(admin, {
      context: {
        requestId,
        feature: usageFeature,
        workspaceId: usageWorkspaceId,
        ownerUserId: scope.ownerUserId,
        actorUserId: params.actor.id,
        // Only a release has a release to attribute the cost to. A press kit
        // belongs to an artist, so its cost is recorded without one.
        releaseId: scope.objectType === 'release' ? params.objectId : null,
      },
      calls: outcome.usageCalls ?? [],
      failures: outcome.failedCalls ?? [],
      creditsCharged,
    });
  };
  const chargedOf = (charge: { credits: number }): number => (gate.metered && gate.ok ? charge.credits : 0);

  if (insert.error || !insert.data) {
    console.error('[urgans-actions] could not log a run:', insert.error);
    const fallbackRequestId = `embedded:${randomUUID()}`;
    if (outcome.ok) {
      // The action already produced real, useful output (a saved plan draft,
      // e.g.) even though the log write failed — hiding that from the caller
      // would be a worse failure than a thin audit trail. An empty actionId
      // means apply/discard cannot target THIS run; the legacy plan routes
      // (PUT/DELETE /plan) still reach the same underlying draft directly.
      const charge = await settleEmbeddedRun(admin, {
        gate,
        workspaceId: ownerTeam.primaryWorkspaceId ?? scope.workspaceId,
        ownerUserId: scope.ownerUserId,
        actorUserId: params.actor.id,
        requestId: fallbackRequestId,
        actionId: action.id,
        calls: outcome.usageCalls ?? [],
      });
      await logUsage(fallbackRequestId, chargedOf(charge));
      return { ok: true, actionId: '', output: outcome.output };
    }
    await logUsage(fallbackRequestId, 0);
    return { ok: false, status: outcome.status, error: outcome.error };
  }

  const actionId = String((insert.data as { id: string }).id);

  if (!outcome.ok) {
    // Not charged, but the calls it made before it failed were billed to us.
    await logUsage(`embedded:${actionId}`, 0);
    return { ok: false, status: outcome.status, error: outcome.error };
  }

  // Charged AFTER success, once (the run's own id is the dedupe key).
  const runCharge = await settleEmbeddedRun(admin, {
    gate,
    workspaceId: ownerTeam.primaryWorkspaceId ?? scope.workspaceId,
    ownerUserId: scope.ownerUserId,
    actorUserId: params.actor.id,
    requestId: `embedded:${actionId}`,
    actionId: action.id,
    calls: outcome.usageCalls ?? [],
  });
  await logUsage(`embedded:${actionId}`, chargedOf(runCharge));

  if (scope.workspaceId) {
    // Billed AFTER success — the chat-ceiling precedent
    // (action-ceiling.test.ts) exactly. A failed run (the model unavailable,
    // invalid output) must never count against the daily guard.
    await logBillingEvent(admin, {
      workspaceId: scope.workspaceId,
      ownerUserId: scope.ownerUserId,
      actorUserId: params.actor.id,
      type: 'urgans_embedded_action',
      metadata: { actionType: action.id, actionId },
    });
  }

  return { ok: true, actionId, output: outcome.output };
}

// ── Apply / discard ──────────────────────────────────────────────────────────

type UrgansActionRow = {
  id: string;
  workspace_id: string | null;
  owner_user_id: string | null;
  action_type: string;
  object_type: string;
  object_id: string;
  status: 'drafted' | 'applied' | 'discarded' | 'failed';
  output: unknown;
  applied_result: unknown;
  updated_at: string | null;
};

const URGANS_ACTION_ROW_COLUMNS =
  'id,workspace_id,owner_user_id,action_type,object_type,object_id,status,output,applied_result,updated_at';

async function loadActionRow(
  admin: SupabaseClient,
  actionId: string
): Promise<{ error: { status: number; error: string } } | { row: UrgansActionRow }> {
  const { data, error } = await admin
    .from(URGANS_ACTIONS_TABLE)
    .select(URGANS_ACTION_ROW_COLUMNS)
    .eq('id', actionId)
    .maybeSingle();
  if (error) return { error: { status: 500, error: error.message || 'Could not load this action.' } };
  if (!data) return { error: { status: 404, error: 'Not found.' } };
  return { row: data as UrgansActionRow };
}

function toClaimRow(row: UrgansActionRow): UrgansActionRowForClaim {
  return { status: row.status, appliedResult: row.applied_result, updatedAt: row.updated_at };
}

export type ApplyActionParams = { actionId: string; actor: User };
export type ApplyActionResult =
  | { ok: true; result: unknown }
  | { ok: false; status: number; error: string };

/**
 * Apply a drafted action's output: claim the row (idempotent — see
 * decideApplyClaim), run the action's own apply(), and stamp the result.
 *
 * Access is re-checked here on the object the ROW names, not trusted from
 * whenever it was run: membership can change between draft and apply, and
 * this is the step that actually writes.
 */
export async function applyUrgansAction(
  admin: SupabaseClient,
  params: ApplyActionParams
): Promise<ApplyActionResult> {
  const loaded = await loadActionRow(admin, params.actionId);
  if ('error' in loaded) return { ok: false, ...loaded.error };
  const { row } = loaded;

  const action = getUrgansAction(row.action_type);
  if (!action) return { ok: false, status: 404, error: 'Not found.' };

  const scopeResult = await resolveActionScope(admin, action, row.object_id, params.actor);
  if (!scopeResult.ok) return { ok: false, status: scopeResult.status, error: scopeResult.error };
  const { scope } = scopeResult;

  const decision = decideApplyClaim(toClaimRow(row), new Date());

  if (decision.kind === 'return_cached') return { ok: true, result: decision.result };
  if (decision.kind === 'in_progress') {
    return { ok: false, status: 409, error: 'This is already being applied. Try again in a moment.' };
  }
  if (decision.kind === 'refused') {
    return {
      ok: false,
      status: 409,
      error:
        decision.reason === 'discarded'
          ? 'This draft was discarded.'
          : 'This run failed and cannot be applied.',
    };
  }

  // decision.kind is 'claim' (drafted -> applied) or 'reclaim' (a stale,
  // resultless applied row -> applied again, bumping updated_at). Either way,
  // the row must be WON with a conditional update before the action's own
  // apply() ever runs — this is the whole claim.
  const claimQuery =
    decision.kind === 'claim'
      ? admin
          .from(URGANS_ACTIONS_TABLE)
          .update({ status: 'applied' })
          .eq('id', row.id)
          .eq('status', 'drafted')
          .select('id')
      : admin
          .from(URGANS_ACTIONS_TABLE)
          .update({ status: 'applied' })
          .eq('id', row.id)
          .eq('status', 'applied')
          .is('applied_result', null)
          .select('id');

  const claim = await claimQuery;
  if (claim.error) {
    return { ok: false, status: 500, error: claim.error.message || 'Could not apply this action.' };
  }
  if ((claim.data || []).length === 0) {
    // Someone else won the race in the same instant. Re-read rather than
    // guessing what happened.
    const refreshed = await loadActionRow(admin, params.actionId);
    if ('error' in refreshed) return { ok: false, ...refreshed.error };
    const redecision = decideApplyClaim(toClaimRow(refreshed.row), new Date());
    if (redecision.kind === 'return_cached') return { ok: true, result: redecision.result };
    return { ok: false, status: 409, error: 'This is already being applied. Try again in a moment.' };
  }

  // Practically unreachable for a real oneShot action — its row is always
  // inserted already 'applied' with a non-null applied_result, so the
  // return_cached branch above always fires first. Guarded anyway: `apply` is
  // optional on the type precisely because a oneShot action may omit it, and
  // this is what stops that omission from being a runtime crash if a claim
  // somehow reached this point regardless.
  if (!action.apply) {
    return { ok: false, status: 409, error: 'This action has nothing left to apply.' };
  }

  const applyOutcome = await action.apply({
    admin,
    objectId: row.object_id,
    actor: { id: params.actor.id, email: params.actor.email },
    ownerUserId: scope.ownerUserId,
    workspaceId: scope.workspaceId,
    output: row.output,
  });

  if (!applyOutcome.ok) {
    const fail = await admin
      .from(URGANS_ACTIONS_TABLE)
      .update({ status: 'failed', error: applyOutcome.error })
      .eq('id', row.id);
    if (fail.error) {
      console.error('[urgans-actions] apply failed and could not stamp the failure:', fail.error);
    }
    return { ok: false, status: applyOutcome.status, error: applyOutcome.error };
  }

  const settle = await admin
    .from(URGANS_ACTIONS_TABLE)
    .update({ applied_result: applyOutcome.result, applied_at: new Date().toISOString() })
    .eq('id', row.id);
  if (settle.error) {
    // The real work already happened (approvePlanDraft already created the
    // tasks, e.g.) — tell the caller it worked even though the log write
    // failed. A retry lands on decideApplyClaim's in_progress/reclaim path
    // rather than re-running the action.
    console.error('[urgans-actions] applied but could not stamp the result:', settle.error);
  }

  return { ok: true, result: applyOutcome.result };
}

export type DiscardActionParams = { actionId: string; actor: User };
export type DiscardActionResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Discard a drafted action. Idempotent: discarding an already-discarded row
 * succeeds silently, matching the action's own discard() idempotence
 * (release_plan_drafts' DELETE ... WHERE status='draft').
 */
export async function discardUrgansAction(
  admin: SupabaseClient,
  params: DiscardActionParams
): Promise<DiscardActionResult> {
  const loaded = await loadActionRow(admin, params.actionId);
  if ('error' in loaded) return { ok: false, ...loaded.error };
  const { row } = loaded;

  const action = getUrgansAction(row.action_type);
  if (!action) return { ok: false, status: 404, error: 'Not found.' };

  const scopeResult = await resolveActionScope(admin, action, row.object_id, params.actor);
  if (!scopeResult.ok) return { ok: false, status: scopeResult.status, error: scopeResult.error };
  const { scope } = scopeResult;

  if (row.status === 'discarded') return { ok: true };
  if (row.status === 'applied') {
    return { ok: false, status: 409, error: 'This was already applied and cannot be discarded.' };
  }

  // A oneShot row is never 'drafted' (see runUrgansAction), so it is always
  // caught by the 'applied' check above before reaching here — this guard is
  // for the same defensive reason the one in applyUrgansAction is.
  if (!action.discard) {
    return { ok: false, status: 409, error: 'This action cannot be discarded.' };
  }

  const outcome = await action.discard({
    admin,
    objectId: row.object_id,
    actor: { id: params.actor.id, email: params.actor.email },
    ownerUserId: scope.ownerUserId,
  });
  if (!outcome.ok) return { ok: false, status: outcome.status, error: outcome.error };

  const update = await admin
    .from(URGANS_ACTIONS_TABLE)
    .update({ status: 'discarded' })
    .eq('id', row.id)
    .eq('status', 'drafted');
  if (update.error) {
    console.error('[urgans-actions] discarded but could not stamp the row:', update.error);
  }

  return { ok: true };
}
