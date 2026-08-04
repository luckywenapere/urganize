import { redirect } from 'next/navigation';

// Legacy short link. Redirects straight to the workspace scoped view
// (2026-08-04) rather than through /dashboard/releases/[releaseId], which
// now just redirects here anyway — skip the extra hop.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard?release=${id}`);
}
