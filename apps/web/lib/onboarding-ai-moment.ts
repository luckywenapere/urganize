// Onboarding AI Moment — DETERMINISTIC, no model call.
//
// Takes the user's onboarding draft and returns one task (with a "why" line)
// that's the right entry point for their stated stage. Template-driven so it
// feels personalized without needing a live AI call.
//
// CRITICAL CONSISTENCY GUARANTEE
// ------------------------------
// The task returned here must exist in the user's post-signup release. The
// release-creation path (apps/web/app/api/releases/route.ts POST) calls
// instantiateTemplate with the single template (apps/web/lib/release-templates/single.ts)
// when release_type === 'single'. Every task ID returned below is pulled from
// that template by ID — so a future template edit that drops one of these
// IDs becomes a TypeScript-friendly bug we'd catch in the unit-test/build
// pass via `findTask` returning undefined.
//
// For release_type other than 'single' the EP/album/music_video templates
// don't exist yet (loader.ts has those slots set to null), so the resulting
// release will have zero template tasks. The AI Moment still shows a
// single-template task in that case — it's the only playbook we have. The
// user's post-signup release will therefore start empty, and the AI Moment's
// promise won't be honored end-to-end. This matches the existing v1
// behavior (CLAUDE.md "Templates needed for v1: 1. Single — done; EP/album/MV
// — pending"); Phase 2 surfaces it explicitly via the note in `releaseTypeNote`
// below rather than hiding the limitation.

import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import type { TemplateTask } from './release-templates/types';
import type { OnboardingDraft, OnboardingStage } from './onboarding-draft';

export interface OnboardingAiMoment {
  // Identity of the template task being suggested. The title here is the
  // exact title the user will see post-signup on /dashboard for this release.
  task: {
    id: string;
    title: string;
  };
  // One sentence explaining why this task is the right starting point.
  // References the user's title and date when available.
  why: string;
  // 0–100. Always 0 at this point — the AI Moment is the *start*, not a
  // resumption. Surfaced so the screen can show a 0% bar without inventing
  // its own constant.
  progressPercent: number;
  // Optional caveat shown beneath the task when the chosen release type has
  // no template yet (EP / album / music_video). Null for single.
  releaseTypeNote: string | null;
}

// The mapping. Each stage points at one task ID from SINGLE_RELEASE_TEMPLATE.
// If you edit single.ts and drop one of these IDs, getOnboardingAiMoment
// throws — that's intentional: the AI Moment must reference a real task.
const STAGE_TO_TASK_ID: Record<OnboardingStage, string> = {
  // Earliest concrete gate. They're still composing — finishing the master
  // is what unblocks every downstream task. Not a date task (so the user
  // isn't told to "finalize the release date" they already entered).
  just_starting: 'w8_lock_master',
  // Tracks recorded. The next bottleneck is getting the metadata right —
  // ISRC, splits, credits — because every later step (distributor upload,
  // editorial pitching) needs it locked. Distinct from the cover-art branch
  // that `preparing` takes.
  recorded: 'w7_write_song_metadata',
  // Pre-release prep mode. Briefing the designer kicks off the cover-art
  // pipeline — the asset every other channel (distributor, socials, press)
  // pulls from later. Earlier than distribution, so the two prep stages
  // (preparing / date_set) don't collide on the same entry task.
  preparing: 'w7_brief_designer',
  // Date is locked. The distributor upload is the central pre-release gate —
  // every DSP delivery downstream waits on it, and metadata errors only
  // surface after submission. Explicitly NOT "finalize release date".
  date_set: 'w6_upload_to_distributor',
  // Actively promoting. The teaser cadence is the marketing-ramp entry —
  // concrete, recurring, can start today.
  promoting: 'w4_teaser_rollout',
  // Track is out. First action that creates value is establishing the
  // baseline numbers.
  post_release: 'w0_compile_first_week_stats',
};

