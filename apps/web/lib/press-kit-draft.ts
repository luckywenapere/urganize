import type { PressKitSection, PressKitSectionContent, PressKitSectionKey } from '@/types/press-kits';

/**
 * What UrgAns may write in a press kit, and how its answer is checked.
 *
 * Pure: no IO, no env, no model call. The action wrapper
 * (lib/urgans-actions/actions/press-kit-draft-section.ts) does the calling;
 * everything that decides what is asked for and what is allowed back lives
 * here, where a test can hold it.
 *
 * THE RULE: URGANS DRAFTS PROSE, NEVER FACTS. It writes the bios, the one line
 * about the artist, and the hook on the latest release. It does not touch the
 * numbers (there is no such data in this product and inventing one is the thing
 * the brief bans outright), the credits, the shows or the music (those are
 * records of what happened), the links (it would invent a URL), or the contact
 * block (those are real people's details, and a wrong email on a public page is
 * worse than none).
 */

export const DRAFTABLE_SECTIONS: readonly PressKitSectionKey[] = [
  'header',
  'bios',
  'latest_release',
];

/**
 * The only fields a draft may come back with, per section.
 *
 * This is an ALLOWLIST rather than a check on what arrived, and that is the
 * point: a model asked for a bio will cheerfully offer a home city or a genre
 * alongside it, and both of those are facts that came from somewhere real.
 * Anything not named here is dropped without comment.
 */
export const DRAFT_ALLOWED_FIELDS: Record<string, readonly string[]> = {
  header: ['descriptor'],
  bios: ['short', 'medium', 'long'],
  latest_release: ['hook'],
};

/** Long enough for a three hundred word bio with room to spare, short enough
 *  that a model that has lost the plot cannot fill a column with it. */
const MAX_FIELD_LENGTH = 4000;

export function isDraftableSection(section: string): boolean {
  return (DRAFTABLE_SECTIONS as readonly string[]).includes(section);
}

/**
 * Take a model's answer and keep only what was asked for.
 *
 * Throws rather than returning an empty object when nothing usable came back,
 * so the run is recorded as a failure and the person is told plainly instead of
 * being shown an empty proposal to accept.
 */
export function parseDraftOutput(
  section: PressKitSectionKey,
  raw: unknown
): PressKitSectionContent {
  const allowed = DRAFT_ALLOWED_FIELDS[section];
  if (!allowed) {
    throw new Error(`UrgAns does not draft the ${section} section.`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Model returned invalid JSON format');
  }

  const record = raw as Record<string, unknown>;
  const content: PressKitSectionContent = {};

  for (const field of allowed) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
    if (trimmed.length === 0) continue;
    content[field] = trimmed;
  }

  if (Object.keys(content).length === 0) {
    throw new Error('Model returned nothing usable');
  }

  return content;
}

