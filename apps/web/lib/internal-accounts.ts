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

/** Throwaway inbox services: every address on them is somebody testing (2026-11-28).
 *  Left out of numbers by isExcludedFromMetrics, never treated as the team. */
export const THROWAWAY_EMAIL_DOMAINS: readonly string[] = [
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamailblock.com',
  'grr.la',
  'sharklasers.com',
  'pokemail.net',
  'spam4.me',
  'tempmail.com',
  'temp-mail.org',
  'tempmail.net',
  'tempmail.dev',
  'tempmailo.com',
  '10minutemail.com',
];

/** The whole domain or a subdomain of one, never a look-alike. */
function isThrowawayDomain(domain: string): boolean {
  return THROWAWAY_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
}

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
  // Chidera, on the team (founder, 2026-11-28).
  'itsderah@gmail.com',
  // QA accounts Hark signs in with.
  'luckydio10.paywalltest@gmail.com',
];

const BUILT_IN = new Set(BUILT_IN_INTERNAL_EMAILS);

/**
 * Tester accounts (founder, 2026-11-28: "those are testers too"). Left out of
 * every number, like the team, but NOT the team: isInternalAccountEmail also
 * opens team-only routes (/api/trm/health), and a tester must not get those.
 */
export const TEST_ACCOUNT_EMAILS: readonly string[] = [
  'apexcyber00@gmail.com',
  'realameerdev@gmail.com',
  'getsentra.co@gmail.com',
];

const TEST_ACCOUNTS = new Set(TEST_ACCOUNT_EMAILS);

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
 * Left out of analytics and admin numbers: the team, plus tester accounts and
 * throwaway inboxes. Use this for COUNTING only. To decide whether someone may
 * see a team-only screen, use isInternalAccountEmail, which testers never pass.
 */
export function isExcludedFromMetrics(
  email: string | null | undefined,
  extra: ReadonlySet<string> | readonly string[] = []
): boolean {
  if (isInternalAccountEmail(email, extra)) return true;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const at = normalized.indexOf('@');
  if (at > 0 && isThrowawayDomain(normalized.slice(at + 1))) return true;
  if (TEST_ACCOUNTS.has(normalized)) return true;
  const plus = normalized.indexOf('+');
  return plus > 0 && plus < at && TEST_ACCOUNTS.has(normalized.slice(0, plus) + normalized.slice(at));
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
    return isExcludedFromMetrics(normalized, [...this.values()]);
  }
}
