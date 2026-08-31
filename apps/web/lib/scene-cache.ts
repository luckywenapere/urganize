// Pure cache policy for the release scenes (Metadata / Files / Press kit /
// Calendar). No React, no I/O — the store (stores/useSceneDataStore.ts) owns
// the localStorage reads/writes and the fetching; this module owns the rules
// about WHAT may be cached, for HOW long, and how much of it to keep.
//
// Why a cache at all: the scenes are inline panels on /dashboard, so opening
// one is a single click with no route transition — but every open re-fetched
// from scratch behind a spinner, even re-opening the same scene seconds later.
// On a high-latency mobile link that reads as "the app is slow", which it
// isn't; it's just doing the same round trip again.

/** The release scenes. Canonical here (not in the URL hook) because both
 * the URL layer and the data layer need the list, and lib is the shared floor. */
export type SceneName =
  | 'metadata'
  | 'files'
  | 'epk'
  | 'calendar'
  | 'pitch'
  | 'plan'
  | 'capture'
  | 'song'
  | 'coverart'
  | 'timeline';

export const SCENE_NAMES: readonly SceneName[] = [
  'metadata',
  'files',
  'epk',
  'calendar',
  'pitch',
  'plan',
  'capture',
  'song',
  'coverart',
  'timeline',
];

// Inlined at build time, same read every UI gate uses. The prefetch list must
// respect it: with the flag off the calendar API routes 404, so prefetching
// the scene burned one guaranteed-404 request per scoped release.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';
const SONG_UPLOAD_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';
const COVER_ART_ENABLED = process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';
const TIMELINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TIMELINE === 'true';

/** Prefetch order: most-likely-opened first, so a user who taps a pill mid-
 * prefetch is most likely to find their scene already warm.
 *
 * 'plan' is deliberately absent. It is the one scene that EDITS its payload
 * under an autosave queue, so a cached copy is a corruption risk rather than a
 * speedup, and it only exists for releases with no plan yet — prefetching it
 * would 404 on almost every release. It fetches its own draft directly.
 *
 * 'calendar' and 'capture' are present only when their feature flags are on,
 * for the same would-always-404 reason.
 *
 * 'metadata' joined them 2026-08-27. It had been unconditional, but its fetcher
 * hits /metadata AND /credits, and the credits route has always 404'd with the
 * flag off — and readJson throws on a non-ok response. So with the flag off
 * this prefetch already spent two requests per release and then threw; the
 * metadata route is gated now too, which would have made it two guaranteed
 * 404s. */
export const SCENE_PREFETCH_ORDER: readonly CacheableSceneName[] = [
  ...(METADATA_ENABLED ? (['metadata'] as const) : []),
  ...(COVER_ART_ENABLED ? (['coverart'] as const) : []),
  ...(SONG_UPLOAD_ENABLED ? (['song'] as const) : []),
  'files',
  'epk',
  ...(CONTENT_CALENDAR_ENABLED ? (['calendar'] as const) : []),
  'pitch',
  ...(CAPTURE_ENABLED ? (['capture'] as const) : []),
];

/**
 * Resolve the `?scene=` param into the scene that is actually RENDERING, or
 * null.
 *
 * Two jobs in one place, and the second is why this lives in lib rather than
 * beside any one consumer: the param has to be a known scene name, AND its
 * feature flag has to be on, because with a flag off the pill never renders and
 * the API routes 404 — so a stale URL must read as "no scene open".
 *
 * WHY IT IS SHARED. This exact expression was hand-rolled in three places
 * (WorkspaceView, which builds the scene body; TasksPanel, which decides
 * which pill is lit; and now WorkspaceSkeleton, which has to reserve the same
 * layout the real view will paint). They drifted once already — TasksPanel's
 * copy was missing 'song' and 'coverart' long after the real gate had them —
 * and a layout decision computed two ways is the bug class this consolidation
 * exists to end.
 *
 * DELIBERATELY ONLY FIVE FLAGS. metadata / files / epk / pitch / plan are NOT
 * gated here, matching the behaviour this replaces exactly: those scenes gate
 * themselves inside ReleaseScenePanel and their own pills, and adding them here
 * would change which scenes render rather than just consolidating the check.
 * If one of them ever needs URL-level gating, it belongs here — but that is a
 * behaviour change, not a tidy-up.
 */
export function resolveActiveScene(rawParam: string | null): SceneName | null {
  if (!rawParam || !(SCENE_NAMES as readonly string[]).includes(rawParam)) return null;
  const scene = rawParam as SceneName;
  if (scene === 'calendar' && !CONTENT_CALENDAR_ENABLED) return null;
  if (scene === 'capture' && !CAPTURE_ENABLED) return null;
  if (scene === 'song' && !SONG_UPLOAD_ENABLED) return null;
  if (scene === 'coverart' && !COVER_ART_ENABLED) return null;
  if (scene === 'timeline' && !TIMELINE_ENABLED) return null;
  return scene;
}

