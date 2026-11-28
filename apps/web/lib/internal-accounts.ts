// Our own and test accounts, left out of analytics (2026-10-16, founder: "i hope
// any account you are using is excluded from the analytics").
//
// Pure and safe on the client: no env reads. The admin pages add ADMIN_EMAILS and
// METRICS_INTERNAL_EMAILS on top of this list (app/api/admin/_shared.ts).
//
// One of us is: an @urganize.app address, an address on this list, or a
// plus-alias of one (luckydio10+anything@gmail.com is a test inbox of ours).
// Any address whose name part contains "luckydio" is ours too (founder,
// 2026-10-16: "it should be any email luckydio").
//
// Since 2026-10-18 (URG-369) the team's other inboxes match by PATTERN, the
// same rule the read-only SQL checks use (luckydio%, luckywenapere%,
// %@urganize.app, theurganization%, tedumking%, ugorjigideon%, clebmichael%):
// a name part that STARTS with one of INTERNAL_NAME_PREFIXES is ours, so a new
// +alias or a "luckywenapere2@" test inbox is left out without anyone listing
// it in METRICS_INTERNAL_EMAILS. That env list still adds exact addresses on top.

const INTERNAL_DOMAIN = '@urganize.app';
const INTERNAL_NAME_PART = 'luckydio';

/** Name parts (before the @) that mark one of us when an address starts with them. */
export const INTERNAL_NAME_PREFIXES: readonly string[] = [
  'luckydio',
  'luckywenapere',
  'theurganization',
  'tedumking',
  'ugorjigideon',
  'clebmichael',
];

export const BUILT_IN_INTERNAL_EMAILS: readonly string[] = [
  'luckydio10@gmail.com',
  'luckywenapere@gmail.com',
  'theurganization@gmail.com',
  // A team account (founder, 2026-11-28).
  'apexcyber00@gmail.com',
  // QA accounts Hark signs in with.
  'luckydio10.paywalltest@gmail.com',
];

const BUILT_IN = new Set(BUILT_IN_INTERNAL_EMAILS);

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

/** One of us, by the built-in list and the extra addresses given. */
export function isInternalAccountEmail(
  email: string | null | undefined,
  extra: ReadonlySet<string> | readonly string[] = []
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (normalized.endsWith(INTERNAL_DOMAIN)) return true;
  const at = normalized.indexOf('@');
  if (at > 0) {
    const name = normalized.slice(0, at);
    if (name.includes(INTERNAL_NAME_PART)) return true;
    if (INTERNAL_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  }
  const listed = (value: string) =>
    BUILT_IN.has(value) || (Array.isArray(extra) ? extra.includes(value) : (extra as ReadonlySet<string>).has(value));
  if (listed(normalized)) return true;
  const plus = normalized.indexOf('+');
  if (plus > 0 && plus < at) return listed(normalized.slice(0, plus) + normalized.slice(at));
  return false;
}

/**
 * A Set of our addresses whose `has` also answers for @urganize.app and
 * plus-aliases, so every admin page that asks `internalEmails.has(email)`
 * leaves test inboxes out without each one learning the rule.
 */
export class InternalEmailSet extends Set<string> {
  override has(email: string): boolean {
    const normalized = normalizeEmail(email);
    if (super.has(normalized)) return true;
    return isInternalAccountEmail(normalized, [...this.values()]);
  }
}
