import { redirect } from 'next/navigation';

// The metadata hub stopped being its own page (2026-08-04, founder call: the
// release scenes should "open in a window just like the activity lists open,
// not a whole separate page, where the top menu vanishes and the load is so
// strenuous"). It now renders as an overlay window over the workspace, driven
// by `?scene=metadata` — see components/releases/ReleaseSceneOverlay.tsx.
//
// This route survives only to forward deep links (a bookmark, a stale share).
// Same 307-not-308 reasoning as the release-detail stub one directory up: a
// non-permanent redirect stays easy to retarget without browsers caching the
// old mapping indefinitely.
export default async function MetadataRedirectPage({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  redirect(`/dashboard?release=${releaseId}&scene=metadata`);
}
