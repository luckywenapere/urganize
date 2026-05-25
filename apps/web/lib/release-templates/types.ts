/**
 * Release template type definitions.
 *
 * These types define the shape of hand-crafted release templates — the core IP
 * of the product. Templates are static data (not code logic) that describe the
 * default rollout plan for a given release type. The AI tailoring layer adjusts
 * templates based on release context; the templates themselves are readable and
 * editable without touching application code.
 *
 * @see CLAUDE.md "Hand-crafted release templates" section
 */

// ---------------------------------------------------------------------------
// Enums as string literal unions
// ---------------------------------------------------------------------------

/**
 * The type of music release. Maps to the `release_type` enum in the database
 * (which currently has 'single' | 'ep' | 'album'). Templates add 'music_video'
 * as a distinct rollout shape that can be standalone or attached to an audio
 * release.
 */
export type ReleaseType = 'single' | 'ep' | 'album' | 'music_video';

/**
 * Who is responsible for a template task by default. These are role archetypes,
 * not specific people — the loader maps them to real collaborators at planning
 * time.
 *
 * - `artist`  — the artist themselves (e.g., record vocals, approve artwork)
 * - `manager` — the release manager / ICP user
 * - `marketing_lead` — person handling promotion and social strategy
 * - `designer` — visual asset creator (cover art, promo graphics)
 * - `distributor_contact` — the distribution partner (e.g., DistroKid rep)
 * - `team` — anyone on the team; assigned at planning time
 */
export type TaskRole =
  | 'artist'
  | 'manager'
  | 'marketing_lead'
  | 'designer'
  | 'distributor_contact'
  | 'team';

/**
 * Distinguishes general work items from dated milestone points on the release
 * timeline.
 *
 * - `task` — a work item with a duration (e.g., "finalize artwork")
 * - `event_milestone` — a dated point (e.g., listening party, release day)
 */
export type TemplateTaskType = 'task' | 'event_milestone';

// ---------------------------------------------------------------------------
// Template task
// ---------------------------------------------------------------------------

/**
 * A single task within a template, before it's instantiated against a real
 * release. Template tasks are abstract — they describe *what* needs to happen
 * and *when* relative to the release date, but don't reference real users,
 * real dates, or real database rows.
 */
export interface TemplateTask {
  /**
   * Stable string identifier, unique within the template. Used for dependency
   * references in `depends_on`. Convention: lowercase snake_case
   * (e.g., 'finalize_artwork', 'submit_to_distributor').
   */
  id: string;

  /** Short human-readable title shown in the task list. */
  title: string;

  /** Longer free-text description explaining what this task involves. */
  description: string;

  /** The default role responsible for this task. */
  role: TaskRole;

  /** Whether this is a general work item or a dated milestone. */
  type: TemplateTaskType;

  /**
   * Days relative to the release date. Negative = before release day,
   * zero = release day, positive = after release day.
   *
   * Examples:
   * - `-56` → 8 weeks before release
   * - `-7`  → 1 week before release
   * - `0`   → release day
   * - `7`   → 1 week after release
   */
  offset_days: number;

  /**
   * Expected duration of this task in days. Defaults to 1.
   * For event milestones this is typically 1 (single-day event).
   */
  duration_days: number;

  /**
   * IDs of other TemplateTask entries within the same template that must
   * complete before this task can start. References `TemplateTask.id` values.
   */
  depends_on?: string[];

  /**
   * If true, the AI tailoring layer may drop this task based on release
   * context (e.g., no marketing budget → drop paid promo tasks). Non-optional
   * tasks are always included regardless of context.
   */
  optional: boolean;

  /**
   * Freeform tags for grouping and filtering tasks within a template.
   * Examples: 'marketing', 'distribution', 'asset_production', 'legal'.
   */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/**
 * A full release template — the complete rollout plan for a given release type.
 * Templates are static, hand-written, version-controlled TypeScript data.
 * Each template file exports a single `Template` object.
 */
export interface Template {
  /**
   * Unique string identifier for this template.
   * Convention: `{release_type}_v{major}` (e.g., 'single_v1', 'ep_v1').
   */
  id: string;

  /** Which type of release this template applies to. */
  release_type: ReleaseType;

  /**
   * Human-readable name displayed in the UI when the user picks a template.
   * Example: 'Single Release — 8 Week Rollout'.
   */
  name: string;

  /** Short summary of what this template covers and who it's for. */
  description: string;

  /**
   * Total duration from the start of the rollout to release day, in days.
   * Example: 56 for an 8-week rollout. The most negative `offset_days` in
   * `tasks` should roughly equal `-default_duration_days`.
   */
  default_duration_days: number;

  /** Ordered list of tasks that make up this template's rollout plan. */
  tasks: TemplateTask[];

  /**
   * Semantic version of this template (e.g., '0.1.0'). Bump when the
   * template content changes so existing releases can reference the version
   * they were generated from.
   */
  version: string;
}

// ---------------------------------------------------------------------------
// Release context (AI tailoring input)
// ---------------------------------------------------------------------------

/**
 * Context about a specific release, provided as input to the AI tailoring
 * layer. The tailoring layer uses this to adjust a base template — dropping
 * optional tasks, shifting offsets, reassigning roles — before the user
 * reviews and commits the plan.
 *
 * Defined now so the template, loader, and AI layer all share the same shape.
 */
export interface ReleaseContext {
  /** The type of release being planned. */
  release_type: ReleaseType;

  /**
   * Target release date as an ISO 8601 date string (YYYY-MM-DD).
   * Task dates are computed by adding `TemplateTask.offset_days` to this date.
   */
  release_date: string;

  /**
   * Scale of the artist. Affects which optional tasks are included and how
   * aggressive the rollout timeline is.
   *
   * - `emerging` — small audience, limited press contacts, grassroots strategy
   * - `established` — existing fanbase, press relationships, larger campaigns
   */
  artist_scale: 'emerging' | 'established';

  /**
   * Marketing budget tier. The AI tailoring layer drops paid promotion tasks
   * when budget is 'none' and scales campaign scope based on tier.
   */
  marketing_budget: 'none' | 'small' | 'medium' | 'large';

  /**
   * Number of people on the release team (including the manager). Affects
   * how tasks are distributed across roles — a team of 1 means the manager
   * does everything; a team of 5+ can parallelize.
   */
  team_size: number;

  /**
   * Optional free-text from the user about anything special for this release.
   * Passed to the AI tailoring layer as additional context. Examples:
   * "This is a surprise drop", "We have a sync placement confirmed",
   * "Artist is on tour during weeks 3-5".
   */
  notes?: string;
}
