import { redirect } from 'next/navigation';

// The press kit manager stopped being its own page (2026-08-04) — it now opens
// as an overlay window over the workspace via `?scene=epk`. See the metadata
// stub next door for the full rationale; this route only forwards deep links.
//
// NOTE: this is the OWNER-FACING management surface. The public kit itself
// still lives at its own standalone route (/epk/[token]) and is untouched.
export default async function EpkRedirectPage({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  redirect(`/dashboard?release=${releaseId}&scene=epk`);
}
