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
  // Not a scene in the original sense — it is the activity buckets, which used
  // to BE the panel and had no name because it was whatever rendered when no
  // scene was open. It became nameable when the timeline took over as the main
  // view (2026-09-06) and the buckets needed a URL of their own to switch to.
  // Deliberately ungated: it is resolveMainView's fallback, so it has to
  // resolve in every flag state or a rollback leaves the panel blank.
  | 'activities'
  | 'metadata'
  | 'files'
  | 'calendar'
  | 'pitch'
  | 'capture'
  | 'coverart'
  | 'timeline'
  // Release chat (Release & Task Chat, Phase 1) — a thread scoped to the
  // release, visible to anyone with release access. Not "chat", the object
  // renamed to "rollout" in user-facing copy (2026-09-09), but scene NAMES
  // are identifiers like every other entry here, not copy.
  | 'chat'
  // The release pitch kit (2026-10-01): the story and credits a rollout adds
  // to the artist's standing press kit. Fetches for itself and is not cached,
  // like the timeline: it is edited in place, and a cached copy painted over a
  // live edit is the failure the old plan scene was kept out of the cache for.
  | 'pitchkit'
  // Distribution, step one (2026-10-03): readiness for the distribution partner
  // and the hand-off to their sign-up. Fetches for itself and is not cached: the
  // checklist is what a manager comes BACK to after fixing something, so a
  // cached copy painted first would show the item they just fixed as still open.
  | 'distribute'
  // Release spend (2026-10-09): what the team paid for on the rollout. Fetches for
  // itself and is NEVER cached or persisted, for a reason no other scene has:
  // the payload is MONEY, visible to the owner and team managers only, and a
  // copy painted from disk or memory could outlive a change in who may see it.
  | 'spend'
  // Promo channels (GitHub #833, 2026-10-11): the directory of radio, blogs, X
  // communities and SoundCloud networks a team can add to the plan. Fetches for
  // itself and is not cached: the directory changes as admins approve
  // suggestions, and it is opened a few times a rollout, not tapped around.
  | 'promo'
  // The release brief (URG-281, 2026-10-16): the idea, references, dates, who's
  // on what and decisions on one page. Fetches for itself and is not cached: the
  // Idea autosaves in place, and a cached copy painted over a live edit is the
  // failure the pitch kit stays out of the cache for.
  | 'brief';

export const SCENE_NAMES: readonly SceneName[] = [
  'activities',
  'metadata',
  'files',
  'calendar',
  'pitch',
  'capture',
  'coverart',
  'timeline',
  'chat',
  'pitchkit',
  'distribute',
  'spend',
  'promo',
  'brief',
];

// Inlined at build time, same read every UI gate uses. Both consumers below
// must respect them: with a flag off that scene's API routes 404, so
// prefetching it burned one guaranteed-404 request per scoped release, and
// resolving its URL param opened a header with nothing under it.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const CAPTURE_ENABLED = (process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true' || process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false');
const COVER_ART_ENABLED = process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';
const TIMELINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TIMELINE === 'true';
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const RELEASE_CHAT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_CHAT === 'true';
const PITCH_KIT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCH_KIT === 'true';
// Ships ON: unset is on, only "false" switches it off (lib/release-brief-flag.ts).
const RELEASE_BRIEF_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_BRIEF !== 'false';

/** Prefetch order: most-likely-opened first, so a user who taps a pill mid-
 * prefetch is most likely to find their scene already warm.
 *
 * (Until 2026-09-15 a 'plan' scene existed and was deliberately absent here,
 * because it edited its payload under an autosave queue. The review step is
 * gone: the plan is built straight into activities, and the summary the
 * manager reads afterwards is a plain GET the PlanBuiltBanner makes itself.)
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
  ...(FILES_ENABLED ? (['files'] as const) : []),
  ...(CONTENT_CALENDAR_ENABLED ? (['calendar'] as const) : []),
  ...(PITCHING_ENABLED ? (['pitch'] as const) : []),
  ...(CAPTURE_ENABLED ? (['capture'] as const) : []),
  ...(RELEASE_CHAT_ENABLED ? (['chat'] as const) : []),
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
 * copy was missing two scenes long after the real gate had them —
 * and a layout decision computed two ways is the bug class this consolidation
 * exists to end.
 *
 * EVERY FLAG-GATED SCENE IS GATED HERE, and getting there was a behaviour
 * change with founder sign-off (2026-09-08) rather than a tidy-up.
 *
 * This used to gate five scenes and deliberately skip metadata / files / pitch
 * / plan (the review scene, gone since 2026-09-15), on the reasoning that
 * "those scenes gate themselves inside
 * ReleaseScenePanel and their own pills". The second half was true; THE FIRST
 * HALF WAS NOT — ReleaseScenePanel reads no feature flag at all, and never
 * has. So those four had no URL-level gate anywhere: a stale bookmark, a
 * shared link or a scene remembered from before a flag was switched off opened
 * a header with a dead fetch under it. Files has been off in production since
 * v0.16.4, so `?scene=files` was that empty page for anyone holding an old
 * link.
 *
 * Founder call: an old link to something since switched off should quietly
 * open the release instead. That is what resolvePanelBody's fallback already
 * did for the other five, so this makes the set consistent rather than
 * inventing anything.
 */
