import { SettingsPageSkeleton } from '@/components/loading/SettingsPageSkeleton';

/**
 * Route-segment Suspense fallback for /settings — same rationale as
 * /dashboard's: without it this route fell back to the root brand mark and
 * then swapped to this skeleton, showing two loading states for one
 * navigation.
 *
 * The account-shape props are left at their defaults here on purpose: the
 * role isn't known until the auth store hydrates, and guessing wrong would
 * reserve sections that never appear. SettingsPageClient renders the same
 * skeleton WITH the role once it knows it.
 */
export default function SettingsLoading() {
  return <SettingsPageSkeleton />;
}
