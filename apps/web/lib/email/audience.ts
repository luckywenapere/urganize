// Who a dashboard email goes to. Pure: parsing, labels and the final clean-up of
// a recipient list. Reading the actual people out of the database is
// audience-server.ts.
//
// Four kinds (founder call, 2026-09-30): everyone, a group, one person, the
// waitlist. The groups are the ones a founder actually writes to:
//
//   trial        team owners on a free trial        (a nudge before it ends)
//   paying       team owners who pay                (thanks, news)
//   trial_ended  team owners whose trial ran out    (win-back)
//   recent       people who signed up in the last N days
//   no_rollout   people who have not made a rollout yet
//
// The three billing groups are OWNERS, not whole teams: the owner is the person
// who decides whether to pay, and a teammate reading "your trial ends Friday"
// can do nothing about it.

export const AUDIENCE_GROUPS = ['trial', 'paying', 'trial_ended', 'recent', 'no_rollout'] as const;
export type AudienceGroup = (typeof AUDIENCE_GROUPS)[number];

export type Audience =
  | { kind: 'everyone' }
  | { kind: 'group'; group: Exclude<AudienceGroup, 'recent'> }
  | { kind: 'group'; group: 'recent'; days: number }
  | { kind: 'person'; email: string }
  | { kind: 'waitlist' };

export const DEFAULT_RECENT_DAYS = 14;
export const MAX_RECENT_DAYS = 365;

export const AUDIENCE_GROUP_LABELS: Record<AudienceGroup, string> = {
  trial: 'Team owners on a free trial',
  paying: 'Team owners who pay',
  trial_ended: 'Team owners whose trial ended without paying',
  recent: 'People who signed up recently',
  no_rollout: 'People who have not made a rollout yet',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim()) && value.trim().length <= 254;
}

const isGroup = (value: unknown): value is AudienceGroup =>
  typeof value === 'string' && (AUDIENCE_GROUPS as readonly string[]).includes(value);

export type ParsedAudience = { ok: true; audience: Audience } | { ok: false; error: string };

export function parseAudience(raw: unknown): ParsedAudience {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Choose who this email goes to.' };
  const input = raw as Record<string, unknown>;

  switch (input.kind) {
    case 'everyone':
      return { ok: true, audience: { kind: 'everyone' } };
    case 'waitlist':
      return { ok: true, audience: { kind: 'waitlist' } };
    case 'person': {
      const email = String(input.email ?? '').trim().toLowerCase();
      if (!isValidEmailAddress(email)) return { ok: false, error: 'Enter a valid email address.' };
      return { ok: true, audience: { kind: 'person', email } };
    }
    case 'group': {
      if (!isGroup(input.group)) return { ok: false, error: 'Choose a group.' };
      if (input.group !== 'recent') return { ok: true, audience: { kind: 'group', group: input.group } };
      const days =
        input.days === undefined || input.days === null || input.days === ''
          ? DEFAULT_RECENT_DAYS
          : Number(input.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_RECENT_DAYS) {
        return { ok: false, error: `Choose between 1 and ${MAX_RECENT_DAYS} days.` };
      }
      return { ok: true, audience: { kind: 'group', group: 'recent', days } };
    }
    default:
      return { ok: false, error: 'Choose who this email goes to.' };
  }
}

export function describeAudience(audience: Audience): string {
  switch (audience.kind) {
    case 'everyone':
      return 'Everyone with an account';
    case 'waitlist':
      return 'The waitlist (people without an account yet)';
    case 'person':
      return audience.email;
    case 'group':
      return audience.group === 'recent'
        ? `People who signed up in the last ${audience.days} day${audience.days === 1 ? '' : 's'}`
        : AUDIENCE_GROUP_LABELS[audience.group];
  }
}

export type Candidate = { email: string; name: string; userId: string | null };

export type FinalRecipients = {
  recipients: Candidate[];
  suppressedCount: number;
  invalidCount: number;
};

/**
 * Lowercase, drop bad addresses and duplicates, and leave out anyone who
 * unsubscribed or bounced. For a duplicate, the entry that is linked to an
 * account wins, so the greeting uses the name they gave the app.
 */
export function finalizeRecipients(candidates: Candidate[], suppressed: ReadonlySet<string>): FinalRecipients {
  const byEmail = new Map<string, Candidate>();
  let invalidCount = 0;
  for (const candidate of candidates) {
    const email = candidate.email.trim().toLowerCase();
    if (!isValidEmailAddress(email)) {
      invalidCount += 1;
      continue;
    }
    const existing = byEmail.get(email);
    if (!existing || (!existing.userId && candidate.userId)) {
      byEmail.set(email, { email, name: candidate.name.trim(), userId: candidate.userId });
    }
  }

  const recipients: Candidate[] = [];
  let suppressedCount = 0;
  for (const recipient of byEmail.values()) {
    if (suppressed.has(recipient.email)) suppressedCount += 1;
    else recipients.push(recipient);
  }
  return { recipients, suppressedCount, invalidCount };
}

/**
 * Whether a person's OWN team should count for them. Every account is given a
 * team of its own, so someone invited into another team also owns an empty one,
 * on a trial that means nothing. Their own team counts only when they are not a
 * member elsewhere or they actually run rollouts in it: the rule the team
 * access check itself uses (combineTeamAccess).
 */
export function ownTeamCounts(input: { hasForeignMembership: boolean; ownsRollouts: boolean }): boolean {
  return !input.hasForeignMembership || input.ownsRollouts;
}
