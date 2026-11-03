import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';
import { PERSON_BIO_MAX_CHARS } from './person-profile';
import { bannedCopyInstruction } from './press-kits';
import type { KitFacts } from './profile-kit';

/**
 * What UrgAns may write on a directory profile, and how its answer is checked.
 *
 * The directory twin of lib/press-kit-draft.ts and held to the same rule:
 * URGANS DRAFTS PROSE, NEVER FACTS. It writes one bio. It does not touch the
 * roles, the counts, the city, the links or the availability, because each of
 * those is either a record of what happened (the counts come from delivery
 * records and nothing here can move them) or a thing only the person can say.
 *
 * Pure: no IO, no env, no model call. The action wrapper
 * (lib/urgans-actions/actions/directory-draft-bio.ts) does the calling.
 */

export const DIRECTORY_BIO_MAX_CHARS = PERSON_BIO_MAX_CHARS;

/** The only fields a draft may come back with. An allowlist, as the press kit
 *  draft has: a model asked for a bio will offer a home city or a genre beside
 *  it, and both of those are facts that came from somewhere real. */
export const DIRECTORY_BIO_ALLOWED_FIELDS: readonly string[] = ['bio'];

export type DirectoryBioDraft = { bio: string };

/** Cut at a word boundary, never mid word. A single word longer than the limit
 *  is hard cut, because returning it whole would break the limit. */
export function clampAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  // Only trust a boundary if the character just past the cut starts a new word.
  const atBoundary = /\s/.test(text.charAt(max));
  const lastSpace = slice.lastIndexOf(' ');
  if (atBoundary) return slice.trimEnd();
  if (lastSpace > 0) return slice.slice(0, lastSpace).trimEnd();
  return slice;
}

/**
 * Take a model's answer and keep only what was asked for. Throws rather than
 * returning an empty draft, so the run is recorded as a failure and the person
 * is told plainly instead of being shown nothing to accept.
 */
export function parseDirectoryBioOutput(raw: unknown): DirectoryBioDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Model returned invalid JSON format');
  }
  const value = (raw as Record<string, unknown>).bio;
  if (typeof value !== 'string') throw new Error('Model returned nothing usable');
  const bio = clampAtWord(value.trim(), DIRECTORY_BIO_MAX_CHARS);
  if (!bio) throw new Error('Model returned nothing usable');
  return { bio };
}

/** The `parse` callback generateStructuredAiOutput calls: it hands back the raw
 *  string, and returns null (never throws) when that is not JSON at all. See
 *  parseDraftAiResponse in press-kit-draft.ts for why this split exists. */
export function parseDirectoryBioAiResponse(raw: string): DirectoryBioDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseDirectoryBioOutput(parsed);
}

/**
 * Whether an accepted draft may still be written.
 *
 * A draft is proposed against the bio as it was. If the person edited their bio
 * in between, accepting would silently destroy that edit, so this refuses and
 * sends them back to look. Compared on the bio itself rather than on
 * updated_at: the profile editor autosaves other fields (city, availability)
 * and those must not make a perfectly good draft refuse to land.
 */
export function decideBioApply(input: {
  bioWhenDrafted: string;
  currentBio: string;
}): { ok: true } | { ok: false; error: string } {
  if ((input.bioWhenDrafted ?? '').trim() === (input.currentBio ?? '').trim()) return { ok: true };
  return {
    ok: false,
    error: 'Your bio changed while AI was drafting. Look again before you accept.',
  };
}

export type DirectoryBioInput = {
  displayName: string;
  claimedRoles: readonly DirectoryRole[];
  /** Counts from delivery records: what the product itself vouches for. */
  delivered: readonly { role: DirectoryRole; delivered: number }[];
  city: string | null;
  country: string | null;
  existingBio: string;
  kit: KitFacts | null;
};

