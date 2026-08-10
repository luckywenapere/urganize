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
  | 'generate_status';

export type ChappiIntentKind = ChappiChipIntent | 'help';

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

export type ChappiIntent = { kind: ChappiIntentKind; plannerPreset?: PlannerChipPreset };

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

/** Tool classification. No 'destructive' tier in this build — deletes are
 * deferred, so every mutating tool is reversible. */
export type ChappiToolKind = 'read' | 'mutate';

export type ChappiToolName =
  | 'list_releases'
  | 'get_release'
  | 'list_tasks'
  | 'get_dashboard'
  | 'create_release'
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'reopen_task'
  | 'generate_status_update'
  | 'navigate';

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

/** Request body the client POSTs to /api/urgans. */
export type ChappiRequestBody = {
  messages: ChappiMessage[];
  releaseScope?: ChappiReleaseScope | null;
};

/** Route response union. `deterministic` tells the client to run the local
 * intent-router (model not configured); `agent` carries the model's reply and
 * any client actions; `error` is a handled failure. */
export type ChappiResponse =
  | { mode: 'agent'; reply: string; clientActions: ChappiClientAction[] }
  | { mode: 'deterministic' }
  | { mode: 'error'; error: string };
