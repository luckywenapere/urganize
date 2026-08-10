import { parseReleaseDate, sanitizeRecapText } from './recap-copy';

// When a release earns a recap, and what the two optional form fields accept.
// Pure logic, kept in lib/ so it is unit tested and so the client predicate and
// the API gate can import the SAME rule rather than two copies that drift.

export const RECAP_HIGHLIGHT_MAX_CHARS = 140;

// Big enough for any real streaming figure, small enough to stay well inside a
// bigint, so a pasted phone number cannot become a stat.
export const RECAP_MAX_STREAMS = 1_000_000_000_000;

export type RecapEligibilityRelease = {
  releaseDate: string | null;
  status: string;
};

export type RecapTaskTotals = {
  totalTasks: number;
  allTasksDone: boolean;
};

/**
 * A recap is only worth making once the release has actually happened.
 *
 * Release day itself counts: the share moment is the launch, not the day after.
 * The all-tasks-done clause is what makes "the release is complete" real today,
 * since nothing in the product writes the released status, and it is the only
 * route to a recap for a release whose date was never set.
 */
export function isRecapEligible(
  release: RecapEligibilityRelease,
  tasks: RecapTaskTotals,
  now: Date = new Date()
): boolean {
  if (release.status === 'released' || release.status === 'archived') return true;

  const releaseDate = parseReleaseDate(release.releaseDate);
  if (releaseDate) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (releaseDate.getTime() <= today.getTime()) return true;
  }

  return tasks.totalTasks > 0 && tasks.allTasksDone;
}

export type ParsedRecapInputs = {
  firstWeekStreams: number | null;
  highlight: string | null;
};

/**
 * Validate the two optional form fields. Both may be omitted entirely; an empty
 * string counts as "not provided" rather than an error, because the form is
 * explicitly skippable.
 */
export function parseRecapInputs(
  body: unknown
): { error: string } | { inputs: ParsedRecapInputs } {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  let firstWeekStreams: number | null = null;
  const rawStreams = payload.firstWeekStreams;
  if (rawStreams !== undefined && rawStreams !== null && rawStreams !== '') {
    const parsed = typeof rawStreams === 'string' ? Number(rawStreams.trim()) : Number(rawStreams);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return { error: 'First week streams must be a whole number that is zero or more.' };
    }
    if (parsed > RECAP_MAX_STREAMS) {
      return { error: 'That streaming number looks too large. Check it and try again.' };
    }
    firstWeekStreams = parsed;
  }

  let highlight: string | null = null;
  const rawHighlight = payload.highlight;
  if (rawHighlight !== undefined && rawHighlight !== null) {
    if (typeof rawHighlight !== 'string') {
      return { error: 'The highlight must be text.' };
    }
    const cleaned = sanitizeRecapText(rawHighlight);
    if (cleaned.length > RECAP_HIGHLIGHT_MAX_CHARS) {
      return { error: `Keep the highlight to ${RECAP_HIGHLIGHT_MAX_CHARS} characters or fewer.` };
    }
    highlight = cleaned || null;
  }

  return { inputs: { firstWeekStreams, highlight } };
}
