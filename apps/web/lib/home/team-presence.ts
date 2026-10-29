// Home's "Your team" card (URG-250, 2026-10-15): when each person on the team
// was last in the app, so a manager can see who is around before chasing them.
//
// It reads the "last seen" ping that already exists (lib/presence.ts): the
// browser pings every couple of minutes while a tab is visible, and the route
// keeps one row per person per Lagos day in user_presence_days. Someone is
// "Online now" inside ONLINE_WINDOW_MS, the same rule /admin/metrics uses.
//
// Pure and client-safe. Now is passed in.

import { isOnline } from '@/lib/presence';
import { timeAgo } from '@/lib/usage-metrics-format';

export const HOME_TEAM_COPY = {
  label: 'Your team',
  online: 'Online now',
  never: 'Not seen yet',
  manage: 'Manage team',
} as const;

// The Team tab (#853, 2026-10-29); Settings → Team moved there.
export const HOME_TEAM_HREF = '/dashboard/team';

export type TeamPresenceMember = {
  userId: string;
  name: string;
  initials: string;
  /** The newest ping we hold for this person, or null when there is none. */
  lastSeenAt: string | null;
};

export type TeamPresenceResponse = {
  members: TeamPresenceMember[];
};

/** The newest last_seen_at per person from presence rows (one row per day). */
export function latestSeenByUser(
  rows: ReadonlyArray<{ user_id: string | null; last_seen_at: string | null }>
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    if (!row.user_id || !row.last_seen_at) continue;
    const at = Date.parse(row.last_seen_at);
    if (!Number.isFinite(at)) continue;
    const held = latest.get(row.user_id);
    if (!held || Date.parse(held) < at) latest.set(row.user_id, row.last_seen_at);
  }
  return latest;
}

/** Online first, then the most recently seen, then people never seen, by name. */
export function sortTeamPresence(members: TeamPresenceMember[], now: Date): TeamPresenceMember[] {
  const seen = (member: TeamPresenceMember) => {
    const at = member.lastSeenAt ? Date.parse(member.lastSeenAt) : NaN;
    return Number.isFinite(at) ? at : -Infinity;
  };
  return [...members].sort((a, b) => {
    const onlineA = isOnline(a.lastSeenAt, now) ? 1 : 0;
    const onlineB = isOnline(b.lastSeenAt, now) ? 1 : 0;
    if (onlineA !== onlineB) return onlineB - onlineA;
    const gap = seen(b) - seen(a);
    if (gap !== 0 && Number.isFinite(gap)) return gap;
    if (seen(a) !== seen(b)) return seen(a) === -Infinity ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** "Online now", "Active 3 h ago", "Active yesterday", or "Not seen yet". */
export function teamPresenceLabel(lastSeenAt: string | null, now: Date): string {
  if (!lastSeenAt || !Number.isFinite(Date.parse(lastSeenAt))) return HOME_TEAM_COPY.never;
  if (isOnline(lastSeenAt, now)) return HOME_TEAM_COPY.online;
  return `Active ${timeAgo(lastSeenAt, now)}`;
}
