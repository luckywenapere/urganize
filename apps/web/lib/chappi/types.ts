// Client-safe Chappi types. No server-only imports here — this module is
// consumed by the ChappiHero client component AND (from Phase 2 onward) by the
// server-side agent route, mirroring the lib/release-planning.ts split.

/** Roles in a Chappi conversation. Reserved for the Phase 2 agentic loop. */
export type ChappiRole = 'user' | 'assistant';

/** One turn in the ephemeral, client-held conversation (Phase 2+). */
export type ChappiMessage = {
  id: string;
  role: ChappiRole;
  content: string;
};

/**
 * Intents the deterministic router can resolve without a model (Phase 1). Each
 * chip intent maps to an existing app action; `help` is the unmatched-input
 * fallback.
 */
export type ChappiChipIntent =
  | 'new_release'
  | 'plan_release'
  | 'add_task'
  | 'todays_focus'
  | 'generate_status'
  | 'take_note';

/**
 * `create_note` is intent-only, never a chip: it carries the note's text, so
 * it can only come from something the user typed. A chip is a constant with
 * nothing to say, which is what `take_note` is for — that one opens an empty
 * editor instead.
 */
export type ChappiIntentKind = ChappiChipIntent | 'create_note' | 'help';

/**
 * Answers the planner intake already knows before it asks, carried by a chip.
 *
 * `weeksOut` rather than a date: a chip is a constant, and a date computed at
 * module load would be wrong by the time anyone tapped it.
 */
export type PlannerChipPreset = {
  releaseType?: 'single' | 'ep' | 'album';
  weeksOut?: number;
  budget?: 'none' | 'under_100k' | '100k_500k' | 'over_500k';
};

export type ChappiIntent = {
  kind: ChappiIntentKind;
  plannerPreset?: PlannerChipPreset;
  /** Set only on `create_note` — the text after the "note" prefix, which
   * becomes the note body (and whose first line becomes its title). */
  noteBody?: string;
};

/** A quick-action chip shown under the prompt. Icon is resolved in the
 * component (icons are React nodes and can't live in this client-safe lib). */
export type ChappiChip = {
  id: string;
  label: string;
  intent: ChappiChipIntent;
  plannerPreset?: PlannerChipPreset;
};

/**
 * The assistant's response to a deterministic turn: a short line plus optional
 * clickable example prompts. Phase 2 replaces this with streamed model output,
 * but the shape stays useful for the degraded-mode fallback.
 */
export type ChappiReply = {
  text: string;
  suggestions?: string[];
};

// ── Phase 2 agent types ──────────────────────────────────────────────────

/**
 * Tool classification. Deliberately NOT the confirmation gate: whether a tool
 * needs the user's approval is driven by the presence of a `confirm` builder on
 * the registry entry, not by this field. Two reasons — `approve_release_plan`
 * and `invite_teammate` need approval without being destructive (a semantic
 * 'destructive' kind would lie about them), and the card's copy is
 * entity-specific ("Delete 'Midnight EP' and its 42 activities"), which only
 * the tool itself can build. One mechanism, not two.
 */
export type ChappiToolKind = 'read' | 'mutate';

export type ChappiToolName =
  // core (pre-expansion)
  | 'list_releases'
  | 'get_release'
  | 'list_tasks'
  | 'get_dashboard'
  | 'create_release'
  | 'create_task'
  | 'create_note'
  | 'update_task'
  | 'complete_task'
  | 'reopen_task'
  | 'generate_status_update'
  | 'navigate'
  // release + task lifecycle
  | 'update_release'
  | 'schedule_release'
  | 'delete_release'
  | 'delete_task'
  | 'add_task_comment'
  // notes
  | 'list_notes'
  | 'update_note'
  | 'delete_note'
  // team
  | 'list_workspace_members'
  // rollout planner
  | 'get_release_plan'
  | 'generate_release_plan'
  | 'approve_release_plan'
  | 'discard_release_plan'
  // distribution metadata
  | 'get_release_metadata'
  | 'update_release_metadata'
  // content calendar
  | 'list_content_calendars'
  | 'create_content_calendar'
  | 'delete_content_calendar'
  | 'list_content_posts'
  | 'create_content_post'
  | 'update_content_post'
  | 'delete_content_post';

/**
 * A side effect the CLIENT must perform after the agent turn — the agent runs
 * server-side and can't touch the router or modals directly, so it emits these
 * for ChappiHero to execute (navigate, open a modal, re-sync the store).
 */
export type ChappiClientAction =
  | { type: 'navigate'; href: string }
  | { type: 'open_create_release' }
  | { type: 'open_quick_create'; releaseId?: string | null }
  | { type: 'refresh' };

/** Normalized outcome of a single tool execution, fed back to the model. */
export type ChappiToolResult = {
  ok: boolean;
  /** Short natural-language outcome the model relays to the user. */
  summary: string;
  /** Structured payload for read tools (kept compact to bound tokens). */
  data?: unknown;
  /** A client-side action produced by the tool (navigate, open modal, refresh). */
  clientAction?: ChappiClientAction;
};

/**
 * A release the user pinned the conversation to via the scope picker under
 * the prompt box (Linear-style context selector, founder call 2026-07-23).
 * Advisory: the server re-validates every id tools touch; this only steers
 * the model's interpretation of ambiguous instructions.
 */
export type ChappiReleaseScope = {
  id: string;
  title: string;
};

/**
 * An action the model has PROPOSED but which has NOT run. The client renders it
 * as a confirmation card; only the user's approval executes it.
 *
 * The security property this exists for: a gated tool is never executable from
 * inside the model loop. Text living in workspace data (a release title, a note
 * body) can therefore never talk the model into deleting something — the model
 * can only ever get as far as showing this card, and a human has to click.
 *
 * `args` round-trips through the client. That is not an escalation: the browser
 * already holds the user's real JWT and could call the REST route directly. The
 * threat being defended against is the MODEL acting unilaterally, not the user.
 */
export type ChappiPendingConfirmation = {
  toolName: ChappiToolName;
  args: Record<string, unknown>;
  /** Card headline, e.g. `Delete "Midnight EP"?` */
  title: string;
  /** Blast radius, spelled out. */
  detail?: string;
  /** Confirm button label, e.g. `Delete release`. */
  confirmLabel: string;
};

/** What the client sends back when the user approves a pending confirmation. */
export type ChappiConfirmedAction = {
  toolName: string;
  args: Record<string, unknown>;
};

/** Request body the client POSTs to /api/urgans. */
export type ChappiRequestBody = {
  messages: ChappiMessage[];
  releaseScope?: ChappiReleaseScope | null;
  /** Present only on the approve leg of a confirmation. The route runs exactly
   * this one tool and never re-enters the model's tool loop for it. */
  confirmedAction?: ChappiConfirmedAction | null;
};

/** Route response union. `deterministic` tells the client to run the local
 * intent-router (model not configured); `agent` carries the model's reply and
 * any client actions; `error` is a handled failure.
 *
 * `pendingConfirmation` sits at the top level rather than joining
 * ChappiClientAction: client actions are fire-and-forget side effects executed
 * in a loop, whereas this is stateful UI that waits for input. */
export type ChappiResponse =
  | {
      mode: 'agent';
      reply: string;
      clientActions: ChappiClientAction[];
      pendingConfirmation?: ChappiPendingConfirmation | null;
    }
  | { mode: 'deterministic' }
  | { mode: 'error'; error: string };