export function resolveActiveScene(rawParam: string | null): SceneName | null {
  if (!rawParam || !(SCENE_NAMES as readonly string[]).includes(rawParam)) return null;
  const scene = rawParam as SceneName;
  if (scene === 'calendar' && !CONTENT_CALENDAR_ENABLED) return null;
  if (scene === 'capture' && !CAPTURE_ENABLED) return null;
  if (scene === 'coverart' && !COVER_ART_ENABLED) return null;
  if (scene === 'timeline' && !TIMELINE_ENABLED) return null;
  if (scene === 'metadata' && !METADATA_ENABLED) return null;
  if (scene === 'files' && !FILES_ENABLED) return null;
  if (scene === 'pitch' && !PITCHING_ENABLED) return null;
  if (scene === 'chat' && !RELEASE_CHAT_ENABLED) return null;
  if (scene === 'pitchkit' && !PITCH_KIT_ENABLED) return null;
  // Spend is cut (Oct 16, 2026 brief, URG-319): an old ?scene=spend link (the
  // payback email, the Home spend card) lands on the rollout's main view.
  if (scene === 'spend') return null;
  // Pitch this! holds the kit and promo since 2026-10-16, so their old links
  // (emails, bookmarks, Plan built's "Find promo") open it.
  if ((scene === 'pitchkit' || scene === 'promo') && PITCHING_ENABLED) return 'pitch';
  if (scene === 'brief' && !RELEASE_BRIEF_ENABLED) return null;
  return scene;
}

/**
 * The two views that can own the release panel when no particular scene is
 * asked for. One of them is always what a scoped release lands on.
 */
export type ReleaseMainView = 'timeline' | 'activities';

/**
 * Which view a scoped release lands on.
 *
 * Until 2026-09-06 this was not a question: the panel showed the activity
 * buckets whenever no scene was open. The founder's call is that the timeline
 * is the better landing surface — *"it represents how creatives think and is
 * better and more peaceful"* — because the buckets ship COLLAPSED, so a release
 * with 63 activities opened onto five closed drawers and five counts.
 *
 * `NEXT_PUBLIC_FEATURE_TIMELINE` decides it, which is deliberate rather than a
 * second flag: the timeline being available and the timeline being the main
 * view are the same question, and a release cannot land on a view its own flag
 * has switched off. Flag off, every path here is byte-identical to before.
 */
export function resolveMainView(): ReleaseMainView {
  return TIMELINE_ENABLED ? 'timeline' : 'activities';
}

/**
 * What the release panel should actually render for a given `?scene=` param.
 *
 * The one place that answers it, so the body (WorkspaceView), the lit pill
 * (TasksPanel) and the reserved layout (WorkspaceSkeleton) cannot disagree —
 * the same drift this module already exists to end for `resolveActiveScene`.
 *
 * Never returns null: an absent, unknown or flag-gated-off param all mean "no
 * particular scene", which means the main view. That is what keeps a bookmark
 * to `?scene=timeline` useful after a rollback — it lands on the bucket list
 * rather than on a blank panel.
 */
export function resolvePanelBody(
  rawParam: string | null,
  /** The rollout has no release day. Its timeline has nothing to draw, so it
   *  lands on Work the plan (2026-10-26). An explicit `?scene=timeline` still
   *  opens the timeline. */
  dateless = false
): SceneName | ReleaseMainView {
  return resolveActiveScene(rawParam) ?? (dateless ? 'activities' : resolveMainView());
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
  // Same reason again: an <img> pointed at an expired signed URL renders a
  // broken-image icon where the cover art should be.
  coverart: 45 * 60 * 1000,
};

/**
 * The scenes whose payload the cache layer knows how to fetch and store.
 *
 * 'timeline' is out because it fetches NOTHING. It is laid out
 * entirely from the activities TasksPanel already has in props, so there is no
 * payload to cache, no route to prefetch, and a fetcher for it would have to
 * invent a request that does not exist.
 */
export type CacheableSceneName = Exclude<
  SceneName,
  'timeline' | 'activities' | 'pitchkit' | 'distribute' | 'spend' | 'promo' | 'brief'
>;

export const isCacheableScene = (scene: SceneName): scene is CacheableSceneName =>
  scene !== 'timeline' &&
  scene !== 'activities' &&
  scene !== 'pitchkit' &&
  scene !== 'distribute' &&
  scene !== 'spend' &&
  scene !== 'promo' &&
  scene !== 'brief';

/**
 * Which scenes may touch localStorage.
 *
 * `files` is false for the same signed-URL reason as above, one step stronger:
 * a persisted URL survives a browser restart and would be GUARANTEED expired on
 * the next visit. Nothing with a credential in it goes to disk.
 */
export const SCENE_PERSISTED: Record<SceneName, boolean> = {
  // Same reason as the timeline below: the buckets are grouped from the
  // activities TasksPanel already holds, so there is no payload of its own.
  activities: false,
  metadata: true,
  files: false,
  calendar: true,
  // Plain JSON: pitch rows carry a song link the pitcher typed, not a signed
  // one, so nothing here expires on disk.
  pitch: true,
  // Never to disk, for a reason unlike any other scene here: the payload
  // carries fans' EMAIL ADDRESSES. localStorage is readable by any script that
  // ever runs on this origin and survives sign-out on a shared machine, and
  // "faster second open" is not worth putting other people's contact details
  // there. Memory caching still applies, so tapping between scenes stays free.
  capture: false,
  // Signed Storage URLs again (see files): a persisted one survives a browser
  // restart and would be guaranteed expired by the next visit.
  coverart: false,
  // Nothing to persist: the timeline is laid out from the activities the
  // workspace already holds, so it has no payload of its own. See
  // CacheableSceneName.
  timeline: false,
  // Plain JSON, no signed URLs or credentials — same reasoning as pitch.
  chat: true,
  // Fetches for itself and is never cached (see CacheableSceneName).
  pitchkit: false,
  distribute: false,
  // Never to disk: it is money (see SceneName).
  spend: false,
  // Fetches for itself and is not cached (see SceneName).
  promo: false,
  brief: false,
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
