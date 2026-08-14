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
// instantiateTemplate with the playbook for the chosen release_type, so the
// stage->task mapping is PER TYPE: STAGE_TO_TASK_ID has one entry per playbook,
// and every id in it is looked up in that same playbook. A template edit that
// drops one of these ids makes `findTask` throw, which the unit tests catch.
//
// Which playbook a type resolves to is the loader's call, and it is flag-aware:
// with NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES off, an EP release instantiates
// nothing, so the AI Moment falls back to the single playbook AND keeps the
// caveat in `releaseTypeNote` explaining the task list will start empty. With
// the flag on, an EP release really does get the EP playbook, the suggested
// task really is in it, and the caveat is dropped. music_video has no playbook
// at all (and no DB enum value), so it always takes the fallback path.

import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import { getTemplate } from './release-templates/loader';
import type { Template, TemplateTask } from './release-templates/types';
import type { OnboardingDraft, OnboardingStage } from './onboarding-draft';

/** Release types with their own stage mapping. Others fall back to single. */
type MappedReleaseType = 'single' | 'ep' | 'album';

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

// The mapping, one entry per playbook. Each stage points at one task ID from
// THAT playbook. If you edit a template and drop one of these IDs,
// getOnboardingAiMoment throws — that's intentional: the AI Moment must
// reference a real task.
//
// The six stages mean the same thing in every playbook (lock the music, get the
// metadata right, start the artwork, deliver to the distributor, run the teaser
// cadence, read the first-week numbers), so each column is the same six
// semantic gates expressed in that playbook's own ids and week numbering.
const STAGE_TO_TASK_ID: Record<MappedReleaseType, Record<OnboardingStage, string>> = {
  single: {
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
  },
  ep: {
    // On a multi-track project the gate is every master, not one.
    just_starting: 'w13_lock_all_masters',
    // Metadata covers the whole tracklist here, which is why it is the
    // bottleneck it is.
    recorded: 'w12_write_ep_metadata',
    // The EP cover, not the lead single's — it is the asset every channel
    // pulls from for the release itself.
    preparing: 'w11_brief_designer_ep_art',
    date_set: 'w5_upload_ep_to_distributor',
    promoting: 'w3_ep_teaser_rollout',
    post_release: 'w0_compile_first_week_stats',
  },
  album: {
    just_starting: 'w17_lock_all_masters',
    recorded: 'w16_write_album_metadata',
    preparing: 'w16_brief_designer_album_art',
    date_set: 'w7_upload_album_to_distributor',
    promoting: 'w3_album_teaser_rollout',
    post_release: 'w0_compile_first_week_stats',
  },
};

const TEMPLATE_BY_MAPPED_TYPE: Record<MappedReleaseType, Template> = {
  single: SINGLE_RELEASE_TEMPLATE,
  ep: EP_RELEASE_TEMPLATE,
  album: ALBUM_RELEASE_TEMPLATE,
};

/**
 * Which playbook the AI Moment should quote, and whether that is the one the
 * user's release will actually be built from.
 *
 * `usedFallback` is what drives the caveat: it is true when the chosen type has
 * no live playbook, in which case the release really will start empty and we say
 * so rather than promising a task the dashboard will not show.
 */
function resolveMomentTemplate(draft: OnboardingDraft): {
  template: Template;
  mappedType: MappedReleaseType;
  usedFallback: boolean;
} {
  const releaseType = draft.releaseType;
  if (releaseType === 'ep' || releaseType === 'album') {
    try {
      // Flag-aware on purpose: this has to agree with what release creation
      // will actually instantiate.
      getTemplate(releaseType);
      return {
        template: TEMPLATE_BY_MAPPED_TYPE[releaseType],
        mappedType: releaseType,
        usedFallback: false,
      };
    } catch {
      // TemplateNotAvailableError — the playbook is switched off.
    }
  }
  return {
    template: SINGLE_RELEASE_TEMPLATE,
    mappedType: 'single',
    usedFallback: releaseType !== 'single' && releaseType !== null,
  };
}

