import { permanentRedirect } from 'next/navigation';

/**
 * Legacy releases-list route. The consolidated workspace at /dashboard now
 * owns the releases column, so this route 308-redirects to /dashboard.
 * Detail pages under /dashboard/releases/[releaseId] are unaffected.
 */
export default function ReleasesListRedirect(): never {
  permanentRedirect('/dashboard');
}
