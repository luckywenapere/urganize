import { redirect } from 'next/navigation';

// Audience left the nav in the Oct 16, 2026 cuts (URG-319): it was a pill that
// only said "Coming soon". An old link or bookmark lands on Home.
export default function AudiencePage() {
  redirect('/dashboard');
}
