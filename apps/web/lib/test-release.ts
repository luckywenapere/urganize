/**
 * "This release is a test" — the marker behind the test path
 * (NEXT_PUBLIC_FEATURE_TEST_RELEASE, founder request 2026-09-01).
 *
 * One tap on the zero-release empty state (or the first-release pop-up's
 * quiet link) creates a canned release from `buildTestReleaseDraft` so a
 * curious user can look around without inventing real release details. The
 * marker is what the workspace keys the "Test" card tag and the standing
 * TestReleaseBanner on — the banner that carries the path's exit, "Delete
 * test release".
 *
 * WHY IN `metadata` RATHER THAN A COLUMN: the lib/release-planner-pending.ts
 * reasoning verbatim — `releases.metadata` is JSONB, already selected by the
 * command-center query AND forwarded raw onto the client `Release.metadata`,
 * so marking a release costs no migration and reading the mark costs zero new
 * API surface. It is written by the isTest branch of POST /api/releases and,
 * since #1442 (2026-11-28), by the owner through POST
 * /api/releases/[releaseId]/test and by the daily sweep; see the block below.
 *
 * INVARIANT AT THE WRITE SITE: the create route writes `metadata` through
 * three mutually-exclusive object spreads (template_pending / planner_pending
 * / test_release). isTest forces plannerPending off and refuses a missing
 * release date with a 400, which is what keeps all three provably exclusive —
 * see the comment beside the insert in app/api/releases/route.ts before
 * touching either side.
 */

const TEST_RELEASE_KEY = 'test_release';

type ReleaseMetadata = Record<string, unknown> | null | undefined;

/**
 * Whether the test path is switched on. Read from the env at CALL time (the
 * isReleasePlannerEnabled convention — there is no shared featureEnabled
 * helper in this repo). Gates the entry buttons, the banner/tag reads, and
 * the route's acceptance of `isTest` (a loud 400 when off, so a stale client
 * can never silently mint an unmarked release titled "Test release").
 */
export function isTestReleaseEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_TEST_RELEASE === 'true';
}

/** Reads the marker off a release row's `metadata`. Absent/malformed → false. */
export function readTestRelease(metadata: ReleaseMetadata): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[TEST_RELEASE_KEY] === true;
}

/**
 * Returns `metadata` with the marker set or cleared, preserving every other
 * key. Read-modify-write, because `metadata` is a single JSONB column shared
 * with anything else stored on the release — a bare overwrite would drop it.
 *
 * Clearing removes the key rather than storing `false`, so a release that
 * was never a test (or stops being treated as one) carries no trace.
 */
export function writeTestRelease(
  metadata: ReleaseMetadata,
  isTest: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};

  if (isTest) {
    base[TEST_RELEASE_KEY] = true;
  } else {
    delete base[TEST_RELEASE_KEY];
  }

  return base;
}

// --- Marking an ordinary rollout as a test (#1442, 2026-11-28) -------------
//
// Founder: "we need a way to know the difference between release that are
// actually real and the one that were just tests" and "we need to
// automatically tag the test rollouts". So the same `test_release` marker can
// now also be set on an ordinary rollout, by its owner from the rollout menu,
// or by the daily sweep (lib/test-release-sweep-server.ts) for a rollout that
// lib/release-reality.ts reads as a test.
//
// Two more keys keep that honest:
// - test_release_auto: the sweep set the marker, not a person. Only shown to
//   us; it tells an automatic tag from a deliberate one.
// - test_release_dismissed: somebody said "it's real". The sweep never tags a
//   dismissed rollout again, or one wrong guess would come back every morning.

const TEST_RELEASE_AUTO_KEY = 'test_release_auto';
const TEST_RELEASE_DISMISSED_KEY = 'test_release_dismissed';

/** The sweep set the marker, not a person. */
export function readTestReleaseAuto(metadata: ReleaseMetadata): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[TEST_RELEASE_AUTO_KEY] === true;
}

/** Somebody said this rollout is real: the sweep must leave it alone. */
export function readTestReleaseDismissed(metadata: ReleaseMetadata): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[TEST_RELEASE_DISMISSED_KEY] === true;
}

/**
 * A person marking a rollout as a test, or saying it is real. Saying it is
 * real also records the answer, so the daily sweep never tags it again.
 * Marking it a test clears that answer and any automatic mark: a person said
 * so, which outranks the sweep's guess.
 */
export function writeTestReleaseByPerson(
  metadata: ReleaseMetadata,
  isTest: boolean
): Record<string, unknown> {
  const base = writeTestRelease(metadata, isTest);
  delete base[TEST_RELEASE_AUTO_KEY];
  if (isTest) {
    delete base[TEST_RELEASE_DISMISSED_KEY];
  } else {
    base[TEST_RELEASE_DISMISSED_KEY] = true;
  }
  return base;
}

/** The sweep lifting its own tag once the rollout reads as real. Leaves no
 *  "said it is real" answer behind: nobody said anything, the work did. */
export function clearTestReleaseBySweep(metadata: ReleaseMetadata): Record<string, unknown> {
  const base = writeTestRelease(metadata, false);
  delete base[TEST_RELEASE_AUTO_KEY];
  return base;
}

/** The daily sweep's tag: the marker plus a note that nobody chose it. */
export function writeTestReleaseBySweep(metadata: ReleaseMetadata): Record<string, unknown> {
  const base = writeTestRelease(metadata, true);
  base[TEST_RELEASE_AUTO_KEY] = true;
  return base;
}

/** The canned title. Plain on purpose: the card tag, the banner and the
 * delete dialog all lean on the release SAYING it is a test. */
export const TEST_RELEASE_TITLE = 'Test rollout';

/** One line shown wherever the release description surfaces (press kit,
 * status updates). Copy rules: short words, "you", no em dash. */
export const TEST_RELEASE_DESCRIPTION =
  'A practice rollout you can explore and delete when you are done.';

/** 9 weeks. The single playbook spans day -56 to day +21, so a release dated
 * +63 days puts every one of its 64 activities in the future (+7..+84) and
 * the buckets read naturally instead of opening on a wall of catch-up work. */
const TEST_RELEASE_LEAD_DAYS = 63;

export type TestReleaseDraft = {
  title: string;
  releaseDate: string;
  releaseType: 'single';
  description: string;
};

/**
 * The canned create-release payload the one-tap path sends. The date is
 * always present — the route refuses a dateless test release (see the
 * invariant in the header) — and always `single`, the one design-partner
 * reviewed playbook.
 *
 * Epoch + UTC formatting on purpose: `toISOString` never crosses a DST
 * boundary, so "+63 days" is exact on every clock.
 */
export function buildTestReleaseDraft(now: Date = new Date()): TestReleaseDraft {
  const releaseDate = new Date(now.getTime() + TEST_RELEASE_LEAD_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return {
    title: TEST_RELEASE_TITLE,
    releaseDate,
    releaseType: 'single',
    description: TEST_RELEASE_DESCRIPTION,
  };
}
