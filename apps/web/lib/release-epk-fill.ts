import { bannedCopyInstruction } from '@/lib/press-kits';
import type { DraftMessage } from '@/lib/press-kit-draft';
import type { ReleaseEpkCredit } from '@/lib/release-epk';
import { MAX_STORY_LENGTH } from '@/lib/release-epk';

/**
 * "Fill both": one UrgAns run that writes the gaps in the artist's standing
 * press kit AND the release's own story, in one model call.
 *
 * Pure: no IO, no env, no model call. The action wrapper
 * (lib/urgans-actions/actions/epk-fill-both.ts) does the calling.
 *
 * THE RULES, all carried over from lib/press-kit-draft.ts and worth restating
 * because they are the whole safety story:
 *   - UrgAns writes PROSE, never facts. The same allowlist applies per kit
 *     section, and the story is prose about this release.
 *   - It FILLS GAPS. It never overwrites a field a person has written. That is
 *     enforced twice: the model is only asked for what is empty, and apply
 *     re-reads and skips anything that has since been filled. So "accept"
 *     cannot destroy an edit, and there is no stale-draft failure to explain.
 */

export type KitProse = {
  header?: { descriptor?: string };
  bios?: { short?: string; medium?: string; long?: string };
  latest_release?: { hook?: string };
};

export type FillTarget = {
  /** Which kit fields are empty today. */
  descriptor: boolean;
  short: boolean;
  medium: boolean;
  long: boolean;
  /** Only true when the kit's latest release IS this release: a hook for a
   *  different release would be written into the wrong place. */
  hook: boolean;
  story: boolean;
};

export type FillDraft = {
  kit: KitProse;
  story?: string;
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** What is empty. `kitExists` false means the kit side cannot be filled at all. */
export function findGaps(input: {
  kitExists: boolean;
  header: Record<string, unknown>;
  bios: Record<string, unknown>;
  latestRelease: Record<string, unknown>;
  releaseId: string;
  story: string;
}): FillTarget {
  const k = input.kitExists;
  return {
    descriptor: k && !text(input.header.descriptor),
    short: k && !text(input.bios.short),
    medium: k && !text(input.bios.medium),
    long: k && !text(input.bios.long),
    hook:
      k &&
      text(input.latestRelease.releaseId) === input.releaseId &&
      !text(input.latestRelease.hook),
    story: !input.story.trim(),
  };
}

export function hasAnyGap(target: FillTarget): boolean {
  return Object.values(target).some(Boolean);
}

export type FillContext = {
  artistName: string;
  genres: string;
  homeCity: string;
  descriptor: string;
  existingBios: { short: string; medium: string; long: string };
  release: {
    title: string;
    releaseType: string;
    releaseDate: string;
    description: string;
    genre: string;
  };
  credits: ReleaseEpkCredit[];
  existingStory: string;
};

const ASK_PARTS: { key: keyof FillTarget; json: string; ask: string }[] = [
  {
    key: 'descriptor',
    json: '"descriptor": string',
    ask: '"descriptor": ONE line describing the artist, the sentence a journalist would reuse in their intro.',
  },
  {
    key: 'short',
    json: '"short": string',
    ask: '"short": an artist bio of about 50 words, third person.',
  },
  {
    key: 'medium',
    json: '"medium": string',
    ask: '"medium": an artist bio of about 150 words, third person.',
  },
  {
    key: 'long',
    json: '"long": string',
    ask: '"long": an artist bio of about 300 words, third person.',
  },
  {
    key: 'hook',
    json: '"hook": string',
    ask: '"hook": one or two lines on why this release is worth writing about, the thing an editor decides on.',
  },
  {
    key: 'story',
    json: '"story": string',
    ask: '"story": the story behind this release in 80 to 150 words, for a pitch to a curator or editor. What it is, why it exists, what makes it worth a listen.',
  },
];

export function buildFillMessages(
  target: FillTarget,
  context: FillContext,
  notes: string
): DraftMessage[] {
  const wanted = ASK_PARTS.filter((part) => target[part.key]);
  if (wanted.length === 0) throw new Error('Nothing to fill.');

  const facts: string[] = [`Artist: ${context.artistName || 'unknown'}`];
  if (context.genres) facts.push(`Genres: ${context.genres}`);
  if (context.homeCity) facts.push(`Based in: ${context.homeCity}`);
  if (context.descriptor) facts.push(`Described as: ${context.descriptor}`);
  const release = context.release;
  facts.push(
    `This release: ${release.title || 'untitled'}` +
      (release.releaseType ? ` (${release.releaseType})` : '') +
      (release.releaseDate ? `, out ${release.releaseDate}` : '')
  );
  if (release.genre) facts.push(`Its genre: ${release.genre}`);
  if (release.description) facts.push(`About it: ${release.description}`);
  if (context.credits.length > 0) {
    facts.push(
      `Credits: ${context.credits
        .slice(0, 20)
        .map((c) => (c.role ? `${c.name} (${c.role})` : c.name))
        .join('; ')}`
    );
  }

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
        bannedCopyInstruction(),
        'Reply with JSON only, no other text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Write only these fields, and return JSON with exactly these keys: {${wanted
          .map((p) => p.json)
          .join(', ')}}.`,
        ...wanted.map((p) => p.ask),
        '',
        'Facts:',
        facts.join('\n'),
        existing.length > 0 ? `\nAlready written, match this voice:\n${existing.join('\n')}` : '',
        context.existingStory ? `\nThe story so far:\n${context.existingStory}` : '',
        notes.trim() ? `\nWhat the manager wants said:\n${notes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

const MAX_FIELD = 4000;

const clip = (value: unknown, max: number): string | undefined => {
  const t = text(value).slice(0, max);
  return t ? t : undefined;
};

/**
 * Keep only what was ASKED for. A model asked for a short bio will cheerfully
 * return a home city too; anything outside `target` is dropped without comment.
 * Returns null on unparseable input or when nothing usable survived.
 */
export function parseFillResponse(target: FillTarget, raw: string): FillDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;

  const kit: KitProse = {};
  const descriptor = target.descriptor ? clip(r.descriptor, MAX_FIELD) : undefined;
  if (descriptor) kit.header = { descriptor };

  const bios: NonNullable<KitProse['bios']> = {};
  for (const key of ['short', 'medium', 'long'] as const) {
    const value = target[key] ? clip(r[key], MAX_FIELD) : undefined;
    if (value) bios[key] = value;
  }
  if (Object.keys(bios).length > 0) kit.bios = bios;

  const hook = target.hook ? clip(r.hook, MAX_FIELD) : undefined;
  if (hook) kit.latest_release = { hook };

  const story = target.story ? clip(r.story, MAX_STORY_LENGTH) : undefined;

  if (Object.keys(kit).length === 0 && !story) return null;
  return story ? { kit, story } : { kit };
}

