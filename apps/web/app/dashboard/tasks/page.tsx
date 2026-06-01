import { permanentRedirect } from 'next/navigation';

/**
 * Legacy tasks route. The consolidated workspace at /dashboard now owns the
 * tasks panel (Priority + Status filters, 5 buckets, click-to-scope on a
 * release). This route 308-redirects to /dashboard.
 */
export default function TasksRedirect(): never {
  permanentRedirect('/dashboard');
}
