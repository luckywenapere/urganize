import { normalizeName, type PersonIdentifier } from './person-identity';

// Deciding whether somebody a team just added is somebody Urganize already
// knows (Relationships, Phase 2). The order is the contract:
//
//   1. An email match. 2. A phone match. These are identity: the person has
//      them, so two teams adding the same address are adding the same human.
//   3. The team's OWN contact with the same name and role. Safe to reuse
//      because it is that team's own record and nobody else's.
//   4. Anything else is a NEW person. If the name merely resembles one of the
//      team's contacts, that is reported as a possible duplicate for a person
//      to confirm. Nothing here ever merges two people on a name alone.
//
// The candidate lists come from the caller. Names are only ever compared among
// the team's own contacts, so a team cannot learn that another team knows
// somebody by trying names.

export type MatchVia = 'email' | 'phone' | 'name_and_role';

export type MatchInput = {
  /** What this team calls the person. */
  label: string;
  role: string;
  identifiers: PersonIdentifier[];
};

export type MatchContext = {
  /** `${kind}:${value}` to the person who holds it, across ALL teams. */
  byIdentifier: Map<string, string>;
  /** This team's own contacts. */
  teamContacts: Array<{ personId: string; label: string; role: string }>;
};

export type MatchResult =
  | { kind: 'match'; personId: string; via: MatchVia; alsoMatched: string[] }
  | { kind: 'create'; possibleDuplicates: Array<{ personId: string; reason: 'same_name' }> };

export const identifierKey = (identifier: PersonIdentifier): string =>
  `${identifier.kind}:${identifier.value}`;

export function resolvePerson(input: MatchInput, context: MatchContext): MatchResult {
  // Email before phone. If the two point at DIFFERENT people, the email wins and
  // the other is reported so the caller can flag the pair; two profiles that
  // share an identity are very likely one human.
  const order: Array<'email' | 'phone'> = ['email', 'phone'];
  const hits: Array<{ via: 'email' | 'phone'; personId: string }> = [];
  for (const kind of order) {
    for (const identifier of input.identifiers) {
      if (identifier.kind !== kind) continue;
      const personId = context.byIdentifier.get(identifierKey(identifier));
      if (personId) hits.push({ via: kind, personId });
    }
  }
  if (hits.length > 0) {
    const first = hits[0];
    const alsoMatched = [...new Set(hits.map((hit) => hit.personId).filter((id) => id !== first.personId))];
    return { kind: 'match', personId: first.personId, via: first.via, alsoMatched };
  }

  const name = normalizeName(input.label);
  const role = normalizeName(input.role);
  if (!name) return { kind: 'create', possibleDuplicates: [] };

  const sameName = context.teamContacts.filter((contact) => normalizeName(contact.label) === name);
  const sameNameAndRole = sameName.find((contact) => normalizeName(contact.role) === role);
  if (sameNameAndRole) {
    return { kind: 'match', personId: sameNameAndRole.personId, via: 'name_and_role', alsoMatched: [] };
  }

  return {
    kind: 'create',
    possibleDuplicates: sameName.map((contact) => ({ personId: contact.personId, reason: 'same_name' as const })),
  };
}
