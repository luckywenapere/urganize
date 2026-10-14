import { NextRequest, NextResponse } from 'next/server';
import { loadWorkspaceAccessContext, loadWorkspaceMembers, requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { PRESENCE_TABLE, presenceDay } from '@/lib/presence';
import { latestSeenByUser, sortTeamPresence, type TeamPresenceMember } from '@/lib/home/team-presence';

// Home's "Your team" card (URG-250, 2026-10-15): everyone else on the viewer's
// team who has joined, with when each was last in the app. The viewer is left
// out (they are here now) and so are pending invites (they have never opened
// the team). Only the newest ping time goes out: no device, no day history.
//
// user_presence_days has RLS on with no policies, so it is read here with the
// admin client, scoped to the members of the viewer's own team.
//
// A missing presence table (before its migration) or a read error still
// answers 200 with everyone "not seen yet": the card should never break Home.

export const dynamic = 'force-dynamic';

/** How far back to look. Someone not in the app for longer reads as "Not seen
 *  yet"; the table only holds rows since 2026-10-07 anyway. */
const LOOKBACK_DAYS = 120;

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) return NextResponse.json({ members: [] });

    const members = (await loadWorkspaceMembers(adminClient, access.primaryWorkspaceId, auth.user.id)).filter(
      (member) => member.status === 'active' && member.userId && !member.isCurrentUser
    );
    if (members.length === 0) return NextResponse.json({ members: [] });

    const userIds = Array.from(new Set(members.map((member) => member.userId as string)));
    const since = presenceDay(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
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
      shaped.push({
        userId,
        name: member.name,
        initials: member.initials,
        lastSeenAt: latest.get(userId) ?? null,
      });
    }

    return NextResponse.json({ members: sortTeamPresence(shaped, new Date()) });
  } catch (error) {
    console.error('[home/team] request failed:', error);
    return NextResponse.json({ error: 'Could not load your team.' }, { status: 500 });
  }
}
