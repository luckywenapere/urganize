import { buildIdentifiers, type PersonIdentifier } from './person-identity';

// The daily step that makes unclaimed profiles from credits (Lane A).
//
// Pure: it decides, for each credit a collaborator submitted, whether to skip
// it, link it to somebody Urganize already knows, or make one new unclaimed
// profile for it. Reads and writes live in lib/claim-sweep-server.ts.
//
// Every uncertainty ends in a skip. A profile made by mistake is somebody's
// name on a public page, and that is worse than one that waits a day.

export type SweepSubmission = {
  id: string;
  releaseId: string;
  email: string | null;
  phone: string | null;
  confirmedAccurate: boolean;
  personHidden: boolean;
};

export type SweepContext = {
  /** Rollouts that have come out, are not tests and are not archived. */
  deliveredReleaseIds: ReadonlySet<string>;
  /** Emails that already belong to an Urganize account, lowercased. */
  accountEmails: ReadonlySet<string>;
  /** `${kind}:${value}` to the person who already holds it, across all teams. */
  personByIdentifier: ReadonlyMap<string, { personId: string }>;
};

export type SkipReason =
  | 'not_delivered'
  | 'not_confirmed'
  | 'hidden'
  | 'no_contact'
  | 'has_account';

export type SweepDecision =
  | { kind: 'skip'; submissionId: string; reason: SkipReason }
  | { kind: 'link'; submissionId: string; personId: string }
  | { kind: 'create'; submissionId: string; group: number };

const keyOf = (identifier: PersonIdentifier) => `${identifier.kind}:${identifier.value}`;

export function planCreditProfiles(
  submissions: readonly SweepSubmission[],
  context: SweepContext
): SweepDecision[] {
  const decisions: SweepDecision[] = [];
  const toCreate: Array<{ submissionId: string; keys: string[] }> = [];

  for (const submission of submissions) {
    if (!context.deliveredReleaseIds.has(submission.releaseId)) {
      decisions.push({ kind: 'skip', submissionId: submission.id, reason: 'not_delivered' });
      continue;
    }
    if (!submission.confirmedAccurate) {
      decisions.push({ kind: 'skip', submissionId: submission.id, reason: 'not_confirmed' });
      continue;
    }
    if (submission.personHidden) {
      decisions.push({ kind: 'skip', submissionId: submission.id, reason: 'hidden' });
      continue;
    }
    const identifiers = buildIdentifiers({ email: submission.email, phone: submission.phone });
    if (identifiers.length === 0) {
      decisions.push({ kind: 'skip', submissionId: submission.id, reason: 'no_contact' });
      continue;
    }

    // Somebody Urganize already knows: email first, then phone. Names are
    // never compared.
    const ordered = [
      ...identifiers.filter((entry) => entry.kind === 'email'),
      ...identifiers.filter((entry) => entry.kind === 'phone'),
    ];
    const known = ordered.map((entry) => context.personByIdentifier.get(keyOf(entry))).find(Boolean);
    if (known) {
      decisions.push({ kind: 'link', submissionId: submission.id, personId: known.personId });
      continue;
    }

    // An account already exists, so there is nothing to claim.
    const hasAccount = identifiers.some(
      (entry) => entry.kind === 'email' && context.accountEmails.has(entry.value)
    );
    if (hasAccount) {
      decisions.push({ kind: 'skip', submissionId: submission.id, reason: 'has_account' });
      continue;
    }

    toCreate.push({ submissionId: submission.id, keys: identifiers.map(keyOf) });
  }

  // Two credits that share an email or a phone are one person. Group them so
  // one profile is made, not one per credit.
  const parent = toCreate.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const firstWith = new Map<string, number>();
  toCreate.forEach((entry, index) => {
    for (const key of entry.keys) {
      const other = firstWith.get(key);
      if (other === undefined) firstWith.set(key, index);
      else parent[find(index)] = find(other);
    }
  });
  const groupNumber = new Map<number, number>();
  toCreate.forEach((entry, index) => {
    const root = find(index);
    if (!groupNumber.has(root)) groupNumber.set(root, groupNumber.size);
    decisions.push({ kind: 'create', submissionId: entry.submissionId, group: groupNumber.get(root) as number });
  });
  return decisions;
}

export type SweepSummary = {
  scanned: number;
  /** New unclaimed profiles this would make. */
  wouldCreate: number;
  /** Credits that would point at a profile that already exists. */
  wouldLink: number;
  skipped: Record<SkipReason, number>;
};

export function summarizeSweep(decisions: readonly SweepDecision[]): SweepSummary {
  const skipped: Record<SkipReason, number> = {
    not_delivered: 0,
    not_confirmed: 0,
    hidden: 0,
    no_contact: 0,
    has_account: 0,
  };
  const groups = new Set<number>();
  let wouldLink = 0;
  for (const decision of decisions) {
    if (decision.kind === 'skip') skipped[decision.reason] += 1;
    else if (decision.kind === 'link') wouldLink += 1;
    else groups.add(decision.group);
  }
  return { scanned: decisions.length, wouldCreate: groups.size, wouldLink, skipped };
}
