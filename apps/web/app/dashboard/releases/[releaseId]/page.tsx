import { redirect } from 'next/navigation';

// The release detail page was removed (2026-08-04, founder call): its
// Activities list, Motion progress, its two AI actions, and the one-time
// NewReleaseGuide all moved into the workspace's scoped view (WorkspaceView +
// TasksPanel) — the surface users actually land on. This route now just
// forwards a deep link (a bookmark, a stale share, an old notification) to its
// replacement. `?new=1` is forwarded so the getting-started guide still fires
// for links minted before this change.
//
// Neither AI action is a button any more, so do not go looking for them in the
// workspace either: "Tailor plan" was deleted 2026-08-10 (it applied model
// output straight onto real task rows while its own copy promised a confirm
// step that did not exist) and replaced by the UrgAns planner's draft-then-
// approve scene; "Generate status update" was removed 2026-09-07 and is asked
// for in the UrgAns conversation, as the release recap was hours later.
//
// A plain 307 (not permanentRedirect's 308) — deliberate: this is a big
// restructure, and a non-permanent redirect stays easy to walk back or
// retarget without browsers caching the old mapping indefinitely.
export default async function ReleaseDetailRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ releaseId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { releaseId } = await params;
  const { new: isNew } = await searchParams;
  redirect(`/dashboard?release=${releaseId}${isNew === '1' ? '&new=1' : ''}`);
}
