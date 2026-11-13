import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { countTeamSeats } from '@/lib/seats-server';
import { countWorkspaceArtists } from '@/lib/artists-server';
import { countActiveReleases } from '@/lib/release-cap-server';
import { isOnboardingPersona } from '@/lib/onboarding';

// GET /api/billing/wall-summary: the three numbers the billing wall shows, so a team
// deciding whether to pay is told what is already theirs ("12 rollouts, 111
// activities and 4 teammates").
//
// OPEN route (getAuthenticatedUser, not the gate), like /api/billing/track: by
// definition the caller is walled, so a gated route would be unreachable. The team is
// resolved from the signed-in user and never from the request, so nobody can ask
// about a team they do not belong to. Counts only, never names or titles.
//
// It also sends what the wall needs to pick the ONE plan it shows (#1258): how
// many artists, people and rollouts in progress the team has, and who the
// signed-in person said they are at sign-up.
//
// Every count fails to null on its own, and the wall then says nothing rather than
// guessing, so a database blip costs a sentence and never the page.

async function count(run: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count: value, error } = await run();
    return error ? null : (value ?? 0);
  } catch {
    return null;
  }
}

async function readPersona(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string
): Promise<string | null> {
  try {
    const { data, error } = await admin.from('profiles').select('onboarding_persona').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const value = (data as { onboarding_persona?: unknown }).onboarding_persona;
    return isOnboardingPersona(value) ? value : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isHardPaywallEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const empty = { rollouts: null, activities: null, teammates: null, artists: null, seats: null, activeReleases: null, persona: null };
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json(empty);

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId || !team.ownerUserId) return NextResponse.json(empty);

  const ownerUserId = team.ownerUserId;
  const [rollouts, activities, seats, artists, activeReleases, persona] = await Promise.all([
    count(() =>
      admin
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', team.ownerUserId as string)
        .is('deleted_at', null)
    ),
    count(() =>
      admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', team.primaryWorkspaceId as string)
    ),
    countTeamSeats(admin, team.primaryWorkspaceId),
    countWorkspaceArtists(admin, team.primaryWorkspaceId),
    countActiveReleases(admin, ownerUserId),
    readPersona(admin, auth.user.id),
  ]);

  return NextResponse.json({
    rollouts,
    activities,
    // Seats include the owner; a "teammate" is everyone else.
    teammates: seats === null ? null : Math.max(0, seats - 1),
    artists,
    seats,
    activeReleases,
    persona,
  });
}
