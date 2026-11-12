import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { SettingsDeskSkeleton } from '@/components/settings/desk/SettingsDesk';

// Route-segment fallback in the page's own shape, so the handoff is invisible.
export default function TrashLoading() {
  return (
    <>
    {/* Computer: the settings menu and the table (#1226). */}
    <div className="hidden lg:block">
      <SettingsDeskSkeleton rows={4} />
    </div>
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-16 lg:hidden" aria-busy="true">
      <SkeletonBlock className="h-5 w-16" />
      <SkeletonBlock className="h-16 w-full" />
      {[0, 1, 2].map((index) => (
        <SkeletonBlock key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
    </>
  );
}
