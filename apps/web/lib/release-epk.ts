/**
 * The release pitch kit: pure rules. No React, no IO, no env.
 *
 * An artist has ONE standing press kit. A release adds only what is true of
 * that release for its pitch: the story behind it, and the credits to show.
 * The cover is the release's own cover art and is never copied here.
 *
 * Lives in lib/ so vitest can hold it (it collects lib/**\/*.test.ts only).
 */

export const MAX_STORY_LENGTH = 4000;
export const MAX_CREDITS = 40;
export const MAX_CREDIT_NAME_LENGTH = 120;
export const MAX_CREDIT_ROLE_LENGTH = 120;

export type ReleaseEpkCredit = { name: string; role: string };

/** What is stored. `credits === null` means "use the collected submissions". */
export type ReleaseEpkFields = {
  story: string;
  storySource: 'user' | 'ai';
  credits: ReleaseEpkCredit[] | null;
};

export const EMPTY_RELEASE_EPK_FIELDS: ReleaseEpkFields = {
  story: '',
  storySource: 'user',
  credits: null,
};

/** A submission already narrowed to what a pitch may show. */
export type SubmittedCredit = {
  legalName: string;
  stageName: string | null;
  roles: string[];
};

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * Turn what collaborators submitted into the list a pitch shows.
 *
 * Reconstructs each entry field by field. The submissions table also holds an
 * email, a phone number, a PRO affiliation, an IPI number and both splits, and
 * none of that belongs in a pitch. A stage name wins over a legal name, since
 * that is the name a credit is printed under.
 */
export function creditsFromSubmissions(submissions: SubmittedCredit[]): ReleaseEpkCredit[] {
  const seen = new Set<string>();
  const out: ReleaseEpkCredit[] = [];
  for (const submission of submissions) {
    const name = clean(submission.stageName, MAX_CREDIT_NAME_LENGTH) ||
      clean(submission.legalName, MAX_CREDIT_NAME_LENGTH);
    if (!name) continue;
    const role = clean(
      (Array.isArray(submission.roles) ? submission.roles : [])
        .map((r) => String(r).replace(/_/g, ' '))
        .join(', '),
      MAX_CREDIT_ROLE_LENGTH
    );
    const key = `${name.toLowerCase()}|${role.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, role });
    if (out.length >= MAX_CREDITS) break;
  }
  return out;
}

/** The credits a pitch shows: the manager's list if they made one, else the
 *  collected ones. An EMPTY manager list is still theirs (they cleared it). */
export function effectiveCredits(
  fields: ReleaseEpkFields,
  submitted: ReleaseEpkCredit[]
): ReleaseEpkCredit[] {
  return fields.credits ?? submitted;
}

export type ParsedFieldsPatch =
  | { ok: true; patch: Partial<ReleaseEpkFields> }
  | { ok: false; error: string };

/**
 * Validate a PUT body. Sparse on purpose: an omitted key leaves the stored
 * value alone, and an explicit `credits: null` returns to automatic. Treating
 * absent as null would wipe the story the moment somebody edited the credits.
 */
export function parseFieldsPatch(body: unknown): ParsedFieldsPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send an object.' };
  }
  const record = body as Record<string, unknown>;
  const patch: Partial<ReleaseEpkFields> = {};

  if ('story' in record) {
    if (typeof record.story !== 'string') return { ok: false, error: 'The story must be text.' };
    if (record.story.length > MAX_STORY_LENGTH) {
      return { ok: false, error: `Keep the story under ${MAX_STORY_LENGTH} characters.` };
    }
    patch.story = record.story.trim();
    // A person typing it is the author, whatever drafted it before.
    patch.storySource = 'user';
  }

  if ('credits' in record) {
    if (record.credits === null) {
      patch.credits = null;
    } else if (Array.isArray(record.credits)) {
      if (record.credits.length > MAX_CREDITS) {
        return { ok: false, error: `Keep the credits to ${MAX_CREDITS} people or fewer.` };
      }
      const credits: ReleaseEpkCredit[] = [];
      for (const entry of record.credits) {
        const item = (entry || {}) as Record<string, unknown>;
        const name = clean(item.name, MAX_CREDIT_NAME_LENGTH);
        if (!name) continue;
        credits.push({ name, role: clean(item.role, MAX_CREDIT_ROLE_LENGTH) });
      }
      patch.credits = credits;
    } else {
      return { ok: false, error: 'Credits must be a list, or null to use the collected ones.' };
    }
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to save.' };
  return { ok: true, patch };
}

/** Read a stored row defensively. Anything unreadable is the empty default. */
export function readStoredFields(row: unknown): ReleaseEpkFields {
  if (!row || typeof row !== 'object') return { ...EMPTY_RELEASE_EPK_FIELDS };
  const record = row as Record<string, unknown>;
  const credits = Array.isArray(record.credits)
    ? record.credits
        .map((entry) => {
          const item = (entry || {}) as Record<string, unknown>;
          return {
            name: clean(item.name, MAX_CREDIT_NAME_LENGTH),
            role: clean(item.role, MAX_CREDIT_ROLE_LENGTH),
          };
        })
        .filter((c) => c.name)
    : null;
  return {
    story: typeof record.story === 'string' ? record.story : '',
    storySource: record.story_source === 'ai' ? 'ai' : 'user',
    credits,
  };
}

/** Is the pitch ready to send? Story and at least one credit, nothing else. */
export function pitchKitChecklist(input: {
  fields: ReleaseEpkFields;
  submittedCredits: ReleaseEpkCredit[];
  hasCover: boolean;
  kitPublished: boolean;
}): { key: 'story' | 'credits' | 'cover' | 'kit'; done: boolean; label: string }[] {
  return [
    { key: 'story', done: input.fields.story.trim().length > 0, label: 'The story behind it' },
    {
      key: 'credits',
      done: effectiveCredits(input.fields, input.submittedCredits).length > 0,
      label: 'Credits',
    },
    { key: 'cover', done: input.hasCover, label: 'Cover art' },
    { key: 'kit', done: input.kitPublished, label: 'The artist press kit is published' },
  ];
}
