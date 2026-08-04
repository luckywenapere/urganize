import { redirect } from 'next/navigation';

// The files surface stopped being its own page (2026-08-04) — it now opens as
// an overlay window over the workspace via `?scene=files`. See the metadata
// stub next door for the full rationale; this route only forwards deep links.
export default async function FilesRedirectPage({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  redirect(`/dashboard?release=${releaseId}&scene=files`);
}