/** Within this window a cached scene is served with NO network call at all.
 * Matches useWorkspaceIdentityStore's 30s — long enough that the tap-around-
 * the-scenes loop is free, short enough that a teammate's edit shows up fast. */
export const SCENE_FRESH_MS = 30_000;

/** Older than this, the persisted copy is discarded rather than painted. A day
 * covers "close the laptop, come back tomorrow" without ever showing data old
 * enough to mislead. */
export const SCENE_PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Scenes whose payload changes WITHOUT the owner doing anything, because a
 * public form writes into them server-side. For these a fresh-looking cache
 * entry can still be wrong, so SCENE_FRESH_MS must not suppress the network
 * call: they paint from cache exactly as before and then always revalidate in
 * the background on a real (non-prefetch) load.
 *
 * `metadata` carries the collaborator credit submissions, and the spec is
 * explicit that a new submission has to be there when the owner looks. Without
 * this, a submission landing inside the 30s window was invisible even after a
 * full page reload, because the disk-adoption path returns a still-fresh
 * persisted copy with zero requests.
 *
 * `capture` has the identical shape of bug (fans post leads to a public page)
 * and is deliberately NOT included yet — that scene is not what this pass was
 * asked to fix, and adding it here later is a one-line change.
 */
export const SCENE_REVALIDATE_ON_LOAD: Partial<Record<SceneName, boolean>> = {
  metadata: true,
};

export function shouldRevalidateOnLoad(scene: SceneName): boolean {
  return SCENE_REVALIDATE_ON_LOAD[scene] === true;
}

/**
 * Beyond this age a MEMORY entry must not be rendered at all — the load blocks
 * on a refetch instead of painting-then-revalidating.
 *
 * Only the files scene has one, and the reason is specific: its payload carries
 * Supabase Storage signed `download_url`s with a 1h TTL
 * (ASSET_SIGNED_URL_TTL_SECONDS). Painting a URL that's about to expire hands
 * the user download buttons that 403. 45 minutes keeps a 15-minute margin.
 * The other scenes are plain JSON with no embedded credentials, so a stale
 * paint followed by a background refresh is strictly better than a spinner.
 */
export const SCENE_HARD_EXPIRY_MS: Partial<Record<SceneName, number>> = {
  files: 45 * 60 * 1000,
  // Same reason as files, one step more visible: the song scene's payload
  // carries a signed URL that an <audio> element is pointed at, so a stale
  // paint is a play button that 403s rather than merely a dead download.
  song: 45 * 60 * 1000,
  // Same reason again: an <img> pointed at an expired signed URL renders a
  // broken-image icon where the cover art should be.
  coverart: 45 * 60 * 1000,
};

/**
 * The scenes whose payload the cache layer knows how to fetch and store.
 *
 * 'plan' is a scene in every other sense — it has a pill, a URL and a panel —
 * but it owns its own reads and writes (see usePlanDraft) because it is an
 * editable document rather than a snapshot. Keeping it out of this type means
 * the store cannot be given a meaningless fetcher for it, and the compiler
 * enforces that rather than a comment.
 *
 * 'timeline' is out for the opposite reason: it fetches NOTHING. It is laid out
 * entirely from the activities TasksPanel already has in props, so there is no
 * payload to cache, no route to prefetch, and a fetcher for it would have to
 * invent a request that does not exist.
 */
export type CacheableSceneName = Exclude<SceneName, 'plan' | 'timeline'>;

export const isCacheableScene = (scene: SceneName): scene is CacheableSceneName =>
  scene !== 'plan' && scene !== 'timeline';

/**
 * Which scenes may touch localStorage.
 *
 * `files` is false for the same signed-URL reason as above, one step stronger:
 * a persisted URL survives a browser restart and would be GUARANTEED expired on
 * the next visit. Nothing with a credential in it goes to disk.
 */