/**
 * Apply a draft to what is in the database NOW, filling only what is still
 * empty. Returns the content to write per section (only sections that gained
 * something) and a count, so the result can say what was skipped.
 */
export function planFillApply(
  draft: FillDraft,
  current: {
    header: Record<string, unknown>;
    bios: Record<string, unknown>;
    latestRelease: Record<string, unknown>;
    story: string;
  }
): {
  sections: Partial<Record<'header' | 'bios' | 'latest_release', Record<string, unknown>>>;
  story: string | null;
  filled: number;
  skipped: number;
} {
  const sections: Partial<Record<'header' | 'bios' | 'latest_release', Record<string, unknown>>> =
    {};
  let filled = 0;
  let skipped = 0;

  const merge = (
    key: 'header' | 'bios' | 'latest_release',
    existing: Record<string, unknown>,
    incoming: Record<string, string | undefined> | undefined
  ) => {
    if (!incoming) return;
    const next: Record<string, unknown> = { ...existing };
    let changed = false;
    for (const [field, value] of Object.entries(incoming)) {
      if (!value) continue;
      if (text(existing[field])) {
        skipped += 1;
        continue;
      }
      next[field] = value;
      changed = true;
      filled += 1;
    }
    if (changed) sections[key] = next;
  };

  merge('header', current.header, draft.kit.header);
  merge('bios', current.bios, draft.kit.bios);
  merge('latest_release', current.latestRelease, draft.kit.latest_release);

  let story: string | null = null;
  if (draft.story) {
    if (current.story.trim()) skipped += 1;
    else {
      story = draft.story;
      filled += 1;
    }
  }

  return { sections, story, filled, skipped };
}
