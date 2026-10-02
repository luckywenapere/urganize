import type { Profile } from '@/lib/supabase/client';

/**
 * Audit findings before the PostHog integration:
 * 1. `apps/web/package.json` already included `@vercel/analytics`, but no Mixpanel/PostHog/Segment/Amplitude/Hotjar/FullStory/LogRocket SDKs were installed.
 * 2. The app already had a lightweight local helper at `apps/web/lib/analytics.ts` that stored a small event log in `localStorage`, plus legacy call sites in settings and billing.
 * 3. `apps/web/.env.example` and `apps/web/.env.local` only exposed `NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS`; no PostHog keys or hosts were configured yet.
 * 4. Third-party analytics were not injected via `<Script>` tags. The active shell mounted optional Vercel Analytics from `components/app/AppShell.tsx`, while `app/layout.tsx` only injected the theme bootstrap script.
 * 5. Because Windows cannot have both `lib/analytics.ts` and `lib/analytics/events.ts`, the old file-based helper was replaced with a folder-based analytics entrypoint.
 * 6. The first PostHog pass mixed browser and server helpers in one module; the production build now keeps shared event types here, browser capture in `client.ts`, and `posthog-node` server capture in `server.ts`.
 */

type EmptyAnalyticsProperties = Record<string, never>;

export type ReleaseCreatedSource =
  | 'onboarding'
  | 'dashboard'
  | 'empty_state'
  | 'chappi'
  // The UrgAns planner intake, when it creates the release itself (started
  // from a note or an assistant chip rather than an existing release).
  | 'planner'
  // The one-tap test release (NEXT_PUBLIC_FEATURE_TEST_RELEASE) — kept
  // distinct so real-release activation reads are segmentable from test runs.
  | 'test_path';
export type TaskCreatedSource = 'quick_create' | 'inline' | 'detail_panel' | 'onboarding';

