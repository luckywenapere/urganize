import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isPitchKitEnabled } from '@/lib/release-epk-server';
import { publishReleaseKit } from '@/lib/release-kit-publish-server';

/**
 * POST: "Copy kit link" in a rollout's Pitch this! scene. Makes the artist's
 * kit if there is none, publishes it if it is not live (never re-publishes a
 * live one), and answers the link for this rollout: /k/{slug}?r={releaseId}.
 * See lib/release-kit-publish-server.ts for the rules.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isPitchKitEnabled() || process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const result = await publishReleaseKit(admin, releaseId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  return NextResponse.json({ path: result.path, slug: result.slug, published: result.published });
}