// Sentence stub that follows "Because '<title>' releases on <date>, " — or,
// if either field is missing, the standalone version of the same idea.
// Written in the manager's voice. One sentence each.
const WHY_BY_STAGE: Record<OnboardingStage, { withSpecifics: string; generic: string }> = {
  just_starting: {
    withSpecifics:
      "everything downstream — artwork, distribution, promo — is gated on the master file being final. Get this signed off and the rest of the rollout has something to anchor to.",
    generic:
      'The master file is the single source of truth for every downstream step. Locking it first stops the rollout from churning on a moving target.',
  },
  recorded: {
    withSpecifics:
      "getting your metadata right now — ISRC, songwriter splits, producer credits, language — clears the way for a clean distributor upload. Splits are the field that bites later when they're not locked early.",
    generic:
      'Getting song metadata right early — ISRC, songwriter splits, producer credits, language — clears the way for a clean distributor upload. Splits are the field that bites later when they\'re not locked early.',
  },
  preparing: {
    withSpecifics:
      "briefing your designer now kicks off the cover-art pipeline that every later channel — distributor, socials, press — pulls from. Starting early buys time for the revisions that always happen.",
    generic:
      'Cover art is the asset every later channel — distributor, socials, press — pulls from. Briefing the designer first kicks off the pipeline and buys time for the revisions that always happen.',
  },
  date_set: {
    withSpecifics:
      "getting your track and metadata to your distributor now locks in your DSP delivery — everything downstream (editorial pitching, pre-save links, release-day go-live) depends on it.",
    generic:
      'The distributor upload is the central pre-release gate. Every DSP delivery downstream depends on it, and metadata errors only surface after submission — start it sooner than feels necessary.',
  },
  promoting: {
    withSpecifics:
      "the teaser cadence is what carries the audience from announcement to release day. One piece every 2–3 days, starting today, builds the on-ramp.",
    generic:
      'The teaser cadence is what carries the audience from announcement to release day. One piece every 2–3 days, starting today, builds the on-ramp.',
  },
  post_release: {
    withSpecifics:
      "the first-week numbers are the baseline every later decision compares against — playlist pitches, ad spend, the next single. Pull them while they’re fresh.",
    generic:
      "The first-week numbers are the baseline every later decision compares against — playlist pitches, ad spend, the next single. Pull them while they’re fresh.",
  },
};

const findTask = (taskId: string): TemplateTask => {
  const task = SINGLE_RELEASE_TEMPLATE.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    // Build-time signal: the mapping references an ID single.ts no longer has.
    // Throwing here keeps the AI Moment honest — better to fail loudly than
    // show a placeholder.
    throw new Error(
      `Onboarding AI Moment: template task '${taskId}' is missing from the single template. ` +
        `Either restore the task in apps/web/lib/release-templates/single.ts or update the ` +
        `mapping in apps/web/lib/onboarding-ai-moment.ts.`
    );
  }
  return task;
};

// Format an ISO date (YYYY-MM-DD) into "Aug 15, 2026". Returns '' when the
// input is empty or unparseable, so the caller can fall back to the generic
// version of the "why" string.
const formatReleaseDate = (isoDate: string): string => {
  if (!isoDate) return '';
  // Anchor to midday UTC to avoid the timezone-rollover artifact where
  // "2026-08-15" becomes "Aug 14, 2026" for users in negative UTC offsets.
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(parsed);
  } catch {
    return '';
  }
};

const buildReleaseTypeNote = (draft: OnboardingDraft): string | null => {
  // Templates only exist for 'single' at v1. Acknowledge the gap so the user
  // is not promised tasks the dashboard won't actually show.
  if (draft.releaseType === 'single') return null;
  if (draft.releaseType === null) return null;
  return 'This entry task comes from our single-release playbook — the EP, album, and music-video playbooks are next. Your release will be created, and you can build the task list manually until the matching template lands.';
};

export function getOnboardingAiMoment(draft: OnboardingDraft): OnboardingAiMoment | null {
  // Without a stage we have no entry point to recommend — the AI Moment is
  // suppressed and the page should keep the user on the stage step.
  if (!draft.stage) return null;

  const taskId = STAGE_TO_TASK_ID[draft.stage];
  const task = findTask(taskId);

  const trimmedTitle = draft.title.trim();
  const formattedDate = formatReleaseDate(draft.releaseDate);

  const reasons = WHY_BY_STAGE[draft.stage];
  const why =
    trimmedTitle && formattedDate
      ? `Because "${trimmedTitle}" releases on ${formattedDate}, ${reasons.withSpecifics}`
      : reasons.generic;

  return {
    task: {
      id: task.id,
      title: task.title,
    },
    why,
    progressPercent: 0,
    releaseTypeNote: buildReleaseTypeNote(draft),
  };
}
