// Client-safe Chappi types. No server-only imports here — this module is
// consumed by the ChappiHero client component AND (from Phase 2 onward) by the
// server-side agent route, mirroring the lib/release-planning.ts split.

/** Roles in a Chappi conversation. Reserved for the Phase 2 agentic loop. */
export type ChappiRole = 'user' | 'assistant';

/**
 * Something the user attached to a message.
 * The bytes (`dataUrl` for a photo, `text` for a text file) live in the browser
 * for the session and are sent with a request; they are never saved. A saved or
 * reopened chat has none of them, only the names.
 */
export type ChappiAttachment = {
  id: string;
  kind: 'image' | 'text';
  name: string;
  mime: string;
  size: number;
  /** Photos only: a JPEG (or PNG/WebP/GIF) data URL, already shrunk in the browser. */
  dataUrl?: string;
  /** Text files only: the file's text, capped. */
  text?: string;
  /** Text files only: the text was longer than the cap and was cut. */
  truncated?: boolean;
};

/** One turn in the ephemeral, client-held conversation (Phase 2+). */
export type ChappiMessage = {
  id: string;
  role: ChappiRole;
  content: string;
  /** User turns only. See ChappiAttachment. */
  attachments?: ChappiAttachment[];
  /** Assistant turns only: which brief sections were in context (Phase 4).
   *  Held per MESSAGE rather than on the store root so scrolling back up a
   *  transcript still shows what each answer was working from — a single
   *  "latest" value would relabel every earlier answer. */
  briefSections?: string[];
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
export type ChappiIntentKind =
  | ChappiChipIntent
  | 'create_note'
  // Intent-only, like create_note: the recap is a once-per-release moment,
  // not a standing button, and it only means anything on a finished release.
  | 'generate_recap'
  // Intent-only as well. Sharing is a moment after a rollout exists, and every
  // rollout already carries a Share button, so a standing chip would be a
  // second door to the same room.
  | 'share_socials'
  | 'help';

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
/**
 * A chip that runs an app action instantly, with no model call. These are what
 * keep the front door useful when no model is configured, which is a state
 * production has been in for long stretches.
 */
export type ChappiActionChip = {
  id: string;
  label: string;
  intent: ChappiChipIntent;
  plannerPreset?: PlannerChipPreset;
  ask?: never;
};

/**
 * A chip that ASKS something instead of doing something — the label is sent as
 * the user's message and the assistant answers it.
 *
 * Added 2026-09-08 (founder call) because the questions people actually arrive
 * with — what is this, how do I use it, what does it do for me — are not
 * actions and had no chip shape at all. Every chip before this was a creation
 * verb, which serves a first release and nothing about the day after.
 *
 * `ask` carries the text rather than reusing `label`, so a short chip can send
 * a fuller question than would fit on it.
 */
export type ChappiAskChip = {
  id: string;
  label: string;
  ask: string;
  intent?: never;
  plannerPreset?: never;
};

export type ChappiChip = ChappiActionChip | ChappiAskChip;

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
 * the registry entry, not by this field. Two reasons — `invite_teammate` needs
 * approval without being destructive (a semantic 'destructive' kind would lie
 * about it), and the card's copy is entity-specific ("Delete 'Midnight EP' and
 * its 42 activities"), which only the tool itself can build. One mechanism,
 * not two.
 */
export type ChappiToolKind = 'read' | 'mutate';

export type ChappiToolName =
  // context (2026-08-25) — the portable half of what UrgAns knows
  | 'get_workspace_context'
  | 'get_release_context'
  // insights (2026-09-03) — cross-entity reasoning aids over existing data
  | 'compare_releases'
  | 'get_team_workload'
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
  | 'complete_tasks'
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
  | 'invite_teammate'
  | 'remove_teammate'
  // promotion: pitching, press kit, recap
  | 'list_pitch_playlists'
  | 'list_pitches'
  | 'pitch_song'
  | 'get_recap'
  | 'generate_recap'
  | 'delete_recap'
  // share to socials (2026-09-23)
  | 'share_release'
  // rollout planner (since 2026-09-15, one call builds the plan; there is no
  // approve/discard, because there is no draft left to settle)
  | 'get_release_plan'
  | 'preview_release_plan'
  | 'generate_release_plan'
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
  | 'delete_content_post'
  | 'list_artist_posts'
  | 'plan_posts'
  // the standing per-artist press kit (2026-09-07)
  | 'list_press_kits'
  | 'get_press_kit'
  | 'create_press_kit'
  | 'update_press_kit'
  | 'write_press_kit_section'
  | 'publish_press_kit'
  | 'unpublish_press_kit'
  // the artist roster (2026-09-07)
  | 'list_artists'
  | 'create_artist'
  | 'rename_artist'
  | 'remove_artist'
  | 'move_release_to_artist'
  // what UrgAns remembers about each artist (2026-10-27)
  | 'list_artist_facts'
  | 'save_artist_fact'
  | 'forget_artist_fact'
  // the next record, one line in (2026-10-27)
  | 'add_to_record'
  // cover art and what else is attached to a release (2026-09-07)
  | 'get_cover_art'
  | 'upload_cover_art'
  | 'list_release_files'
  // fan email capture, collaborator credits, and archiving (2026-09-07)
  | 'get_capture_page'
  | 'create_capture_page'
  | 'update_capture_page'
  | 'list_capture_leads'
  | 'get_release_credits'
  | 'create_credits_link'
  | 'close_credits_link'
  | 'archive_release'
  // the Urganize Directory and work requests (2026-09-07)
  | 'search_directory'
  | 'get_my_directory_profile'
  | 'update_my_directory_profile'
  | 'list_work_requests'
  | 'send_work_request'
  | 'answer_work_request';

/**
 * A side effect the CLIENT must perform after the agent turn — the agent runs
 * server-side and can't touch the router or modals directly, so it emits these
 * for ChappiHero to execute (navigate, open a modal, re-sync the store).
 */
export type ChappiClientAction =
  | {
      type: 'navigate';
      href: string;
      /**
       * Set only by create_release, and only when that was the person's first
       * real rollout (share to socials, 2026-09-23). The client then shows the
       * once-only share sheet BEFORE navigating, through the same helper the
       * three create flows use, so a first rollout made in chat is offered it
       * exactly like one made from a button. A release id, not a boolean, so
       * the sheet knows which rollout it is about.
       */
      offerFirstShareFor?: string;
    }
  | { type: 'open_create_release' }
  | { type: 'open_quick_create'; releaseId?: string | null }
  /**
   * Put a cover art picker in the transcript, scoped to this release. It has
   * to be a card: a model turn is text, so no tool can be handed a file, and
   * `input.click()` only opens a dialog inside a user gesture.
   */
  | { type: 'open_cover_art_upload'; releaseId: string }
  /**
   * Put the finished recap poster in the transcript, ready to share or save.
   *
   * The mirror image of `open_cover_art_upload`: that one exists because a
   * tool cannot be HANDED a file, this one because a tool cannot GIVE you one. The
   * recap's output is two PNGs behind short-lived signed URLs, and a paragraph
   * of text cannot hand those over — so the tool builds the card and the
   * browser does the sharing, through the same `shareOrDownloadImage` path the
   * removed modal used.
   *
   * Deliberately carries only the release id: the card fetches its own signed
   * URLs, so no credential ever reaches the model's context or goes stale
   * sitting in the transcript.
   */
  | { type: 'open_recap'; releaseId: string }
  /**
   * Open the share sheet for this rollout (share to socials, 2026-09-23).
   *
   * Same shape as open_recap for the same reason: the posts are images the
   * user sends from their own phone, and a tool can neither post them nor hand
   * them over as text. The sheet asks its four questions and renders the
   * images itself, so only the id travels.
   */
  | { type: 'open_share'; releaseId: string }
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
  /** Present on deletes that need the typed double confirmation (rollouts): the
   * card shows a text box and the button stays off until the user types this
   * phrase or DELETE. What they typed travels as args.confirmation, and the
   * route checks it again. */
  typedConfirmation?: { phrase: string };
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
      /** Brief sections that were in the system prompt for this turn (Phase 4
       *  attribution). "UrgAns read this", NOT "this shaped the answer" — see
       *  the note on ChappiSystemPrompt.briefSections for why the honest
       *  claim is the weaker one. Absent/empty means nothing was injected. */
      briefSections?: string[];
    }
  | {
      mode: 'deterministic';
      /** Why the model was skipped, when there is a reason worth showing. Set
       *  when a team has spent its assistant actions for the window: the
       *  deterministic router still runs (typed commands and chips keep
       *  working, and cost nothing), so this explains the difference rather
       *  than reporting a failure. Absent in the ordinary no-model-configured
       *  case, which needs no explanation. */
      notice?: string;
    }
  | { mode: 'error'; error: string };
