import { permanentRedirect } from 'next/navigation';

/**
 * Legacy assistant route (URG-212: the assistant's page moved to
 * /dashboard/urgans alongside its user-facing rename to UrgAns). This
 * route 308-redirects there. Kept because NEXT_PUBLIC_FEATURE_CHAPPI was
 * already live in production when the rename shipped, so real sessions,
 * installed PWAs (manifest start_url), and in-session nav history could
 * all still point at this path.
 */
export default function ChappiRedirect(): never {
  permanentRedirect('/dashboard/urgans');
}
