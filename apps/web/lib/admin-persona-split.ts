import {
  ONBOARDING_PERSONA_CHOICES,
  ONBOARDING_PERSONA_LABELS,
  isOnboardingPersona,
  type OnboardingPersona,
} from './onboarding';

// The persona split on the founder cockpit (URG-262, 2026-10-14): who our
// accounts say they are, from profiles.onboarding_persona. Built to answer one
// open question, whether artists are overtaking managers and labels.
//
// Why not profiles.role: Google sign-in writes 'artist-manager' for everyone
// who did not choose, so a role count reads as mostly managers whatever the
// truth is. The persona is only ever the person's own answer.
//
// Left out: our own team's accounts (the cockpit's list, plus any
// @urganize.app address and plus-aliases of a listed address, which is how
// test sign-ups are made) and curator-only accounts, which run no releases.
// PURE: rows in, counts out.

export type PersonaSplitRow = {
  email: string | null;
  role: string | null;
  onboarding_persona: string | null;
};

export type PersonaSplitEntry = {
  persona: OnboardingPersona;
  label: string;
  count: number;
};

export type PersonaSplit = {
  /** Outside accounts counted (answered or not). */
  accounts: number;
  answered: number;
  /** Offered answers in their usual order, then any retired answer still on file. */
  byPersona: PersonaSplitEntry[];
  /** Our own accounts left out. */
  internalLeftOut: number;
};

const INTERNAL_DOMAIN = '@urganize.app';

/** One of us: on the list, an @urganize.app address, or a plus-alias of a listed address. */
export function isInternalEmail(email: string | null | undefined, internalEmails: Set<string>): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  if (internalEmails.has(normalized) || normalized.endsWith(INTERNAL_DOMAIN)) return true;
  const at = normalized.indexOf('@');
  const plus = normalized.indexOf('+');
  if (plus > 0 && plus < at) {
    return internalEmails.has(normalized.slice(0, plus) + normalized.slice(at));
  }
  return false;
}

export function buildPersonaSplit(rows: readonly PersonaSplitRow[], internalEmails: Set<string>): PersonaSplit {
  const counts = new Map<OnboardingPersona, number>();
  let accounts = 0;
  let answered = 0;
  let internalLeftOut = 0;

  for (const row of rows) {
    if (String(row.role || '').trim() === 'curator') continue;
    if (isInternalEmail(row.email, internalEmails)) {
      internalLeftOut += 1;
      continue;
    }
    accounts += 1;
    if (isOnboardingPersona(row.onboarding_persona)) {
      answered += 1;
      counts.set(row.onboarding_persona, (counts.get(row.onboarding_persona) ?? 0) + 1);
    }
  }

  const offered = ONBOARDING_PERSONA_CHOICES.map((persona) => ({
    persona,
    label: ONBOARDING_PERSONA_LABELS[persona],
    count: counts.get(persona) ?? 0,
  }));
  const retired = [...counts.entries()]
    .filter(([persona]) => !ONBOARDING_PERSONA_CHOICES.includes(persona))
    .map(([persona, count]) => ({ persona, label: ONBOARDING_PERSONA_LABELS[persona], count }));

  return { accounts, answered, byPersona: [...offered, ...retired], internalLeftOut };
}
