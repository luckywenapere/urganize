import { NextRequest, NextResponse } from 'next/server';
import { flagOffResponse, isPitchingFeatureEnabled, requireCuratorUser } from '../_shared';

// A playlist owner asking for the team product too.
//
// Curator-ness is a capability (a curator_profiles row), so nothing here grants
// or removes it — this only clears the 'curator' marker off profiles.role, which
// is what the three team-side chokepoints read to keep a curator-ONLY account
// out of the workspace. Afterwards the account is an ordinary un-onboarded team
// account: its workspace is provisioned lazily on the first workspace-aware
// request, and the payment gate applies to it like anyone else's.
//
// This lives in a route rather than the client updating its own profiles row, so
// the loose "users can update own profile" policy can be column-restricted later
// without breaking activation.

const DEFAULT_TEAM_ROLE = 'artist-manager';

export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  // Conditional on role='curator', which makes this idempotent and stops a
  // dual account's real team role being overwritten by a second tap.
  const { error } = await auth.adminClient
    .from('profiles')
    .update({ role: DEFAULT_TEAM_ROLE })
    .eq('id', auth.user.id)
    .eq('role', 'curator');

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not set up your team.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
