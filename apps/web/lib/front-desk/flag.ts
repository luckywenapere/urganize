// Who gets the UrgAns front desk.
//
// On for every curator since Oct 19, 2026 (Oyin: "Ship for everyone
// everything"). Decided on the SERVER from the signed-in email. FRONT_DESK_ALL=false
// (Vercel) is the off switch: it falls back to the Hark Flow Test account plus
// FRONT_DESK_EMAILS (comma separated, exact match), without a deploy of code.
//
// The digest cron and every public read check the CURATOR's account against the
// same rule, so a curator who is not flagged never gets an email or a public
// "Ask a question" box.

export const FRONT_DESK_DEFAULT_EMAILS = ['luckydio10+flowtest1011@gmail.com'] as const;

const normalise = (email: string) => email.trim().toLowerCase();

export function frontDeskEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  const extra = (env.FRONT_DESK_EMAILS || '')
    .split(',')
    .map(normalise)
    .filter(Boolean);
  return new Set([...FRONT_DESK_DEFAULT_EMAILS.map(normalise), ...extra]);
}

export function isFrontDeskEnabledFor(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  // Shipped ON for every curator (Oyin, Oct 19, 2026 04:10 WAT: "Ship for
  // everyone everything"). FRONT_DESK_ALL=false is the off switch, which then
  // falls back to the per-person list below.
  if (env.FRONT_DESK_ALL !== 'false') return true;
  if (!email) return false;
  return frontDeskEmails(env).has(normalise(email));
}
