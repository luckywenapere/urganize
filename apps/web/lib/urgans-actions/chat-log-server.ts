// The chat door's half of the embedded-action log.
//
// There are two ways to get an UrgAns-drafted plan or a drafted press-kit
// section: the button inside the product surface, and asking UrgAns for the
// same thing in conversation. runUrgansAction logs the first. This logs the
// second, so /admin/urgans can tell them apart instead of being blind to half
// the drafting that happens.
//
// ── THE ONE DECISION TO READ BEFORE EDITING THIS FILE ───────────────────────
//
// This module deliberately does NOT check the 'urgans_embedded_actions'
// entitlement, and that omission is the decision rather than an oversight.
// The gate is on the SURFACE, not the capability: the buttons are the paid
// convenience, and asking in chat stays available on every plan. Four reasons,
// in order of weight:
//
//   1. The spec's own words grant it — "Gated to Manager, Label and Group,
//      Solo keeps chat only". That sentence gives Solo the chat.
//   2. packages/pricing SELLS Solo 40 UrgAns actions a month. Refusing a
//      whole class of them would contradict the line that advertises it.
//   3. The chat door is already metered by that paid quota; the button door
//      is not. So this is a cheaper capped path, not an unmetered bypass.
//   4. Principle 6. Nothing has been abused; removing a shipped capability to
//      pre-empt a hypothetical is the anticipatory design CLAUDE.md forbids.
//
// The consequence, stated plainly: a Solo team can get an UrgAns-drafted plan
// by asking in chat. That is intended, and the rows this file writes are what
// will show it if it ever stops being a good idea.
// chat-log-server.test.ts pins the omission, because "add the entitlement
// check" is exactly the tidy-up a later reader would make in good faith.
//
// ── WHY IT REUSES resolveActionScope ────────────────────────────────────────
//
// That function is what stamps owner_user_id, workspace_id and plan_at_time
// from the OWNER's team rather than the caller's, and what checks the caller
// can reach the object at all (branching to ensurePressKitAccess for a kit).
// Reusing it means a chat row cannot be written for something the caller
// cannot see, and the two doors cannot disagree about whose team a run
// belongs to. The alternative — reading the owner here — would be a second
// copy of a rule that has already been consolidated once.

import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getUrgansAction } from './registry';
import { URGANS_ACTIONS_TABLE, isUrgansActionsEnabled, resolveActionScope } from './server';

/**
 * What a chat tool knows about its caller. ChappiToolContext carries exactly
 * this, and it is all resolveActionScope's whole downstream chain reads —
 * ensureReleaseTeamReadAccess, ensurePressKitAccess and
 * loadWorkspaceAccessContext all touch `.id` and nothing else, verified.
 */
export type ChatActionActor = { id: string; email?: string | null };

export type RecordChatActionInput = {
  actionType: string;
  objectId: string;
  actor: ChatActionActor;
  /**
   * 'drafted' (the default) for a two-step flow the user later approves or
   * discards; 'applied' for a one-shot where the chat write IS the apply and
   * there was never a draft to settle.
   */
  status?: 'drafted' | 'applied';
  inputSummary?: Record<string, unknown>;
  output?: unknown;
};

/**
 * The prompt that produced a chat-door run is the assistant's own system
 * prompt, not the action's versioned one, and saying so is more honest than
 * borrowing a version number that had nothing to do with it. Give this a
 * suffix if the assistant's prompt ever becomes versioned.
 */
const CHAT_PROMPT_VERSION = 'chat';

/**
 * Log that a chat tool did an embedded action's job. Returns the new row's id
 * so the tool can settle it later, or null when nothing was written.
 *
 * NEVER THROWS. Every failure — the track switched off, an unknown action, a
 * caller who cannot reach the object, a database error, a client that explodes
 * — answers null. A lost log row costs a console entry; an exception here
 * would cost the user the answer they actually asked for.
 */
export async function recordChatActionRun(
  admin: SupabaseClient,
  input: RecordChatActionInput
): Promise<string | null> {
  // First, and before any work: the table does not exist until the embedded
  // track's migration is applied, and this flag pair is the one place that
  // combined answer is computed. It is also what makes the whole chat-logging
  // change inert until the founder activates the track.
  if (!isUrgansActionsEnabled()) return null;

  const action = getUrgansAction(input.actionType);
  if (!action || !input.objectId) return null;

  try {
    const scopeResult = await resolveActionScope(
      admin,
      action,
      input.objectId,
      // Safe by inspection rather than by cast-and-hope: see ChatActionActor
      // above. scope.test.ts constructs its users the same way.
      input.actor as User
    );
    if (!scopeResult.ok) return null;
    const { scope } = scopeResult;

    const status = input.status ?? 'drafted';
    const { data, error } = await admin
      .from(URGANS_ACTIONS_TABLE)
      .insert({
        workspace_id: scope.workspaceId,
        owner_user_id: scope.ownerUserId,
        actor_user_id: input.actor.id,
        plan_at_time: scope.tier,
        action_type: action.id,
        object_type: scope.objectType,
        object_id: input.objectId,
        source: 'chat',
        status,
        input_summary: input.inputSummary ?? {},
        output: input.output ?? null,
        prompt_version: CHAT_PROMPT_VERSION,
        applied_at: status === 'applied' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[urgans-actions] could not log a chat run:', error);
      return null;
    }
    return String((data as { id: string }).id) || null;
  } catch (error) {
    console.error('[urgans-actions] could not log a chat run:', error);
    return null;
  }
}

/**
 * Move a chat-logged run out of 'drafted'.
 *
 * The `status = 'drafted'` condition is not decoration: it is what stops a
 * second approve, or an approve arriving after a discard, rewriting a row that
 * has already settled. It is deliberately NOT applyUrgansAction — that one
 * decides whether to RUN the apply and then runs it, and by the time this is
 * called the chat tool has already done the write through the ordinary REST
 * route. This only records what happened.
 */
async function settleChatAction(
  admin: SupabaseClient,
  actionId: string | null | undefined,
  status: 'applied' | 'discarded',
  appliedResult?: unknown
): Promise<boolean> {
  if (!isUrgansActionsEnabled()) return false;
  // Without an id this would be an unqualified UPDATE. Cheap guard, worst
  // possible failure.
  if (!actionId) return false;

  try {
    const { data, error } = await admin
      .from(URGANS_ACTIONS_TABLE)
      .update({
        status,
        applied_at: status === 'applied' ? new Date().toISOString() : null,
        applied_result: status === 'applied' ? (appliedResult ?? null) : null,
      })
      .eq('id', actionId)
      .eq('status', 'drafted')
      .select('id')
      .maybeSingle();

    if (error) {
      console.error(`[urgans-actions] could not mark a chat run ${status}:`, error);
      return false;
    }
    return Boolean(data);
  } catch (error) {
    console.error(`[urgans-actions] could not mark a chat run ${status}:`, error);
    return false;
  }
}

export function markChatActionApplied(
  admin: SupabaseClient,
  actionId: string | null | undefined,
  appliedResult?: unknown
): Promise<boolean> {
  return settleChatAction(admin, actionId, 'applied', appliedResult);
}

export function markChatActionDiscarded(
  admin: SupabaseClient,
  actionId: string | null | undefined
): Promise<boolean> {
  return settleChatAction(admin, actionId, 'discarded');
}