export interface AnalyticsEventPropertiesMap {
  /**
   * The session ended without the user asking for it — supabase-js dropped the
   * token itself, almost always after a refresh it could not complete. This is
   * the only signal that tells us whether users are being logged out in the
   * wild, and it exists because four separate paths in lib/auth-store.ts used
   * to do the same thing silently (URG-235).
   *
   * `last_failure_kind` is what the preceding auth failure classified as, when
   * there was one within `last_failure_age_ms` — a `transient` value here means
   * we very likely lost a live session to a bad connection rather than a real
   * revocation.
   */
  auth_session_lost_unexpectedly: {
    last_failure_kind?: 'revoked' | 'transient' | 'unknown';
    last_failure_age_ms?: number;
    was_authenticated: boolean;
  };
  onboarding_started: EmptyAnalyticsProperties;
  onboarding_role_selected: { role: 'artist' | 'manager' | 'label' | 'other' };
  onboarding_release_created: {
    release_id: string;
    has_release_date: boolean;
  };
  onboarding_step_skipped: { step: number };
  onboarding_completed: { time_to_complete_seconds: number };
  onboarding_abandoned: { step: number };
  onboarding_spotlight_shown: { step: number; target_selector: string };
  onboarding_spotlight_skipped: { step: number };
  onboarding_task_created_during_flow: { release_id: string; task_id: string };
  onboarding_invite_sent_during_flow: EmptyAnalyticsProperties;
  onboarding_completion_screen_shown: {
    release_created: boolean;
    task_created: boolean;
    invite_sent: boolean;
  };
  release_created: { release_id: string; source: ReleaseCreatedSource };
  release_opened: { release_id: string };
  /** `deferred` marks a date filled in AFTER creation, from the activities
   * view's SetReleaseDateCard, rather than in the create modal (URG-230).
   * `activities_created` is non-zero when that save also built a rollout
   * plan that had been waiting on the date. `activities_moved` is non-zero
   * when the date changed on a rollout that ALREADY had a plan, and the plan
   * moved with it (2026-09-25, lib/release-plan-dates-server.ts) — the fix for
   * a rename silently stranding a plan behind a stale date. The three are
   * mutually exclusive: a rollout either had no plan (created), was waiting on
   * one (built), or already had one (moved). */
  release_date_set: {
    release_id: string;
    deferred?: boolean;
    activities_created?: number;
    activities_moved?: number;
  };
  release_deleted: { release_id: string };
  playbook_step_completed: {
    release_id: string;
    step_id: string;
    step_title: string;
    is_custom: boolean;
  };
  playbook_step_uncompleted: { release_id: string; step_id: string };
  playbook_step_added: { release_id: string };
  playbook_step_deleted: { release_id: string; was_default: boolean };
  playbook_reordered: { release_id: string };
  playbook_defaults_restored: { release_id: string };
  task_created: {
    release_id: string | null;
    has_assignee: boolean;
    has_due_date: boolean;
    priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    source: TaskCreatedSource;
  };
  task_status_changed: {
    task_id: string;
    from_status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
    to_status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  };
  task_assigned: { task_id: string; assigned_to_self: boolean };
  task_completed: { task_id: string; release_id: string | null; days_until_due: number | null };
  task_overdue_viewed: { task_id: string; days_overdue: number };
  team_member_invited: { role: 'owner' | 'admin' | 'member' | 'guest' };
  task_comment_added: { task_id: string };
  task_view_switched: { view: 'kanban' | 'list' };
  feature_discovered: { feature: string };
  empty_state_cta_clicked: { feature: string; cta_label: string };
  next_action_banner_clicked: { release_id: string; action: string };
  next_action_banner_dismissed: { release_id: string; action: string };
  signup_completed: Record<string, unknown>;
  artist_created: Record<string, unknown>;
  pricing_validation_submitted: Record<string, unknown>;
  trial_started: Record<string, unknown>;
  trial_converted: Record<string, unknown>;
  // Activation funnel timing (2026-07-23): the two numbers that matter while
  // the app is free and the founders onboard teams personally. Both fire
  // server-side, once per account, computed from auth.user.created_at.
  time_to_first_release: { seconds_since_signup: number };
  time_to_first_completed_task: { seconds_since_signup: number };
  /** First real rollout + one teammate invited, within ACTIVATION_WINDOW_DAYS
   * (3) of signup. Server-side, once per account. The rule is
   * lib/activation.ts; `completed_by` is whichever action finished the pair. */
  activated: { seconds_since_signup: number; completed_by: 'release' | 'invite' };
  // UrgAns planner funnel. The question worth answering is where managers drop
  // out of a seven-question intake, and what the plan looked like when it
  // landed: how much of the playbook the answers removed, and whether the
  // model got to tailor the rest. (Until 2026-09-15 the intake produced a
  // draft to review and approve; the scene, approve and discard events went
  // with that step.)
  planner_intake_opened: { source: 'empty_state' | 'note' | 'chip'; has_release: boolean };
  planner_intake_step: { step: number };
  planner_intake_dismissed: { step: number };
  planner_plan_created: {
    source: 'empty_state' | 'note' | 'chip';
    release_type: 'single' | 'ep' | 'album';
    task_count: number;
    tasks_removed: number;
    /** Kinds of work left out: chips, the no-budget answer, and what the
     *  model read in the notes, together. */
    exclusions_count: number;
    ai_applied: boolean;
  };
  // UrgAns reply action row (2026-08-12): copy / retry / thumbs under each
  // assistant reply. Thumbs are the first structured feedback signal on
  // assistant quality — worth watching once the agent model is wired.
  urgans_reply_action: { action: 'copy' | 'retry' | 'thumbs_up' | 'thumbs_down' };
  /** Voice input for UrgAns (2026-09-25). One transcription attempt and how it
   * ended — `ok`, `empty` (nothing heard) or `error`. Carries NO transcript
   * text, and no clip: this reports the outcome of the act, never its content. */
  urgans_voice_used: {
    outcome: 'ok' | 'empty' | 'error';
    status?: number;
  };
  /** The permission gate in use (2026-08-14). `shown` fires when UrgAns
   * proposes a gated action, the other two when the user decides. Watching the
   * approve:cancel ratio per tool is how we find out whether the assistant is
   * proposing the right things — a tool that is mostly cancelled is a tool
   * being reached for wrongly. */
  urgans_confirmation: {
    action: 'shown' | 'approved' | 'cancelled';
    tool: string;
  };
  /** A crash reached a boundary and the user was shown a failure instead of the
   * thing they asked for. `scope` is 'route' for app/error.tsx, or the guarded
   * widget's name for a component boundary ('urgans-rail').
   *
   * Deliberately carries NO error message: messages here can quote API
   * responses, which can contain a teammate's email or a release title, and an
   * error report is not a place to start leaking those. `error_name` (the
   * constructor, e.g. 'TypeError') and `digest` (Next's server-error hash, which
   * is what correlates with the Vercel log) are enough to act on. */
  app_error_shown: {
    scope: string;
    pathname: string;
    error_name: string;
    digest?: string;
  };
  /**
   * An image upload that failed, reported so the founder can see WHICH step
   * broke for which account without asking anyone to open a browser console.
   *
   * The reason this exists: both upload flows already catch everything and set
   * an error string that only the one person looking at the screen ever sees.
   * When a partner says "it doesn't upload", that string is unrecoverable, and
   * you cannot reasonably ask them to press F12.
   *
   * Same privacy rule as app_error_shown above: no file names, no signed URLs,
   * no storage paths. `surface` says which uploader, `step` says how far it got
   * (1 sign, 2 storage PUT, 3 record), `status` is the HTTP status when there
   * was a response at all. That is enough to act on.
   */
  /**
   * The directory funnel: supply, demand and the mechanic that connects them.
   *
   * These are the questions worth asking of a marketplace that is cold by
   * definition, and every one of them is about a count rather than a person.
   * NO SEARCH TEXT, EVER — the search box takes somebody's name, and a private
   * search does not belong in an analytics payload any more than it belongs in
   * a durable row. `results` is bucketed by bucketResultCount for the same
   * reason: zero is the whole signal, and the difference between seven and nine
   * answers nothing while a raw count is one more way to fingerprint a small
   * team.
   *
   * The one signal that drives a decision — a role somebody wanted and nobody
   * had — is ALSO written server-side, because this app has already lost months
   * of events to a content blocker once. See lib/directory-demand.ts.
   */
  directory_profile_listed: {
    visibility: 'directory' | 'public';
    claimed_roles: number;
    has_city: boolean;
  };
  /** Fires on a settled filter, not a keystroke. */
  directory_searched: {
    has_query: boolean;
    role: string | null;
    availability: string | null;
    filtered_by_city: boolean;
    results: '0' | '1-4' | '5-19' | '20+';
  };
  directory_profile_opened: { role: string | null };
  /** The role gaps panel on a scoped release — the retention mechanic. `shown`
   *  against `role_clicked` says whether the rollout plan actually drives
   *  search; `dismissed` against a later `shown` says whether it merely
   *  interrupts, the same pair the planner review nudge is read by. */
  role_gaps_shown: { release_id: string; gaps: number };
  role_gaps_role_clicked: { release_id: string; role: string };
  role_gaps_dismissed: { release_id: string; gaps: number };
  asset_upload_failed: {
    surface: 'workspace_logo' | 'curator_photo';
    step: 1 | 2 | 3;
    status?: number;
    reason: string;
  };
  /**
   * The Catalogue artist page (2026-10-02). What teams do BETWEEN rollouts is
   * the whole point of the page, so `artist_page_viewed` carries how much the
   * artist has, and `artist_page_action` says which door was used. No names and
   * no text: ids and counts only.
   */
  artist_page_viewed: {
    artist_id: string;
    releases: number;
    upcoming_shows: number;
    has_kit: boolean;
  };
  artist_page_action: {
    artist_id: string;
    action: 'open_epk' | 'open_release' | 'open_show';
  };
  /**
   * Share to socials (2026-09-23). `opened` against `made` against `sent` is
   * the whole funnel, and `source` says whether the first-rollout offer earns
   * its interruption. NO TEXT, EVER: not the caption, not the fan link, not
   * the extra line. Those are the person's own words about an unreleased song.
   */
  social_share_opened: {
    release_id: string;
    source: 'first_release' | 'rollout_menu' | 'urgans';
  };
  social_share_made: {
    release_id: string;
    voice: 'artist' | 'team';
    date_mode: 'show' | 'secret';
    has_link: boolean;
    has_line: boolean;
  };
  social_share_sent: {
    release_id: string;
    channel: 'instagram' | 'whatsapp_status' | 'x' | 'snapchat' | 'message';
    /** `x_intent`: opened X's own "write a post" page with the text filled in. */
    method: 'share' | 'download' | 'copy' | 'whatsapp' | 'instagram_dm' | 'more' | 'x_intent';
  };
}

