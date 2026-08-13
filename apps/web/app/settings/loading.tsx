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
 *
 * The `tab` prop is defaulted for a harder reason (2026-08-13): a server
 * component cannot read search params, so this fallback cannot know which tab
 * `?tab=` names and always reserves Account. A deep link to another tab shows
 * the account-shaped skeleton for one paint before SettingsPageClient — which
 * DOES know the tab, since it comes from the URL rather than the user — renders
 * the right shape. Same acceptable-guess trade-off as the role props.
 */
export default function SettingsLoading() {
  return <SettingsPageSkeleton />;
}