export type DraftContext = {
  artistName: string;
  genres: string;
  homeCity: string;
  descriptor: string;
  latestRelease: {
    title: string;
    releaseType: string;
    releaseDate: string;
    description: string;
  } | null;
  /** Names and roles only. */
  credits: string[];
  /** Titles and venues only. */
  shows: string[];
  songCount: number;
  existingBios: { short: string; medium: string; long: string };
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const contentOf = (
  sections: readonly PressKitSection[],
  key: PressKitSectionKey
): PressKitSectionContent => sections.find((entry) => entry.section === key)?.content || {};

/**
 * The facts a draft is written from, gathered from the kit itself.
 *
 * DELIBERATELY NARROW. It carries no email address, no phone number, no split
 * and no IPI, because none of that helps write a bio and all of it would be
 * leaving the product for a third party's model. The contact section is read
 * for nothing at all. A test asserts the serialised context contains no '@'.
 */
export function buildDraftContext(
  artistName: string,
  sections: readonly PressKitSection[]
): DraftContext {
  const header = contentOf(sections, 'header');
  const bios = contentOf(sections, 'bios');
  const release = contentOf(sections, 'latest_release');
  const credits = contentOf(sections, 'credits');
  const live = contentOf(sections, 'live');
  const music = contentOf(sections, 'music');

  return {
    artistName: str(artistName),
    genres: str(header.genreTags),
    homeCity: str(header.homeCity),
    descriptor: str(header.descriptor),
    latestRelease: str(release.title)
      ? {
          title: str(release.title),
          releaseType: str(release.releaseType),
          releaseDate: str(release.releaseDate),
          description: str(release.description),
        }
      : null,
    credits: rows(credits.credits)
      .map((credit) => {
        const name = str(credit.stageName) || str(credit.legalName);
        const roles = Array.isArray(credit.roles) ? (credit.roles as string[]).join(', ') : '';
        return roles ? `${name} (${roles})` : name;
      })
      .filter(Boolean)
      .slice(0, 20),
    shows: rows(live.shows)
      .map((show) => [str(show.title), str(show.venueName)].filter(Boolean).join(', '))
      .filter(Boolean)
      .slice(0, 20),
    songCount: rows(music.tracks).length,
    existingBios: {
      short: str(bios.short),
      medium: str(bios.medium),
      long: str(bios.long),
    },
  };
}

export type DraftMessage = { role: 'system' | 'user'; content: string };

const ASK: Record<string, string> = {
  header:
    'Write ONE line describing this artist, the sentence a journalist would reuse in their intro. ' +
    'Return JSON: {"descriptor": string}.',
  bios:
    'Write three artist bios in the third person: "short" of about 50 words, "medium" of about 150 words, ' +
    'and "long" of about 300 words. Return JSON: {"short": string, "medium": string, "long": string}.',
  latest_release:
    'Write one or two lines on why this release is worth writing about, the thing an editor decides on. ' +
    'Return JSON: {"hook": string}.',
};

/**
 * The prompt.
 *
 * Two rules carried in the system message and both worth keeping: it may only
 * use the facts it was handed, and it writes the way press write rather than
 * the way a brochure does. The house copy rules bind here as much as anywhere
 * else, since this text becomes what a customer publishes.
 */
export function buildDraftMessages(
  section: PressKitSectionKey,
  context: DraftContext,
  notes: string
): DraftMessage[] {
  const ask = ASK[section];
  if (!ask) throw new Error(`UrgAns does not draft the ${section} section.`);

  const facts: string[] = [`Artist: ${context.artistName || 'unknown'}`];
  if (context.genres) facts.push(`Genres: ${context.genres}`);
  if (context.homeCity) facts.push(`Based in: ${context.homeCity}`);
  if (context.descriptor) facts.push(`Described as: ${context.descriptor}`);
  if (context.latestRelease) {
    const release = context.latestRelease;
    facts.push(
      `Latest release: ${release.title}` +
        (release.releaseType ? ` (${release.releaseType})` : '') +
        (release.releaseDate ? `, out ${release.releaseDate}` : '')
    );
    if (release.description) facts.push(`About that release: ${release.description}`);
  }
  if (context.songCount > 0) facts.push(`Songs in the catalogue: ${context.songCount}`);
  if (context.credits.length > 0) facts.push(`Worked with: ${context.credits.join('; ')}`);
  if (context.shows.length > 0) facts.push(`Played: ${context.shows.join('; ')}`);

  const existing = Object.entries(context.existingBios)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);

  return [
    {
      role: 'system',
      content: [
        'You write press material for music artists.',
        'Use ONLY the facts you are given. Do not invent a fact, a number, a chart position, a quote, a review or a place.',
        'If you do not know something, write around it rather than guessing.',
        'Write plainly, the way music press write. No hype, no slogans, no closing motivational line.',
        'Do not use em dashes. Do not use the word "ship".',
        'Reply with JSON only, no other text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        ask,
        '',
        'Facts:',
        facts.join('\n'),
        existing.length > 0
          ? `\nAlready written, match this voice:\n${existing.join('\n')}`
          : '',
        notes.trim() ? `\nWhat the manager wants said:\n${notes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

/**
 * Whether a draft is still safe to apply.
 *
 * A draft is proposed against the section as it was, and accepting it replaces
 * what is there. If somebody edited that section in between, applying would
 * silently destroy their edit, so this refuses and sends the person back to
 * look. Refuses on a missing timestamp too, rather than assuming nothing moved.
 */
export function decideDraftApply(input: {
  draftedUpdatedAt: string;
  currentUpdatedAt: string;
}): { ok: true } | { ok: false; error: string } {
  if (!input.draftedUpdatedAt || !input.currentUpdatedAt) {
    return {
      ok: false,
      error: 'This section changed while UrgAns was drafting. Look again before you accept.',
    };
  }
  if (input.draftedUpdatedAt !== input.currentUpdatedAt) {
    return {
      ok: false,
      error: 'This section changed while UrgAns was drafting. Look again before you accept.',
    };
  }
  return { ok: true };
}
