// The team brief: the standing description of a team that UrgAns reads on
// every request.
//
// Pure and client-safe — the editor and the prompt builder both import from
// here, so the section list, the caps and the labels cannot drift between what
// a manager is allowed to type and what the model is told.

/** Flag-gated, per this repo's "feature flags from day one" principle — the
 *  spec does not mention a flag, and its own working rules say to match
 *  existing patterns over its suggestions. Default off: the route 404s, the
 *  editor does not render, and nothing is injected into any prompt. */
export function isTeamBriefEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_TEAM_BRIEF === 'true';
}

/** The five sections, in the order they are shown AND injected. Order is not
 *  cosmetic: the prompt lists them in this sequence, so it is the priority the
 *  model reads them in. */
export const TEAM_BRIEF_SECTIONS = [
  'roster',
  'how_we_work',
  'positioning',
  'constraints',
  'vocabulary',
] as const;

export type TeamBriefSection = (typeof TEAM_BRIEF_SECTIONS)[number];

/**
 * Per-section character ceiling.
 *
 * A brief that grows without limit degrades every answer in the team, and
 * there is no token budget anywhere in this app to catch it (the audit found
 * ~7,400 tokens of fixed overhead per request and no mechanism measuring any
 * of it). 1,200 characters is roughly 300 tokens; five full sections is about
 * 1,500 — comparable to the role block itself, which is the most a standing
 * document should ever cost.
 */
export const TEAM_BRIEF_SECTION_MAX_CHARS = 1_200;

/** Where the counter turns from neutral to a warning. */
export const TEAM_BRIEF_COUNTER_WARN_RATIO = 0.9;

type SectionMeta = {
  /** Shown as the section heading in the editor. */
  label: string;
  /** Shown to the MODEL as the heading of the injected block. Deliberately
   *  more explicit than the UI label — "How we work" is clear to a manager
   *  looking at their own brief and ambiguous in a system prompt. */
  promptLabel: string;
  /** Input placeholder. A QUESTION, never example content: pre-filled
   *  examples are something the user has to delete, and a user who does not
   *  delete them has taught the model something untrue about their team. */
  placeholder: string;
};

export const TEAM_BRIEF_SECTION_META: Record<TeamBriefSection, SectionMeta> = {
  roster: {
    label: 'Roster',
    promptLabel: 'The artists this team works with, and where each one is right now',
    placeholder: 'Which artists are you working with right now?',
  },
  how_we_work: {
    label: 'How we work',
    promptLabel: 'How this team runs a rollout',
    placeholder: 'How do you usually run a release? What does a rollout look like here?',
  },
  positioning: {
    label: 'Positioning',
    promptLabel: 'How this team talks about its artists and itself',
    placeholder: 'How do you describe your artists to a playlist curator or a journalist?',
  },
  constraints: {
    label: 'Constraints',
    promptLabel: 'What this team does not do, and what it cannot spend',
    placeholder: 'What is off the table? Budget, territories, platforms, anything you avoid.',
  },
  vocabulary: {
    label: 'Vocabulary',
    promptLabel: 'Words this team uses, and what they mean here',
    placeholder: 'Any shorthand your team uses that an outsider would not follow?',
  },
};

export type TeamBriefEntry = {
  section: TeamBriefSection;
  content: string;
  updatedAt: string | null;
  /** Display name of whoever last saved it, resolved server-side. Null when
   *  nobody has written this section, or when that account is gone. */
  updatedByName: string | null;
};

export type TeamBrief = {
  entries: TeamBriefEntry[];
  /** True when only owners and admins may edit. Default false — switching the
   *  feature on must not narrow anybody's permissions. */
  editRestricted: boolean;
  /** Whether the CALLER may edit, resolved server-side from the above plus
   *  their membership role. The editor renders read-only when false; the route
   *  refuses regardless, so this is an affordance, not the gate. */
  canEdit: boolean;
};

export function isTeamBriefSection(value: unknown): value is TeamBriefSection {
  return TEAM_BRIEF_SECTIONS.includes(value as TeamBriefSection);
}

/**
 * Trim and cap a section's content.
 *
 * Applied on BOTH sides — the editor for the counter, the route before the
 * write — so the number a manager watches and the number enforced cannot
 * disagree (the asset-constants precedent).
 */
export function normalizeBriefContent(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, TEAM_BRIEF_SECTION_MAX_CHARS);
}

/** Roles allowed to edit when the restriction is on. */
const PRIVILEGED_ROLES = new Set(['owner', 'admin']);

export function canEditTeamBrief(input: {
  editRestricted: boolean;
  workspaceRole: string | null;
  /** Guests are read-only across the whole product (founder decision,
   *  2026-07-23) — the brief is not an exception. */
}): boolean {
  const role = String(input.workspaceRole || '').trim();
  if (!role || role === 'guest') return false;
  return input.editRestricted ? PRIVILEGED_ROLES.has(role) : true;
}

/**
 * The brief as the model sees it.
 *
 * EMPTY SECTIONS ARE OMITTED ENTIRELY — not printed with a placeholder, not
 * printed as a bare heading. A heading with nothing under it teaches the model
 * to invent something to fill the gap, which is the opposite of what a brief
 * is for. An entirely empty brief returns '' and the caller injects nothing.
 */
export function formatTeamBriefForPrompt(entries: TeamBriefEntry[]): string {
  const bySection = new Map(entries.map((e) => [e.section, e]));
  const blocks: string[] = [];

  for (const section of TEAM_BRIEF_SECTIONS) {
    const content = normalizeBriefContent(bySection.get(section)?.content);
    if (!content) continue;
    blocks.push(`${TEAM_BRIEF_SECTION_META[section].promptLabel}:\n${content}`);
  }

  if (!blocks.length) return '';

  return [
    'About this team, written by the team itself. Treat it as standing background:',
    'it tells you who they are and how they work, but it is NOT more current than',
    'the releases and activities below. Where the two disagree — a date, a status,',
    "who owns something — the live data wins and this does not.",
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
