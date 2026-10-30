import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadWorkspaceMembers } from '@/lib/tasks-server';
import { PRESENCE_TABLE, presenceDay } from '@/lib/presence';
import { latestSeenByUser, sortTeamPresence, type TeamPresenceMember } from './team-presence';

/** How far back to look. Older than this reads as "Not seen yet". */
const LOOKBACK_DAYS = 120;

/**
 * Everyone else on the viewer's team who has joined, with when each was last in
 * the app (URG-250). Shared by GET /api/home/team (the refresh) and the Home
 * payload (URG-320: Home loads in one request). Never throws: Home must draw
 * even when presence cannot be read, so a failure is an empty list.
 */
export async function loadTeamPresenceMembers(
  adminClient: SupabaseClient,
  user: User,
  workspaceId: string | null,
  now: Date = new Date()
): Promise<TeamPresenceMember[]> {
  if (!workspaceId) return [];
  try {
    const members = (await loadWorkspaceMembers(adminClient, workspaceId, user.id, { withPhotos: true })).filter(
      (member) => member.status === 'active' && member.userId && !member.isCurrentUser
    );
    if (members.length === 0) return [];

    const userIds = Array.from(new Set(members.map((member) => member.userId as string)));
    const since = presenceDay(new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
    const presence = await adminClient
      .from(PRESENCE_TABLE)
      .select('user_id,last_seen_at')
      .in('user_id', userIds)
      .gte('day', since);
    if (presence.error) {
      console.warn('[home/team] could not read presence', { code: presence.error.code, message: presence.error.message });
    }
    const latest = latestSeenByUser(
      Array.isArray(presence.data) ? (presence.data as { user_id: string | null; last_seen_at: string | null }[]) : []
    );

    const seenIds = new Set<string>();
    const shaped: TeamPresenceMember[] = [];
    for (const member of members) {
      const userId = member.userId as string;
      if (seenIds.has(userId)) continue;
      seenIds.add(userId);
      shaped.push({ userId, name: member.name, initials: member.initials, lastSeenAt: latest.get(userId) ?? null });
    }
    return sortTeamPresence(shaped, now);
  } catch (error) {
    console.warn('[home/team] could not load the team', error);
    return [];
  }
}