export type AnalyticsEventName = keyof AnalyticsEventPropertiesMap;

export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    properties: AnalyticsEventPropertiesMap[Name];
  };
}[AnalyticsEventName];

export type StoredAnalyticsEvent = {
  id: string;
  name: string;
  userId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type AnalyticsIdentity = Pick<Profile, 'id' | 'email' | 'name' | 'role' | 'created_at'> & {
  onboarding_role?: Profile['onboarding_role'];
};

/**
 * PostHog key prefixes. `phc_` is the PROJECT key — public by design, meant to
 * ship in the browser bundle. `phx_` is a PERSONAL API key — a secret that
 * grants API access to the account.
 */
const PROJECT_KEY_PREFIX = 'phc_';
const PERSONAL_KEY_PREFIX = 'phx_';

export type PostHogKeyProblem = {
  /** True when the key must NOT be used at all. */
  fatal: boolean;
  message: string;
};

/**
 * Whether this key is safe and plausible to use as the project token.
 *
 * WHY THIS EXISTS (2026-09-03). `NEXT_PUBLIC_POSTHOG_KEY` was set to a personal
 * API key rather than the project key. Two things went wrong at once, and only
 * the first was visible: posthog-js's `/array/<token>/config` request 404'd so
 * the SDK never initialised and not one event was ever recorded — and, much
 * worse, a secret was compiled into the public client bundle and served to
 * every visitor of the app, as well as being sent to PostHog in a URL query
 * string. It took a Network-tab trace to find, because a dead analytics SDK
 * looks exactly like an analytics SDK with nothing to report.
 *
 * A personal key is therefore REFUSED outright rather than warned about: the
 * whole point is to stop the secret leaving the browser. Anything else that is
 * merely unrecognised is warned about and allowed, because blocking every
 * unknown prefix would silently switch analytics off the day PostHog adds a
 * valid one.
 *
 * The key itself is never included in the message — a warning that prints the
 * secret to the console defeats its own purpose.
 */
export function describePostHogKeyProblem(key: string): PostHogKeyProblem | null {
  const trimmed = key.trim();
  // An absent key is not a problem to report here: both callers already have a
  // "not configured" path that says so more usefully.
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  if (lower.startsWith(PERSONAL_KEY_PREFIX)) {
    return {
      fatal: true,
      message:
        `PostHog is misconfigured: the key starts with "${PERSONAL_KEY_PREFIX}", which is a PERSONAL API key. ` +
        'That is a secret and must never be a NEXT_PUBLIC_ value — it is compiled into the browser bundle and ' +
        'served to every visitor. Revoke it in PostHog now, then set the PROJECT API key ' +
        `(it starts with "${PROJECT_KEY_PREFIX}", from Settings -> Project). Analytics stays off until then.`,
    };
  }

  if (!lower.startsWith(PROJECT_KEY_PREFIX)) {
    return {
      fatal: false,
      message:
        `PostHog key does not start with "${PROJECT_KEY_PREFIX}", which is what a project API key looks like. ` +
        'Continuing anyway, but if no events arrive, check Settings -> Project for the right value.',
    };
  }

  return null;
}

let hasReportedKeyProblem = false;

export function getPostHogProjectKey(): string {
  const configured =
    process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
    '';

  const problem = describePostHogKeyProblem(configured);
  if (problem) {
    // Once per process: this is called on every capture.
    if (!hasReportedKeyProblem) {
      hasReportedKeyProblem = true;
      if (problem.fatal) {
        console.error(problem.message);
      } else {
        console.warn(problem.message);
      }
    }
    if (problem.fatal) return '';
  }

  return configured;
}

export function createPostHogEvent<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventPropertiesMap[Name]
): AnalyticsEvent {
  return {
    name,
    properties,
  } as AnalyticsEvent;
}
