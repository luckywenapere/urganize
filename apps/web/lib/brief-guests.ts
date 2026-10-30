// Share the brief with a person (#897 phase 6, 2026-10-31). Pure rules for a
// brief guest: who they are, what they may change, and the seat and cap rules
// Oyin set on 31 Oct 2026: a guest may change the status of an activity
// assigned to them and nothing else; guests invited from a brief take no paid
// seat, up to 5 per rollout.

import type { Parsed } from '@/lib/release-brief';

export const BRIEF_GUESTS_MAX = 5;
const NAME_MAX = 80;
const PART_MAX = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A team-member row needs an email; a guest shared over WhatsApp has none until
// they join, when it is replaced by theirs. The .invalid domain never delivers.
const PLACEHOLDER_DOMAIN = '@brief-guest.invalid';

export function placeholderGuestEmail(id: string): string {
  return `guest-${id}${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderGuestEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.endsWith(PLACEHOLDER_DOMAIN);
}

export type BriefGuestInvite = { name: string; email: string | null; taskIds: string[] };

/** `POST /brief/guests` body: `{ name, email?, taskIds? }`. */
export function parseBriefGuestInvite(body: unknown): Parsed<BriefGuestInvite> {
  const input = (body && typeof body === 'object' ? body : null) as Record<string, unknown> | null;
  if (!input) return { ok: false, error: 'Say who you are sharing with.' };
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) return { ok: false, error: 'Add their name.' };
  if (name.length > NAME_MAX) return { ok: false, error: `Keep the name under ${NAME_MAX} characters.` };
  const rawEmail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (rawEmail && !EMAIL.test(rawEmail)) return { ok: false, error: 'That email does not look right.' };
  const ids = Array.isArray(input.taskIds) ? input.taskIds : [];
  if (ids.some((id) => typeof id !== 'string' || !UUID.test(id))) return { ok: false, error: 'Pick their part from the brief.' };
  const taskIds = [...new Set(ids as string[])].slice(0, PART_MAX);
  return { ok: true, value: { name, email: rawEmail || null, taskIds } };
}

/** Guests invited from a brief take no paid seat (Oyin, 31 Oct 2026). */
export function isSeatExempt(member: { role: string | null; brief_release_id: string | null }): boolean {
  return member.role === 'guest' && Boolean(member.brief_release_id);
}

/**
 * The one change a guest may make (Oyin, 31 Oct 2026): the status of an
 * activity assigned to them. Any other field in the request, or someone
 * else's activity, and the request stays read-only.
 */
export function guestMayChangeTask(input: { body: unknown; assignedTo: string | null; userId: string }): boolean {
  const body = input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : null;
  if (!body) return false;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'status') return false;
  return Boolean(input.assignedTo) && input.assignedTo === input.userId;
}

/** The page a guest opens before joining: the brief and their part. */
export function briefGuestPagePath(token: string): string {
  return `/brief/invite/${encodeURIComponent(token)}`;
}

/** Join, then land on the rollout's brief. */
export function briefGuestJoinPath(token: string, releaseId: string): string {
  const next = `/dashboard?release=${releaseId}&scene=brief`;
  return `/invite/accept?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
}

export function briefGuestShareText(input: { senderName: string; releaseTitle: string; link: string }): string {
  return `${input.senderName} shared the brief for ${input.releaseTitle} with you.\n${input.link}`;
}

/** WhatsApp with the text written; the person picks the chat and sends. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