// Sentence stub that follows "Because '<title>' releases on <date>, " — or,
// if either field is missing, the standalone version of the same idea.
// Written in the manager's voice. One sentence each.
const WHY_BY_STAGE: Record<OnboardingStage, { withSpecifics: string; generic: string }> = {
  just_starting: {
    withSpecifics:
      "everything downstream (artwork, distribution, promo) is gated on the master file being final. Get this signed off and the rest of the rollout has something to anchor to.",
    generic:
      'The master file is the single source of truth for every downstream step. Locking it first stops the rollout from churning on a moving target.',
  },
  recorded: {
    withSpecifics:
      "getting your metadata right now (ISRC, songwriter splits, producer credits, language) clears the way for a clean distributor upload. Splits are the field that bites later when they're not locked early.",
    generic:
      'Getting song metadata right early (ISRC, songwriter splits, producer credits, language) clears the way for a clean distributor upload. Splits are the field that bites later when they\'re not locked early.',
  },
  preparing: {
    withSpecifics:
      "briefing your designer now kicks off the cover-art pipeline that every later channel (distributor, socials, press) pulls from. Starting early buys time for the revisions that always happen.",
    generic:
      'Cover art is the asset every later channel (distributor, socials, press) pulls from. Briefing the designer first kicks off the pipeline and buys time for the revisions that always happen.',
  },
  date_set: {
    withSpecifics:
      "getting your track and metadata to your distributor now locks in your DSP delivery. Everything downstream (editorial pitching, pre-save links, release-day go-live) depends on it.",
    generic:
      'The distributor upload is the central pre-release gate. Every DSP delivery downstream depends on it, and metadata errors only surface after submission. Start it sooner than feels necessary.',
  },
  promoting: {
    withSpecifics:
      "the teaser cadence is what carries the audience from announcement to release day. One piece every 2–3 days, starting today, builds the on-ramp.",
    generic:
      'The teaser cadence is what carries the audience from announcement to release day. One piece every 2–3 days, starting today, builds the on-ramp.',
  },
  post_release: {
    withSpecifics:
      "the first-week numbers are the baseline every later decision compares against: playlist pitches, ad spend, the next single. Pull them while they’re fresh.",
    generic:
      "The first-week numbers are the baseline every later decision compares against: playlist pitches, ad spend, the next single. Pull them while they’re fresh.",
  },
};

const findTask = (taskId: string, template: Template): TemplateTask => {
  const task = template.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    // Build-time signal: the mapping references an ID the template no longer
    // has. Throwing here keeps the AI Moment honest — better to fail loudly
    // than show a placeholder.
    throw new Error(
      `Onboarding AI Moment: template task '${taskId}' is missing from the ` +
        `${template.release_type} template (${template.id}). Either restore the task in ` +
        `apps/web/lib/release-templates/${template.release_type}.ts or update the ` +
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

const buildReleaseTypeNote = (
  draft: OnboardingDraft,
  usedFallback: boolean
): string | null => {
  // Only caveat when the chosen type has no live playbook — then the release
  // really will start empty and the user should not be promised tasks the
  // dashboard won't show. When the EP or album playbook IS live, the suggested
  // task is genuinely in their release and there is nothing to apologize for.
  if (!usedFallback) return null;
  const label = draft.releaseType === 'music_video' ? 'music-video' : draft.releaseType;
  return `This entry task comes from our single-release playbook — the ${label} playbook is coming. Your release will be created, and you can build the task list manually until the matching template lands.`;
};

export function getOnboardingAiMoment(draft: OnboardingDraft): OnboardingAiMoment | null {
  // Without a stage we have no entry point to recommend — the AI Moment is
  // suppressed and the page should keep the user on the stage step.
  if (!draft.stage) return null;

  const { template, mappedType, usedFallback } = resolveMomentTemplate(draft);
  const taskId = STAGE_TO_TASK_ID[mappedType][draft.stage];
  const task = findTask(taskId, template);

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
    releaseTypeNote: buildReleaseTypeNote(draft, usedFallback),
  };
}
