import {
  PRESS_KIT_SECTIONS,
  type PressKit,
  type PressKitRosterEntry,
  type PressKitSection,
  type PressKitSectionContent,
  type PressKitSectionKey,
  type PressKitSectionStatus,
  type PressKitState,
} from '@/types/press-kits';

/**
 * Pure rules for the standing press kit. No React, no IO, no env.
 *
 * This lives in lib/ rather than beside the components because
 * vitest.config.ts collects lib/**\/*.test.ts and there are no component tests
 * in this repo. Status derivation, the slug rule, the publish gate and the
 * version-coalescing window are all decisions worth pinning, so they belong
 * where a test can reach them.
 */

/** Display order in the rail and on the public page. The team can reorder
 *  their own kit; this is what a new one starts as. */
export const PRESS_KIT_SECTION_ORDER: readonly PressKitSectionKey[] = PRESS_KIT_SECTIONS;

export const PRESS_KIT_SECTION_LABELS: Record<PressKitSectionKey, string> = {
  header: 'About',
  bios: 'Bio',
  latest_release: 'New release',
  music: 'Music',
  assets: 'Photos',
  video: 'Videos',
  credits: 'Credits',
  numbers: 'Big numbers',
  press: 'Press',
  live: 'Shows',
  contact: 'Contact',
  links: 'Links',
};

/**
 * What each section is for, said so a ten year old gets it (founder brief,
 * 2026-10-11: "look at it from the point of a fifth grader, it is too
 * overwhelming"). One short sentence each. Shown under the section heading and
 * reused as the caption on the matching interview question.
 */
export const PRESS_KIT_SECTION_HINTS: Record<PressKitSectionKey, string> = {
  header: 'Who the artist is, in one short line.',
  bios: 'The artist story. Start with the short one.',
  latest_release: 'The song you are pushing right now.',
  music: 'Where people can listen.',
  assets: 'Photos anyone can use, with who took them.',
  video: 'Music videos and live clips.',
  credits: 'Who wrote it, made the beat and sang on it.',
  numbers: 'Big wins you can prove, with the date.',
  press: 'Places that wrote about the artist.',
  live: 'Shows played and shows coming up.',
  contact: 'Who to email. You need this one before you share.',
  links: 'Where to follow the artist.',
};

/**
 * The four sections a kit cannot do without. The editor shows these first,
 * as "Start here", and tucks the rest under "Extras", so a new person sees
 * four things to do rather than twelve.
 */
export const PRESS_KIT_ESSENTIAL_SECTIONS: readonly PressKitSectionKey[] = [
  'header',
  'bios',
  'assets',
  'contact',
];

export const isEssentialSection = (key: PressKitSectionKey): boolean =>
  PRESS_KIT_ESSENTIAL_SECTIONS.includes(key);

type ScalarSpec = { kind: 'fields'; fields: readonly string[] };
type ListSpec = { kind: 'list'; key: string; requiredItemFields?: readonly string[] };
type CountSpec = { kind: 'count' };

/**
 * How each section decides whether it is empty, a draft or ready.
 *
 * Three shapes rather than one, because the sections genuinely differ: some
 * are a handful of fields, some are a list where any entry is worth having,
 * and some are a list where a half-filled entry is worse than none (a contact
 * with no email, a number with no date).
 */
const SECTION_SPEC: Record<PressKitSectionKey, ScalarSpec | ListSpec | CountSpec> = {
  header: { kind: 'fields', fields: ['descriptor', 'homeCity', 'genreTags'] },
  bios: { kind: 'fields', fields: ['short', 'medium', 'long'] },
  latest_release: { kind: 'fields', fields: ['releaseId', 'hook'] },
  music: { kind: 'list', key: 'tracks' },
  assets: { kind: 'count' },
  video: { kind: 'list', key: 'videos' },
  credits: { kind: 'list', key: 'credits' },
  numbers: { kind: 'list', key: 'stats', requiredItemFields: ['label', 'value', 'asOf'] },
  press: { kind: 'list', key: 'coverage' },
  live: { kind: 'list', key: 'shows' },
  contact: { kind: 'list', key: 'contacts', requiredItemFields: ['name', 'role', 'email'] },
  links: { kind: 'list', key: 'links' },
};

const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 60;

