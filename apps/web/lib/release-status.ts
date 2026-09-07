/**
 * Prompt construction and output cleanup for the AI status update generator
 * (Phase 6). Plain-text output — the model returns one natural paragraph, not
 * JSON. No node imports, so this is safe to import anywhere, though only the
 * generate-status route uses it today.
 *
 * @see CLAUDE.md "v1 scope" item 6 — AI status update generator.
 */

export type StatusReleaseInfo = {
  title: string;
  artistName: string;
  releaseDate: string | null;
  releaseType: string;
};

export type StatusTaskSummary = {
  doneCount: number;
  inProgressCount: number;
  blockedCount: number;
  inProgressTitles: string[]; // up to 3
  blockedTitles: string[]; // up to 3
  comingUpThisWeek: string[]; // up to 5
  upcomingMilestones: Array<{ title: string; date: string }>; // next 14 days
  attachmentCount: number;
  attachmentCategories: string[]; // distinct
};

/**
 * The counts behind a generated status update, returned beside the paragraph
 * so a reader can see the numbers it was written FROM (stat tiles, 2026-08-13;
 * a line of prose since 2026-09-07 — see `describeStatusFacts`). Derived
 * entirely from rows the route already loaded, so this adds no queries.
 *
 * `dueThisWeekCount` is a true count and deliberately NOT
 * `comingUpThisWeek.length`: that list is capped at five titles because it
 * feeds a prompt, so its length silently under-reports a busy week. Printing
 * "5 due this week" when nine are due would be a wrong number presented as a
 * fact.
 */
export type StatusFacts = {
  totalCount: number;
  doneCount: number;
  inProgressCount: number;
  blockedCount: number;
  dueThisWeekCount: number;
};

/**
 * The figures the paragraph was written from, as one line of prose.
 *
 * The point is verification, not decoration: an AI paragraph asserting "we're
 * over halfway with two blocked" is unfalsifiable on its own, and this app's
 * AI posture is that the model narrates structured data rather than being
 * trusted for it. Printing the numbers beside it makes the narration
 * checkable at a glance, which is what makes it safe to paste to an artist or
 * a label.
 *
 * They used to be a row of tiles (`buildStatusTiles` here, rendered by
 * components/shared/StatTiles.tsx), whose only home was the modal behind the
 * "Status update" pill. That pill was removed on 2026-09-07 — the status
 * update belongs in the UrgAns conversation — so the figures had to travel
 * with the paragraph or the verification would have gone with the button.
 * Both the builder and the tiles component are deleted; a transcript line is
 * the whole surface now, and it also gives the model real numbers to quote
 * rather than inferring them from its own prose.
 *
 * Only "done" is unconditional. The others appear when they carry signal: a
 * zero in progress, a zero due this week or a zero blocked is the absence of
 * news, and a line padded with zeroes buries the figures that matter.
 *
 * Returns '' when there is nothing to verify, and callers append nothing in
 * that case — a release with no activities gets the paragraph alone rather
 * than a paragraph plus "Based on 0 of 0 done."
 */
export function describeStatusFacts(stats: StatusFacts): string {
  if (stats.totalCount <= 0) return '';

  const parts = [`${stats.doneCount} of ${stats.totalCount} done`];
  if (stats.inProgressCount > 0) parts.push(`${stats.inProgressCount} in progress`);
  if (stats.dueThisWeekCount > 0) parts.push(`${stats.dueThisWeekCount} due this week`);
  if (stats.blockedCount > 0) parts.push(`${stats.blockedCount} blocked`);

  return `Based on ${parts.join(', ')}.`;
}

const STATUS_SYSTEM_PROMPT = [
  'You are writing a status update for a music release. The update is from a manager to someone else involved with the release (the artist, the label, a collaborator). It should be conversational and direct, written in "we" voice (as the manager speaking about their team\'s work).',
  '',
  'Rules:',
  '- One paragraph, 3-4 sentences max.',
  '- Speak as the manager. Use "we" when describing the team\'s work.',
  '- Lead with the most important state: what\'s on track, what\'s coming up next, what\'s blocked.',
  '- Be specific. Reference real task names from the data, not generic "marketing tasks."',
  "- Don't list. Write as flowing sentences a human would.",
  '- No salutations. No closing line. No formatting. Plain text.',
  "- Don't add commentary about Urganize or templates. Just the release status.",
].join('\n');

function daysAway(releaseDate: string | null): string {
  if (!releaseDate) return 'date not set';
  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) return 'date not set';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'releasing today';
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} away`;
  const past = Math.abs(diff);
  return `released ${past} day${past === 1 ? '' : 's'} ago`;
}

function bulletOrNone(items: string[]): string {
  return items.length ? items.join('; ') : 'none';
}

export function buildStatusMessages(params: {
  release: StatusReleaseInfo;
  summary: StatusTaskSummary;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { release, summary } = params;

  const milestoneLines = summary.upcomingMilestones.length
    ? summary.upcomingMilestones.map((m) => `${m.title} (${m.date})`).join('; ')
    : 'None';

  const user = [
    `Release: ${release.title} by ${release.artistName || 'the artist'}, releasing ${release.releaseDate || 'TBD'} (${daysAway(release.releaseDate)}).`,
    `Type: ${release.releaseType}`,
    'Task summary:',
    `- Done: ${summary.doneCount} tasks`,
    `- In progress: ${summary.inProgressCount} tasks (titles: ${bulletOrNone(summary.inProgressTitles)})`,
    `- Blocked: ${summary.blockedCount} tasks (titles: ${bulletOrNone(summary.blockedTitles)})`,
    `- Coming up this week: ${bulletOrNone(summary.comingUpThisWeek)}`,
    '',
    'Upcoming milestones (next 14 days):',
    milestoneLines,
    '',
    `Files attached: ${summary.attachmentCount} (categories: ${bulletOrNone(summary.attachmentCategories)})`,
    '',
    'Write a one-paragraph status update for the artist or label.',
  ].join('\n');

  return [
    { role: 'system', content: STATUS_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

/**
 * Strip markdown fences, leading/trailing quote characters, and surrounding
 * whitespace that small models sometimes wrap around free-text output. Returns
 * the cleaned paragraph.
 */
export function stripMarkdownWrappers(text: string): string {
  let out = text.trim();

  // Strip a leading/trailing ``` fence (optionally ```text / ```md).
  out = out.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```$/, '');

  // Strip a single layer of surrounding quotes (straight or curly).
  out = out.trim();
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ];
  for (const [open, close] of quotePairs) {
    if (out.length >= 2 && out.startsWith(open) && out.endsWith(close)) {
      out = out.slice(1, -1).trim();
      break;
    }
  }

  return out.trim();
}