export const SCENE_PERSISTED: Record<SceneName, boolean> = {
  metadata: true,
  files: false,
  epk: true,
  calendar: true,
  // Plain JSON: pitch rows carry a song link the pitcher typed, not a signed
  // one, so nothing here expires on disk.
  pitch: true,
  // The plan draft is a document being edited, not a read. Painting a cached
  // copy under live edits could overwrite newer text with older, so it never
  // goes to disk or memory — see SCENE_PREFETCH_ORDER.
  plan: false,
  // Never to disk, for a reason unlike any other scene here: the payload
  // carries fans' EMAIL ADDRESSES. localStorage is readable by any script that
  // ever runs on this origin and survives sign-out on a shared machine, and
  // "faster second open" is not worth putting other people's contact details
  // there. Memory caching still applies, so tapping between scenes stays free.
  capture: false,
  // Signed Storage URLs again (see files): a persisted one survives a browser
  // restart and would be guaranteed expired by the next visit.
  song: false,
  coverart: false,
  // Nothing to persist: the timeline is laid out from the activities the
  // workspace already holds, so it has no payload of its own. See
  // CacheableSceneName.
  timeline: false,
};

/** How many releases' scenes to keep on disk. A manager works a couple of
 * releases at a time; keeping every release a workspace ever had would grow
 * localStorage without bound for no benefit. */
export const SCENE_CACHE_MAX_RELEASES = 4;

/** Skip persisting anything larger than this. localStorage is a ~5MB
 * per-origin budget shared with auth, the command-center cache, and settings —
 * one oversized calendar must not be able to evict all of it (or throw
 * QuotaExceededError on write). */
export const SCENE_PERSIST_MAX_BYTES = 120_000;

export const SCENE_CACHE_KEY = 'urganize.cache.scenes';
/** Bump to invalidate every persisted scene fleet-wide — the kill switch if a
 * payload shape changes or a cached-data bug ships. */
export const SCENE_CACHE_VERSION = 1;

export type SceneCacheEntry = {
  savedAt: number;
  data: unknown;
};

export type SceneCachePayload = {
  /** Cached scenes are per-account; a mismatch discards the whole payload
   * rather than risking one user seeing another's release data. */
  userId: string;
  entries: Record<string, SceneCacheEntry>;
};

/** Composite key for one release's one scene inside the payload map. */
export function sceneEntryKey(releaseId: string, scene: SceneName): string {
  return `${releaseId}:${scene}`;
}

/** The releaseId half of an entry key. Empty string for a malformed key. */
export function releaseIdFromEntryKey(key: string): string {
  const separator = key.lastIndexOf(':');
  return separator > 0 ? key.slice(0, separator) : '';
}

export function shouldPersistScene(scene: SceneName): boolean {
  return SCENE_PERSISTED[scene] === true;
}

/** True when a cached entry is young enough to serve without any network. */
export function isSceneFresh(savedAt: number, now: number): boolean {
  return now - savedAt < SCENE_FRESH_MS;
}

/** False when the entry is too old to even PAINT (see SCENE_HARD_EXPIRY_MS). */
export function isSceneRenderable(scene: SceneName, savedAt: number, now: number): boolean {
  const hardExpiry = SCENE_HARD_EXPIRY_MS[scene];
  if (typeof hardExpiry !== 'number') return true;
  return now - savedAt < hardExpiry;
}

export function isSceneCachePayload(value: unknown): value is SceneCachePayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SceneCachePayload>;
  if (typeof candidate.userId !== 'string' || !candidate.userId) return false;
  if (!candidate.entries || typeof candidate.entries !== 'object') return false;
  return Object.values(candidate.entries).every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const savedAt = (entry as Partial<SceneCacheEntry>).savedAt;
    return typeof savedAt === 'number' && Number.isFinite(savedAt);
  });
}

/**
 * LRU-trim to the most recently saved `maxReleases` releases. Trims by RELEASE,
 * not by entry, so a release keeps all four of its scenes or none — evicting
 * half a release's scenes would just make the next visit half-slow for no
 * meaningful space saving.
 */
export function trimSceneCacheEntries(
  entries: Record<string, SceneCacheEntry>,
  maxReleases: number = SCENE_CACHE_MAX_RELEASES
): Record<string, SceneCacheEntry> {
  const newestByRelease = new Map<string, number>();
  for (const [key, entry] of Object.entries(entries)) {
    const releaseId = releaseIdFromEntryKey(key);
    if (!releaseId) continue;
    const current = newestByRelease.get(releaseId) ?? 0;
    if (entry.savedAt > current) newestByRelease.set(releaseId, entry.savedAt);
  }

  if (newestByRelease.size <= maxReleases) return entries;

  const keep = new Set(
    Array.from(newestByRelease.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, maxReleases)
      .map(([releaseId]) => releaseId)
  );

  const trimmed: Record<string, SceneCacheEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (keep.has(releaseIdFromEntryKey(key))) trimmed[key] = entry;
  }
  return trimmed;
}

/** Guard against one huge payload eating the origin's storage budget. */
export function withinPersistBudget(serialized: string): boolean {
  return serialized.length <= SCENE_PERSIST_MAX_BYTES;
}