/** Mirrors press_kits_slug_shape_check. Kept in step with the migration by
 *  hand, and asserted by the tests either side of it. */
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Turn an artist name into the slug their public kit lives at.
 *
 * Reuses the normalisation every other slug in the product uses, then applies
 * this one's own ceiling. The re-strip after the slice matters: cutting a long
 * name mid-word can land on a hyphen, which the database refuses.
 *
 * Returns '' when there is nothing usable, including a single character, since
 * the database floor is two. The caller decides what to do about that rather
 * than being handed a slug that will be rejected.
 */
export function normalizeKitSlug(value: string): string {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug.length >= MIN_SLUG_LENGTH ? slug : '';
}

export function isValidKitSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) return false;
  return SLUG_SHAPE.test(slug);
}

/** A value counts as filled when a person would say they had answered. An
 *  empty string, whitespace, an empty list and null all count as not answered. */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

function itemIsComplete(item: unknown, required: readonly string[]): boolean {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  return required.every((field) => isFilled(record[field]));
}

export type SectionSignals = {
  /** Assets live in their own table, not in the section's content, so the
   *  count has to be handed in. */
  photoCount?: number;
};

/**
 * empty, draft or ready for one section.
 *
 * This is what the rail's chips report and what deriveKitState reads, so it is
 * the single definition of "how far along is this".
 */
export function deriveSectionStatus(
  section: PressKitSectionKey,
  content: PressKitSectionContent,
  signals: SectionSignals = {}
): PressKitSectionStatus {
  const spec = SECTION_SPEC[section];
  const body = content || {};

  if (spec.kind === 'count') {
    return (signals.photoCount ?? 0) > 0 ? 'ready' : 'empty';
  }

  if (spec.kind === 'fields') {
    const filled = spec.fields.filter((field) => isFilled(body[field])).length;
    if (filled === 0) return 'empty';
    return filled === spec.fields.length ? 'ready' : 'draft';
  }

  const raw = body[spec.key];
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) return 'empty';
  if (!spec.requiredItemFields) return 'ready';
  return items.every((item) => itemIsComplete(item, spec.requiredItemFields as string[]))
    ? 'ready'
    : 'draft';
}

/**
 * The kit's own state.
 *
 * Published outranks everything: once a kit is live it stays live while the
 * team edits it, because the public page is serving the last publish and not
 * the draft. A hidden section is a decision, not a gap, so it does not hold
 * the kit back.
 */
export function deriveKitState(
  sections: readonly PressKitSection[],
  publishedAt: string | null
): PressKitState {
  if (publishedAt) return 'published';
  const visible = sections.filter((section) => !section.hidden);
  if (visible.length === 0) return 'incomplete';
  return visible.every((section) => section.status === 'ready') ? 'ready' : 'incomplete';
}

/**
 * Whether the kit can go live.
 *
 * One rule: a reachable contact block. A press kit whose reader cannot find
 * who to email is a dead end, and it is the one thing the brief makes a
 * precondition rather than a suggestion.
 */
export function canPublishKit(
  sections: readonly PressKitSection[]
): { ok: true } | { ok: false; reason: string } {
  const contact = sections.find((section) => section.section === 'contact' && !section.hidden);
  if (!contact || contact.status !== 'ready') {
    return {
      ok: false,
      reason: 'Add a contact first, so people know who to email.',
    };
  }
  return { ok: true };
}

/** Key-order independent, so re-saving the same values in a different order
 *  does not read as a change. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/**
 * Whether two section bodies say the same thing.
 *
 * Key-order independent, so the editor does not treat a re-serialised object
 * as an edit and autosave the same values back to the server on every mount.
 */
export function sameContent(a: PressKitSectionContent, b: PressKitSectionContent): boolean {
  return stableStringify(a || {}) === stableStringify(b || {});
}

/**
 * Whether a background revalidate may replace the open section's draft.
 *
 * The single-kit screen paints from a memory cache, so the body on screen can
 * be a few minutes old while a fetch behind it brings server truth. The
 * autosave hook's section-change effect early-returns on an unchanged section
 * id — correctly, since a changing `persistedContent` identity must not
 * interrupt typing — so without this rule the stale draft would survive the
 * correction and the next keystroke would save it back over whatever the
 * server had.
 *
 * It fails toward KEEPING the draft on every uncertainty, because the two
 * mistakes are not equal: adopting too eagerly loses words a person typed,
 * declining too often leaves them looking at a body a few minutes old that
 * their next edit will save anyway.
 *
 * `needsResend` is the non-obvious one. The save path sets lastFlushed BEFORE
 * awaiting and the catch deliberately does not rewind it, so after a failed
 * save the two bodies match even though the edit never landed — matching
 * bodies alone would adopt over it.
 */
