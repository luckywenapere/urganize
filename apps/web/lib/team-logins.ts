// Team logins (founder request, 2026-08-16) — shared, dependency-free so BOTH
// the API routes and the client components import the same rules. No
// node:crypto here (that's lib/invite-link.ts, server-only) and no React, so
// this module is safe from either side and unit-testable on its own.
//
// A "login" in this product is a LINK, never a password. The manager copies
// one into WhatsApp or an email; whoever opens it signs up on
// /invite/accept, choosing their own password there, and lands in the
// workspace. Nothing this product generates is a credential a third party
// could read off a chat log — which is the whole reason it is shaped this way
// rather than as a temporary password to be changed on first sign-in.

/** Client + route gate. Default off, the repo-wide convention. */
export const TEAM_LOGINS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEAM_LOGINS === 'true';

/** Free-text shorthand the manager writes to tell two links apart. Bounded so
 * a paste of an entire email body can't become a label. */
export const MAX_LOGIN_LABEL_LENGTH = 60;

/** How many live links one workspace may hold at once. "Unlimited" is the
 * user-facing promise and this is nowhere near a real manager's ceiling — it
 * exists only so a stuck retry loop can't mint rows forever. Revoking frees
 * a slot immediately, so nobody hits this through ordinary use. */
export const MAX_ACTIVE_TEAM_LOGINS = 200;

export type TeamLoginState = 'active' | 'revoked' | 'expired';

export type TeamLogin = {
  id: string;
  /** The full shareable URL — app.urganize.app/join/<code>. */
  url: string;
  label: string | null;
  /** Title of the release whose creation minted this link, when it had one. */
  releaseTitle: string | null;
  createdAt: string;
  expiresAt: string | null;
  state: TeamLoginState;
};

/** Trim + clamp a label. Returns null for an empty one so the column stays
 * NULL rather than holding an empty string. */
export function normalizeLoginLabel(value: unknown): string | null {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_LOGIN_LABEL_LENGTH);
}

/** Resolve a row's display state. Revoked beats expired: a manager who
 * revoked a link should see that they did, not that it timed out. */
export function resolveLoginState(row: {
  revokedAt?: string | null;
  expiresAt?: string | null;
}): TeamLoginState {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt) {
    const ms = Date.parse(row.expiresAt);
    if (Number.isFinite(ms) && ms <= Date.now()) return 'expired';
  }
  return 'active';
}

/** Days remaining before a link stops working, floored at 0. Null when the
 * link never expires. */
export function daysUntilExpiry(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil((ms - now) / (24 * 60 * 60 * 1000)));
}

/**
 * The message the manager actually sends. Written to be pasted verbatim into
 * WhatsApp by someone who is not going to edit it: it says what the link is,
 * what happens when you tap it, and that you pick your own password — because
 * an unexplained link from a music manager reads like spam, and the person
 * receiving it needs to know no password is being mailed to them separately.
 *
 * Plain text only. No markdown: WhatsApp renders `*bold*` differently from
 * every mail client, and this same string is used for both.
 */
export function buildLoginShareMessage(params: {
  url: string;
  workspaceName?: string | null;
  releaseTitle?: string | null;
  inviterName?: string | null;
}): string {
  const workspace = String(params.workspaceName || '').trim();
  const release = String(params.releaseTitle || '').trim();
  const inviter = String(params.inviterName || '').trim();

  const opening = inviter
    ? `${inviter} has added you to ${workspace || 'their workspace'} on Urganize.`
    : `You've been added to ${workspace || 'a workspace'} on Urganize.`;

  const context = release ? ` We're running ${release} in there.` : '';

  return [
    `${opening}${context}`,
    '',
    'Open this link to set up your login:',
    params.url,
    '',
    "You'll pick your own password on that page — nobody else sees it.",
  ].join('\n');
}

/** wa.me deep link carrying the message pre-filled. No phone number: the
 * manager picks the chat in WhatsApp, which is how they already work and
 * saves us collecting a number we have no other use for. */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** mailto: with a subject and the same body. */
export function buildEmailShareUrl(message: string, workspaceName?: string | null): string {
  const workspace = String(workspaceName || '').trim();
  const subject = workspace ? `Your login for ${workspace} on Urganize` : 'Your Urganize login';
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
