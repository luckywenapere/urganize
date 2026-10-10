import { DIRECTORY_ROLES } from './directory-roles';

/**
 * What the directory tells PostHog about a request and a profile view
 * (2026-10-10). The funnel the spec reads: search, view, request, answer.
 *
 * NO NAMES, NO TEXT. A request note, a reply and a person's name are somebody's
 * words about somebody, and an analytics payload is not where they belong. So
 * every event is built here from an explicit allowlist: a role from the fixed
 * vocabulary (anything else is null, never passed through), booleans, and one
 * count. The reply's text never leaves this file; only `has_reply` does.
 *
 * Pure so the allowlist can be tested. The capture itself is in
 * lib/directory-events-server.ts, which never throws.
 */

const isRole = (value: unknown): value is string =>
  typeof value === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(value);

const roleOrNull = (value: unknown): string | null => (isRole(value) ? value : null);

const HOUR_MS = 60 * 60 * 1000;

export type RequestSentProperties = { role: string | null; has_release: boolean };

export function requestSentProperties(input: {
  role: unknown;
  releaseId: string | null | undefined;
  [extra: string]: unknown;
}): RequestSentProperties {
  return { role: roleOrNull(input.role), has_release: Boolean(input.releaseId) };
}

export type RequestAnsweredProperties = {
  role: string | null;
  answer: 'interested' | 'passed';
  has_reply: boolean;
  /** Whole hours from sending to answering, never negative. Null if unreadable. */
  hours_to_answer: number | null;
};

export function requestAnsweredProperties(
  input: {
    role: unknown;
    createdAt: string | null | undefined;
    reply: string | null | undefined;
    status: 'interested' | 'passed';
    [extra: string]: unknown;
  },
  now: Date | number = Date.now()
): RequestAnsweredProperties {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const created = input.createdAt ? Date.parse(input.createdAt) : NaN;
  return {
    role: roleOrNull(input.role),
    answer: input.status,
    has_reply: typeof input.reply === 'string' && input.reply.trim().length > 0,
    hours_to_answer: Number.isFinite(created) ? Math.max(0, Math.round((nowMs - created) / HOUR_MS)) : null,
  };
}

export type ProfileViewedProperties = {
  surface: 'public_page';
  role: string | null;
  claimed: boolean;
};

export function profileViewedProperties(input: { roles: readonly string[]; claimed: boolean }): ProfileViewedProperties {
  return {
    surface: 'public_page',
    role: input.roles.find(isRole) ?? null,
    claimed: input.claimed,
  };
}
