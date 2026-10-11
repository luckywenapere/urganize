import { normalizeEmail } from './person-identity';
import { PERSON_DISPLAY_NAME_MAX_CHARS } from './person-profile';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';

// Directory referral invites (2026-10-11, GitHub #834). Pure rules: no IO, no
// React, no node imports, so the Directory screen and vitest both read them.
//
// WHAT THIS IS. A manager invites the people they work with (producers, mix
// engineers, video directors...) into the Directory. Each invite is the
// founder-seeding shape run by a team member: a private, unclaimed profile
// with the name and role the manager typed, and a /welcome/{token} link. The
// invitee checks it, signs up or signs in, and publishes only if they want to.
// The manager sees who they asked and who joined.
//
// NO REWARD, on purpose. See "Directory referral invites" in CLAUDE.md: a
// signup costs nothing to fake, and the existing rewards (the one-month share
// reward, referral credits on a first payment) are built so that nothing pays
// out on a signup alone.

/** Invites one person may send in a rolling 24 hours. Every invite can send an
 *  email, and the whole app shares one daily email budget. */
export const DIRECTORY_INVITE_DAILY_LIMIT = 20;

/** The role a new invite starts on: the issue's first example. */
export const DEFAULT_INVITE_ROLE: DirectoryRole = 'producer';

export type DirectoryInviteInput = {
  name: string;
  role: DirectoryRole;
  email: string | null;
  /** True when the manager asked us to email the link. */
  send: boolean;
};

export type DirectoryInviteCheck = { ok: true; data: DirectoryInviteInput } | { ok: false; error: string };

/**
 * The invite form, checked. A name and a role are required, because they are
 * what the invitee lands on. An email is optional (the manager can share the
 * link on WhatsApp instead), but "send" without one is refused rather than
 * silently turned into a link.
 */
export function checkDirectoryInviteInput(raw: unknown): DirectoryInviteCheck {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { ok: false, error: 'Add their name.' };
  if (name.length > PERSON_DISPLAY_NAME_MAX_CHARS) {
    return { ok: false, error: `Keep the name to ${PERSON_DISPLAY_NAME_MAX_CHARS} characters or fewer.` };
  }

  const role = body.role;
  if (typeof role !== 'string' || !(DIRECTORY_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: 'Pick what they do.' };
  }

  const emailText = typeof body.email === 'string' ? body.email.trim() : '';
  const email = emailText ? normalizeEmail(emailText) : null;
  if (emailText && !email) return { ok: false, error: 'That email does not look right.' };

  const send = body.send === true;
  if (send && !email) return { ok: false, error: 'Add their email, or get a link instead.' };

  return { ok: true, data: { name, role: role as DirectoryRole, email, send } };
}

/** Whether one more invite is allowed today. An unreadable count refuses. */
export function inviteLimitReached(sentInLastDay: number | null): boolean {
  if (sentInLastDay === null || !Number.isFinite(sentInLastDay)) return true;
  return sentInLastDay >= DIRECTORY_INVITE_DAILY_LIMIT;
}

export const DAILY_LIMIT_MESSAGE = `You can send ${DIRECTORY_INVITE_DAILY_LIMIT} invites a day. Try again tomorrow.`;

// ---------------------------------------------------------------------------
// What the inviter sees

export type DirectoryInviteStatus = 'invited' | 'opened' | 'joined' | 'listed';

export type DirectoryInviteDates = {
  openedAt: string | null;
  joinedAt: string | null;
  publishedAt: string | null;
};

/** The furthest point somebody reached. Listed is inside joined. */
export function directoryInviteStatus(dates: DirectoryInviteDates): DirectoryInviteStatus {
  if (dates.publishedAt) return 'listed';
  if (dates.joinedAt) return 'joined';
  if (dates.openedAt) return 'opened';
  return 'invited';
}

export const DIRECTORY_INVITE_STATUS_LABEL: Record<DirectoryInviteStatus, string> = {
  invited: 'Invited',
  opened: 'Opened',
  joined: 'Joined',
  listed: 'Listed',
};

export function hasJoined(status: DirectoryInviteStatus): boolean {
  return status === 'joined' || status === 'listed';
}

/** "3 invited · 1 joined". */
export function directoryInviteSummary(statuses: DirectoryInviteStatus[]): string {
  const joined = statuses.filter(hasJoined).length;
  return `${statuses.length} invited · ${joined} joined`;
}

export function roleLabel(role: string): string {
  return (DIRECTORY_ROLE_LABELS as Record<string, string>)[role] ?? 'Creative';
}

/** "a producer", "an A&R". Lower-cased except for the all-caps labels. */
export function roleWithArticle(role: string): string {
  const label = roleLabel(role);
  const word = /^[A-Z&]+$/.test(label) ? label : label.toLowerCase();
  return `${/^[aeiouAEIOU]/.test(word) ? 'an' : 'a'} ${word}`;
}

// ---------------------------------------------------------------------------
// The message the manager shares

export function firstNameOf(name: string): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * The text behind "Share on WhatsApp" and Copy. One person writing to one
 * person, in the manager's voice. The first thing promised is that nothing is
 * public until they choose, the seeding message's rule.
 */
export function directoryInviteShareText(input: { name: string; role: string; url: string }): string {
  const first = firstNameOf(input.name);
  const hello = first ? `Hi ${first}` : 'Hi';
  return `${hello}, I added you to the Urganize Directory as ${roleWithArticle(input.role)}, so artists and managers can find you. Only you can see it until you publish it. Check it here: ${input.url}`;
}

export function whatsappShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
