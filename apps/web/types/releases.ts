export const RELEASE_PIPELINE_STATES = [
  'idea',
  'planning',
  'asset_prep',
  'distribution',
  'campaign',
  'post_release',
] as const;

export type ReleasePipelineState = (typeof RELEASE_PIPELINE_STATES)[number];

export const RELEASE_STATUS_OPTIONS = [
  'draft',
  'planning',
  'in_progress',
  'ready',
  'released',
  'archived',
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUS_OPTIONS)[number];

/**
 * The values the database `public.release_type` enum accepts, and therefore the
 * only release types that can be stored.
 *
 * Deliberately NARROWER than ReleaseType in lib/release-templates/types.ts,
 * which also includes 'music_video': that is a template-layer shape with no
 * enum value and no authored playbook, so writing it to a release row fails at
 * the Postgres boundary. Adding it needs a migration
 * (`alter type public.release_type add value 'music_video'`), not a TS change.
 */
export const DB_RELEASE_TYPES = ['single', 'ep', 'album'] as const;

export type DbReleaseType = (typeof DB_RELEASE_TYPES)[number];

/** Narrowing guard for untrusted input (request bodies, stored rows). */
export function isDbReleaseType(value: unknown): value is DbReleaseType {
  return (
    typeof value === 'string' && (DB_RELEASE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Applied server-side when a release is created without a title (URG-230 —
 * the title became optional). This exact string was already the read-time
 * fallback in lib/services/release-service.ts for rows with an empty title,
 * so naming it here centralizes one value rather than introducing a second.
 *
 * The UI compares against it to decide whether to offer a rename in
 * SetReleaseDateCard: a release still carrying the default has never been
 * named, and there is no other rename affordance anywhere in the app.
 */
export const DEFAULT_RELEASE_TITLE = 'Untitled rollout';

/**
 * Every title the SERVER has ever applied to an unnamed release. The default
 * was "Untitled release" until the 2026-09-09 rollout rename, and rows created
 * before then still carry it, so comparing against DEFAULT_RELEASE_TITLE alone
 * treats those rows as deliberately named. That is how the date card's name
 * field quietly stopped appearing for them.
 */
export const DEFAULT_RELEASE_TITLES: readonly string[] = [DEFAULT_RELEASE_TITLE, 'Untitled release'];

const DEFAULT_RELEASE_TITLE_KEYS = new Set(
  DEFAULT_RELEASE_TITLES.map((title) => title.toLowerCase())
);

/**
 * True when a release still carries a server-applied placeholder rather than a
 * name somebody chose. Empty counts too: the read path renders an empty title
 * as the default. Case and surrounding whitespace are ignored, because a title
 * typed back as "untitled rollout" is still not a name.
 */
export function isDefaultReleaseTitle(title: string | null | undefined): boolean {
  const trimmed = String(title ?? '').trim();
  return !trimmed || DEFAULT_RELEASE_TITLE_KEYS.has(trimmed.toLowerCase());
}

export interface Release {
  id: string;
  ownerUserId: string;
  title: string;
  /** FK to public.artists.id. Canonical link, added Phase 1 of the
   * workspace-scoped artists initiative. `artistName` is now a write-through
   * cache derived from artists.name on create/rename — never read it as the
   * source of truth when you need to mutate. UI surfaces keep reading
   * artistName because it's cheap and indexed at the release row. */
  artistId: string;
  /** Write-through cache of `artists.name` at last release create or
   * artist rename. Display path uses this; mutation path must go through
   * artistId. */
  artistName: string;
  /** Which playbook this release is planned from. Rows predating the read path
   * fall back to 'single', which is what every release was implicitly created
   * as before the type picker landed. */
  releaseType: DbReleaseType;
  status: ReleaseStatus;
  state: ReleasePipelineState;
  releaseDate: string | null;
  description: string | null;
  /** True when this release was created with the Rollout plan but no release
   * date, so its activities have not been generated yet (URG-230). Template
   * offsets are relative to release day, so the plan waits for a date rather
   * than materializing undated. Cleared the moment a date is set via
   * POST /api/releases/[releaseId]/schedule. */
  templatePending: boolean;
  readinessScore: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
