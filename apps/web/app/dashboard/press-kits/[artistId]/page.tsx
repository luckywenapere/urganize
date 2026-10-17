import { redirect } from 'next/navigation';

// Hidden Oct 17, 2026 (founder approved "cuts-3"): the bio and contact are
// edited in a rollout's Pitch this!. next.config.js redirects first; this is
// the fallback. PressKitPageClient is kept, unlinked.
export default async function PressKitPage({ params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  redirect(`/dashboard/artists/${encodeURIComponent(artistId)}`);
}
