// A draft handed to the admin composer through its link (iteration 5 of the
// admin dashboard, 2026-10-10): /admin/emails/new?to=…&subject=…&body=…
//
// The founder cockpit's "Needs a message" list links here so a message to a
// stalled team goes out from the Urganize address and is logged with the other
// admin emails. A link only FILLS IN the form: nothing is sent until the admin
// presses Send and confirms, and every backing route still checks
// ADMIN_EMAILS. Anyone can craft such a link, so everything read from it is
// treated as untrusted text:
//   - `to` must be one plain email address (no list, no header tricks); a bad
//     one is dropped and the form opens on its usual audience,
//   - subject and body are cut to the composer's own limits and stripped of
//     control characters,
//   - none of it is ever rendered as HTML: the form shows it as input values,
//     and the preview goes through the same server renderer as typed text.
//
// Pure and client-safe.

import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_SUBJECT_MAX } from './announcement';
import { isValidEmailAddress } from './audience';

export const COMPOSE_PATH = '/admin/emails/new';

export type ComposePrefill = {
  /** One recipient, or null when the link named none (or a bad one). */
  to: string | null;
  subject: string;
  body: string;
};

type ParamReader = { get: (name: string) => string | null };

// Control characters other than tab and newline (C0, DEL and C1).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** One plain address: what isValidEmailAddress accepts, minus anything that
 *  could name a second recipient or smuggle a header. */
export function isSingleEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!isValidEmailAddress(trimmed)) return false;
  return !/[\s,;:<>()[\]"'\\?&#%]/.test(trimmed);
}

function cleanSubject(value: string | null): string {
  return (value ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, ANNOUNCEMENT_SUBJECT_MAX);
}

function cleanBody(value: string | null): string {
  return (value ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').slice(0, ANNOUNCEMENT_BODY_MAX);
}

/** The draft in a composer link, or null when the link carries none. */
export function parseComposePrefill(params: ParamReader | null | undefined): ComposePrefill | null {
  if (!params) return null;
  const rawTo = params.get('to');
  const subject = cleanSubject(params.get('subject'));
  const body = cleanBody(params.get('body'));
  const to = isSingleEmail(rawTo) ? rawTo.trim().toLowerCase() : null;
  if (!to && !subject && !body.trim()) return null;
  return { to, subject, body };
}

/** A link to the composer with this draft filled in. Null without a usable
 *  recipient, so a caller never opens the form aimed at everyone by mistake. */
export function composeDraftHref(draft: { to: string | null; subject: string; body: string }): string | null {
  if (!isSingleEmail(draft.to)) return null;
  const params = new URLSearchParams();
  params.set('to', draft.to.trim());
  if (draft.subject) params.set('subject', cleanSubject(draft.subject));
  if (draft.body) params.set('body', cleanBody(draft.body));
  return `${COMPOSE_PATH}?${params.toString()}`;
}
