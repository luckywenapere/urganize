import { redirect } from 'next/navigation';

// Hidden Oct 17, 2026 (founder approved "cuts-3"). next.config.js redirects
// first; this is the fallback. PressKitsPageClient is kept, unlinked.
export default function PressKitsPage() {
  redirect('/dashboard');
}
