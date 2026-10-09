// What UrgAns is asked when it drafts the Spotify editorial pitch, and how its
// answer is read back. Pure: no IO, no env, no model call. The action wrapper
// (lib/urgans-actions/actions/release-draft-spotify-pitch.ts) does the calling.
//
// THE RULES, restated because they are the whole safety story:
//   - Only the facts the rollout already holds. The pitch goes to Spotify under
//     the artist's name, so an invented instrument or an invented backstory is
//     worse than an empty field.
//   - It FILLS GAPS. Only fields that are empty are asked for, and the write
//     re-reads and skips anything filled in the meantime, so a draft can never
//     overwrite somebody's own words.
//   - The song description is held to Spotify's 500 characters here AND when
//     the answer is read back, whatever the model says it wrote.

import type { AiMessage } from './ai/provider';
import {
  PITCH_DESCRIPTION_MAX,
  PITCH_FIELD_KEYS,
  PITCH_FIELD_LABELS,
  parsePitchFields,
  type PitchFieldKey,
  type PitchFields,
} from './editorial-pitch';
import { bannedCopyInstruction } from './press-kits';

/** What the rollout already says about the song. Every field may be empty. */
export type PitchContext = {
  title: string;
  artistName: string;
  /** "single", "EP" or "album", or empty. */
  format: string;
  genre: string;
  subgenre: string;
  language: string;
  /** The rollout's own description. */
  description: string;
  /** The rollout's story from the pitch kit. */
  story: string;
  /** The artist's one-line descriptor and short bio from the press kit. */
  descriptor: string;
  shortBio: string;
  /** Roles collaborators credited themselves with, no names ("producer"). */
  creditRoles: string[];
};

export const EMPTY_PITCH_CONTEXT: PitchContext = {
  title: '',
  artistName: '',
  format: '',
  genre: '',
  subgenre: '',
  language: '',
  description: '',
  story: '',
  descriptor: '',
  shortBio: '',
  creditRoles: [],
};

/** Which of the four fields still need writing. */
export function emptyPitchFieldKeys(fields: PitchFields): PitchFieldKey[] {
  return PITCH_FIELD_KEYS.filter((key) => !fields[key].trim());
}

const ASK: Record<PitchFieldKey, string> = {
  genre:
    'genre: the genre, only if the facts name it or make it plain. Up to three, comma separated. Empty string if unsure.',
  moods:
    'moods: up to three moods a listener would feel, comma separated, drawn from the genre and what is said about the song.',
  instruments:
    'instruments: only instruments the facts mention or the genre makes near certain. Up to four, comma separated. Empty string if nothing says.',
  description: `description: what the song is about and how it sounds, in plain sentences, at most ${PITCH_DESCRIPTION_MAX} characters. No hype and no closing slogan.`,
};

export function buildPitchMessages(context: PitchContext, wanted: readonly PitchFieldKey[]): AiMessage[] {
  if (wanted.length === 0) throw new Error('Nothing to draft.');

  const facts: string[] = [`Artist: ${context.artistName || 'unknown'}`];
  facts.push(
    `Song: ${context.title || 'untitled'}${context.format ? ` (${context.format})` : ''}`
  );
  if (context.genre) {
    facts.push(`Genre: ${context.genre}${context.subgenre ? `, ${context.subgenre}` : ''}`);
  } else if (context.subgenre) {
    facts.push(`Subgenre: ${context.subgenre}`);
  }
  if (context.language) facts.push(`Language: ${context.language}`);
  if (context.description) facts.push(`About it: ${context.description}`);
  if (context.story) facts.push(`The story: ${context.story}`);
  if (context.descriptor) facts.push(`The artist is described as: ${context.descriptor}`);
  if (context.shortBio) facts.push(`Artist bio: ${context.shortBio}`);
  if (context.creditRoles.length > 0) {
    facts.push(`Collaborators on it: ${[...new Set(context.creditRoles)].slice(0, 12).join(', ')}`);
  }

  return [
    {
      role: 'system',
      content: [
        "You fill in a Spotify for Artists editorial pitch form for a song.",
        'Use ONLY the facts you are given. Do not invent a fact, an instrument, a place, a person, a number or a quote.',
        'If a fact is missing, leave that field as an empty string rather than guessing.',
        'Write plainly, the way a manager would. No hype, no slogans.',
        bannedCopyInstruction(),
        'Reply with JSON only, no other text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Return JSON with exactly these keys: {${wanted.map((key) => `"${key}"`).join(', ')}}.`,
        ...wanted.map((key) => `- ${ASK[key]}`),
        '',
        'Facts:',
        facts.join('\n'),
      ].join('\n'),
    },
  ];
}

/**
 * Read the model's answer. Anything unusable is null (the router then treats it
 * as a bad answer and may try again); a usable answer is clamped, with the
 * description cut at a word so it can never be over 500 characters.
 */
export function parsePitchDraftResponse(raw: string): PitchFields | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const fields = parsePitchFields(parsed);
  // An answer with nothing in it is a failed draft, not a successful empty one.
  if (!PITCH_FIELD_KEYS.some((key) => fields[key].trim())) return null;
  return fields;
}

export { PITCH_FIELD_LABELS };
