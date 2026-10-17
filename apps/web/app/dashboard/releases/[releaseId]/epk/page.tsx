import { redirect } from 'next/navigation';
import { isEpkFeatureEnabled } from '@/lib/epk-server';
import { releaseHref } from '@/lib/artist-page';

// The release-scoped press kit is retired (2026-09-05). It was a scene on the
// workspace (`?scene=epk`), and before that its own page, so a manager's
// bookmark or a stale in-app link can still point here.
//
// Hidden outright on 2026-10-17 (founder call): with NEXT_PUBLIC_FEATURE_EPK
// off (forced in lib/cut-features.json) an old link lands on the rollout it
// was for, where Pitch this! holds the merged kit. Nothing is deleted; the
// release_epks rows stay.
//
// With the flag on it forwards to the standing press kits list as before.
//
// This is the OWNER-facing stub. The public link lives at /epk/[token].
type PageProps = { params: Promise<{ releaseId: string }> };

export default async function EpkRedirectPage({ params }: PageProps) {
  const { releaseId } = await params;
  if (!isEpkFeatureEnabled()) redirect(releaseHref(releaseId));
  redirect('/dashboard/press-kits');
}