export type DirectoryBioContext = {
  displayName: string;
  /** "mix engineer: 4 rollouts delivered", only for roles with a record. */
  verified: string[];
  /** Roles the person says they work as with nothing delivered yet. */
  claimedOnly: string[];
  place: string;
  existingBio: string;
  kit: { artistName: string; descriptor: string; genre: string; homeCity: string; bio: string } | null;
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const roleLabel = (role: DirectoryRole): string => (DIRECTORY_ROLE_LABELS[role] || role).toLowerCase();

/**
 * The facts a draft is written from.
 *
 * DELIBERATELY NARROW, like buildDraftContext. No email, no phone, no link and
 * no photo, because none of it helps write a bio and all of it would leave the
 * product for a third party's model. A test asserts the serialised context
 * contains no '@' and no URL.
 */
export function buildDirectoryBioContext(input: DirectoryBioInput): DirectoryBioContext {
  const counts = new Map<DirectoryRole, number>();
  for (const entry of input.delivered) {
    counts.set(entry.role, (counts.get(entry.role) ?? 0) + entry.delivered);
  }

  const verified = [...counts.entries()]
    .filter(([, delivered]) => delivered > 0)
    .map(([role, delivered]) => `${roleLabel(role)}: ${delivered} ${delivered === 1 ? 'rollout' : 'rollouts'} delivered`);

  const claimedOnly = input.claimedRoles.filter((role) => !((counts.get(role) ?? 0) > 0)).map(roleLabel);

  const kitBio = input.kit ? input.kit.bios.medium || input.kit.bios.short || input.kit.bios.long : '';

  return {
    displayName: str(input.displayName),
    verified,
    claimedOnly,
    place: [str(input.city), str(input.country)].filter(Boolean).join(', '),
    existingBio: str(input.existingBio),
    kit: input.kit
      ? {
          artistName: input.kit.artistName,
          descriptor: input.kit.descriptor,
          genre: input.kit.genre,
          homeCity: input.kit.homeCity,
          bio: kitBio,
        }
      : null,
  };
}

export type DirectoryBioMessage = { role: 'system' | 'user'; content: string };

export function buildDirectoryBioMessages(context: DirectoryBioContext, notes: string): DirectoryBioMessage[] {
  const facts: string[] = [`Name: ${context.displayName || 'unknown'}`];
  if (context.place) facts.push(`Based in: ${context.place}`);
  if (context.verified.length > 0) {
    facts.push(`Work Urganize has recorded for them:\n${context.verified.map((line) => `- ${line}`).join('\n')}`);
  }
  if (context.claimedOnly.length > 0) {
    facts.push(`Says they also work as: ${context.claimedOnly.join(', ')}`);
  }
  if (context.kit) {
    facts.push(`Their artist page is for: ${context.kit.artistName}`);
    if (context.kit.descriptor) facts.push(`Described as: ${context.kit.descriptor}`);
    if (context.kit.genre) facts.push(`Genres: ${context.kit.genre}`);
    if (context.kit.homeCity) facts.push(`Home: ${context.kit.homeCity}`);
    if (context.kit.bio) facts.push(`Their press kit says: ${context.kit.bio}`);
  }

  return [
    {
      role: 'system',
      content: [
        'You write short professional bios for people who work in music.',
        'Use ONLY the facts you are given. Do not invent a fact, a number, a credit, a quote, an award or a place.',
        'Only say someone delivered work if the facts say Urganize recorded it. A role someone only says they have is not work delivered.',
        'If you do not know something, write around it rather than guessing.',
        'Write in the third person, plainly, the way a colleague would describe them. No hype, no slogans, no closing motivational line.',
        bannedCopyInstruction(),
        'Reply with JSON only, no other text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Write one bio of at most ${DIRECTORY_BIO_MAX_CHARS} characters. Return JSON: {"bio": string}.`,
        '',
        'Facts:',
        facts.join('\n'),
        context.existingBio ? `\nAlready written, match this voice:\n${context.existingBio}` : '',
        notes.trim() ? `\nWhat they want said:\n${notes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}
