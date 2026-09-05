// The shape every embedded UrgAns action fits: a draft is produced, a human
// reviews and edits it, and nothing writes until Apply. See the registry-guard
// test for the machine-enforced half of that contract (the metering split,
// and that every action declares a prompt version).
//
// THIS IS DELIBERATELY THE SHAPE ONE ACTION ACTUALLY NEEDS, not a speculative
// AI-call pipeline (buildMessages/parse/validate as top-level hooks the
// runner drives). release.draft_plan wraps a self-contained pipeline
// (lib/release-planning-actions-server.ts's generatePlanDraft) that already
// does its own prompt-building, parsing and validation internally — a second
// layer of those same hooks around it would be unused ceremony. `execute` is
// the seam instead: "run this action's whole draft step, however it needs
// to." Grow this type when a second action genuinely needs a different shape,
// per this feature's own build-order note about the review UI.
//
// DELIBERATELY NOT COUPLED TO NextResponse — see the header of
// lib/release-planning-actions-server.ts for why: an action runner is not an
// HTTP handler, so every result here is a plain discriminated union.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PricingTierId } from '@urganize/pricing';

/**
 * What an action can act on. 'press_kit' is the second, added when the press
 * kit's section drafting arrived — the extension point this comment always
 * described rather than a speculative one.
 *
 * An action declares exactly ONE of these. resolveActionScope has to pick a
 * single access check, and a list of two would make that choice arbitrary;
 * registry-guard.test.ts asserts it.
 */
export type UrgansActionObjectType = 'release' | 'press_kit';

/**
 * - 'team_write': any team member may run/apply/discard; a guest is refused
 *   at the write step; a non-member gets the visibility-preserving 404.
 * - 'team_read': read-only visibility is enough (declared for a future
 *   read-shaped action; nothing uses it yet).
 * - 'owner_write': ONLY the release owner, even though the release is
 *   visible to the whole team. This is release.draft_plan's actual level —
 *   see that action's own comment for why 'team_write' would be a lie here:
 *   release_plan_drafts and every legacy /plan/* route are still owner-keyed
 *   in eight places (a deliberate, recorded deferral — see
 *   lib/release-access-guard.test.ts's own header), so a non-owner teammate
 *   allowed to RUN this action would tap a working button and then hit a 404
 *   loading the very draft they just created. A non-owner member gets the
 *   SAME 404 a stranger would (never a 403 that would confirm ownership),
 *   matching the legacy route group's own loadOwnedRelease behaviour exactly.
 */
export type UrgansActionAccessLevel = 'team_write' | 'team_read' | 'owner_write';

/** What the caller is, once access has already been checked — the tier is the
 *  RELEASE OWNER's, never the acting teammate's (see resolveActionScope in
 *  ./server.ts), because the plan being drafted is the owner's team's plan. */
export type UrgansActionActor = {
  id: string;
  email?: string | null;
};

export type UrgansActionRunInput<Input> = {
  admin: SupabaseClient;
  objectId: string;
  actor: UrgansActionActor;
  ownerUserId: string;
  workspaceId: string | null;
  tier: PricingTierId;
  /** The caller's own input for this run — for release.draft_plan, the
   *  optional refine-mode intake answers. Undefined means "one tap, derive
   *  everything". */
  input: Input | undefined;
};

export type UrgansActionRunOutcome<Output> =
  | {
      ok: true;
      output: Output;
      /** A short, loggable summary of what was asked for — never the whole
       *  draft document, which lives under its own autosave loop and would go
       *  stale in the log the moment the manager edited it. */
      inputSummary: Record<string, unknown>;
      model: string | null;
      tokensIn: number | null;
      tokensOut: number | null;
    }
  | { ok: false; status: number; error: string };

export type UrgansActionApplyInput<Output> = {
  admin: SupabaseClient;
  objectId: string;
  actor: UrgansActionActor;
  ownerUserId: string;
  workspaceId: string | null;
  /** The output from the run this Apply is settling. release.draft_plan
   *  IGNORES this and re-reads release_plan_drafts fresh — the plan review
   *  scene edits through the existing PUT /plan autosave, so the row on
   *  screen when the manager taps Apply is the row already in the database,
   *  never a copy carried through this call. State that explicitly in an
   *  action's own apply() rather than leaving the parameter to look unused
   *  by accident. */
  output: Output;
};

export type UrgansActionApplyOutcome<Result> =
  | { ok: true; result: Result }
  | { ok: false; status: number; error: string };

export type UrgansActionDiscardOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * NOTE ON METHOD SYNTAX: execute/apply/discard are declared as METHODS
 * (`name(params): Return`), not as arrow-typed properties (`name: (params) =>
 * Return`). That is deliberate and load-bearing, not a style choice —
 * TypeScript checks method parameters BIVARIANTLY but arrow-typed function
 * PROPERTIES contravariantly under strict mode. This type is generic and has
 * to live in a single heterogeneous registry (./registry.ts) alongside
 * whatever future actions arrive with their own Input/Output/Result — that
 * only type-checks with method syntax. Changing these to arrow properties
 * will not compile the moment a second action joins the registry.
 */
export type UrgansActionDefinition<Input, Output, Result = Output> = {
  /** The DB action_type string — 'release.draft_plan'. Also the registry key. */
  id: string;
  /** What a locked-tier sheet and the admin panel call this action. */
  label: string;
  objectTypes: UrgansActionObjectType[];
  access: UrgansActionAccessLevel;
  /** A non-empty version string for every action — registry-guard.test.ts
   *  fails the build if one is missing. Bump it when the prompt or the output
   *  shape changes meaningfully, so a stored `urgans_actions.prompt_version`
   *  tells you which behaviour produced a given row. */
  promptVersion: string;
  /** Run the whole draft step: resolve whatever this action needs beyond the
   *  access check already done (the full object row, its team), call a model
   *  if one applies, and return a draft output plus what to log. Must record
   *  nothing itself — the caller (runUrgansAction) owns the one
   *  `urgans_actions` insert. */
  execute(params: UrgansActionRunInput<Input>): Promise<UrgansActionRunOutcome<Output>>;
  /** Turn the run's output into exactly what gets written and what the caller
   *  sees, in ONE statement or none — supabase-js has no transactions, so
   *  "atomic" here means "a single insert/update", never several. */
  apply(params: UrgansActionApplyInput<Output>): Promise<UrgansActionApplyOutcome<Result>>;
  /** Undo a run that was never applied. Idempotent: calling this twice, or on
   *  a row that was never really committed, must not error. */
  discard(params: {
    admin: SupabaseClient;
    objectId: string;
    actor: UrgansActionActor;
    ownerUserId: string;
  }): Promise<UrgansActionDiscardOutcome>;
};

/** Re-exported so a route only needs one import for the auth-adjacent type. */
export type { User };