export function canAdoptServerContent(input: {
  draft: PressKitSectionContent;
  lastFlushed: PressKitSectionContent;
  inFlight: boolean;
  needsResend: boolean;
}): boolean {
  if (input.inFlight) return false;
  if (input.needsResend) return false;
  return sameContent(input.draft, input.lastFlushed);
}

/** What the publish screen lists. A section nobody has touched is not a
 *  change, so an untouched, never-published section is quiet. */
export function hasUnpublishedChanges(section: PressKitSection): boolean {
  if (section.publishedContent === null) {
    return Object.values(section.content || {}).some(isFilled);
  }
  return stableStringify(section.content || {}) !== stableStringify(section.publishedContent || {});
}

/** Long enough that one sitting is one version, short enough that yesterday's
 *  wording is still recoverable. */
export const VERSION_COALESCE_WINDOW_MS = 5 * 60 * 1000;

export const VERSION_RETENTION_DAYS = 30;

/**
 * Whether this save folds into the newest version rather than adding one.
 *
 * Without this the 800ms autosave writes a history row per keystroke. Fails
 * toward writing a NEW version on every uncertainty (no history, another
 * person, an unreadable or future timestamp), because an extra version costs a
 * row and a missing one costs somebody their words.
 */
export function shouldCoalesceVersion(
  newest: { createdAt: string; savedBy: string | null } | null,
  savedBy: string | null,
  now: Date = new Date()
): boolean {
  if (!newest) return false;
  if (!savedBy || newest.savedBy !== savedBy) return false;

  const created = Date.parse(newest.createdAt);
  if (!Number.isFinite(created)) return false;

  const age = now.getTime() - created;
  if (age < 0) return false;

  return age <= VERSION_COALESCE_WINDOW_MS;
}

/** Anything older than this is deleted on the next save of that section.
 *  Pruning on write, never on a cron: the plan allows one cron a day and both
 *  slots are spoken for. */
export function versionPruneCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - VERSION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Words that never appear in press kit copy, ours or a model's.
 *
 * One list, read by two things that would otherwise drift: the system message
 * that tells UrgAns how to write, and `press-kit-copy-guard.test.ts`, which
 * holds every string in the feature to the same rule. A house rule stated in
 * two places is a house rule that ends up meaning two things.
 *
 * "Ship" is out because a release is DELIVERED. The em dash is out because it
 * is the one punctuation mark that makes a sentence read as written by a
 * machine.
 */
export const BANNED_COPY_WORDS: readonly string[] = ['ship', 'shipped', 'ships', 'shipping'];

export const BANNED_COPY_CHARS: readonly string[] = ['\u2014'];

/** The instruction handed to a model, built from the lists above so it cannot
 *  disagree with what the guard enforces. */
export function bannedCopyInstruction(): string {
  return `Do not use em dashes. Do not use the word "${BANNED_COPY_WORDS[0]}".`;
}

/**
 * Fold a kit the single-kit screen just loaded back into the cached roster.
 *
 * The tab paints from a cached roster, so without this a kit you created or
 * published stays absent or stale on the tab until the next revalidate — the
 * user watching the very state they just changed fail to appear. Merging costs
 * nothing and needs no round trip, because the single-kit screen has the
 * server's own answer in hand.
 *
 * Two rules worth keeping. The ROSTER decides who is on it: a kit whose artist
 * is not listed is ignored rather than added, since a roster row can only come
 * from the roster endpoint and inventing one would put an artist on screen that
 * the workspace may not carry. And the roster's NAME wins over the kit's copy
 * of it, for the same reason.
 *
 * Returns the original array when nothing matched, so a no-op cannot repaint
 * the tab.
 */
export function applyKitToRoster(
  entries: readonly PressKitRosterEntry[],
  kit: PressKit
): PressKitRosterEntry[] {
  const index = entries.findIndex((entry) => entry.artistId === kit.artistId);
  if (index === -1) return entries as PressKitRosterEntry[];

  const next = entries.slice();
  next[index] = { ...entries[index], kit: { ...kit, artistName: entries[index].artistName } };
  return next;
}
