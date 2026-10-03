// How a person is recognised across teams (Relationships, Phase 2).
//
// Two teams that both work with the same producer should end up pointing at ONE
// profile, so the producer's delivered work adds up in one place. The only safe
// way to say "same person" is something the person has: an email address or a
// phone number. A name is a label, never an identity, and nothing here ever
// compares one to decide two records are the same human.
//
// Pure, so the rules are unit tested. The database holds the normalised values
// (person_identifiers) and enforces uniqueness on them.

export type IdentifierKind = 'email' | 'phone';

export type PersonIdentifier = { kind: IdentifierKind; value: string };

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** A lowercase, trimmed address, or null when it is not one. Plus tags stay: the
 *  address is what the person gave us, and stripping them would merge people. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value || value.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_SHAPE.test(value) ? value : null;
}

const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;
const NIGERIA_CODE = '234';

/**
 * An international-form number ("+2348031234567"), or null.
 *
 * Nigeria is where we sell first, so a number with a leading 0 or no country
 * code is read as Nigerian. Anything that already carries a country code keeps
 * it. This is a recognition key and not a validator: it exists so the same
 * number written four ways compares equal, not to prove the line works.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Letters mean this is not a number somebody typed ("call me").
  if (/[a-z]/i.test(trimmed)) return null;

  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // A Nigerian number is the country code plus exactly ten digits. Checked for
  // every form we INFER the country for, so a short fragment such as "12345" is
  // refused instead of being dressed up as +23412345.
  const NIGERIAN_NATIONAL_DIGITS = 10;

  if (hasPlus) {
    // Already international.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    let national: string;
    if (digits.startsWith('0')) national = digits.slice(1);
    else if (digits.startsWith(NIGERIA_CODE)) national = digits.slice(NIGERIA_CODE.length);
    else national = digits; // a bare local number such as "8031234567"
    if (national.length !== NIGERIAN_NATIONAL_DIGITS) return null;
    digits = NIGERIA_CODE + national;
  }

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
  return `+${digits}`;
}

/** A comparison form of a name: lowercase, accents removed, spaces collapsed.
 *  Used only to FLAG a likely duplicate for a person to confirm, never to merge. */
export function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every usable identifier from what a team typed, email first. Unusable ones
 *  are dropped rather than failing the whole save. */
export function buildIdentifiers(input: { email?: unknown; phone?: unknown }): PersonIdentifier[] {
  const out: PersonIdentifier[] = [];
  const email = normalizeEmail(input.email);
  if (email) out.push({ kind: 'email', value: email });
  const phone = normalizePhone(input.phone);
  if (phone) out.push({ kind: 'phone', value: phone });
  return out;
}
