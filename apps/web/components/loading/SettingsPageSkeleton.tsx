'use client';

import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

function SettingsFieldSkeleton({ short = false }: { short?: boolean }) {
  return (
    <div className="space-y-2">
      <SkeletonBlock className="h-3 w-24 rounded-full" />
      <SkeletonBlock className={`h-10 ${short ? 'w-36' : 'w-full'} rounded-lg`} />
    </div>
  );
}

function SettingsPanelSkeleton({
  titleWidth = 'w-24',
  rows = 3,
  buttonWidth = 'w-28',
}: {
  titleWidth?: string;
  rows?: number;
  buttonWidth?: string;
}) {
  return (
    <SectionCardSkeleton className="rounded-3xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:p-6">
      <SkeletonBlock className={`mb-4 h-7 ${titleWidth} rounded-full`} />
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, index) => (
          <SettingsFieldSkeleton key={`settings-field-${titleWidth}-${index}`} />
        ))}
        <SkeletonBlock className={`h-10 ${buttonWidth} rounded-lg`} />
      </div>
    </SectionCardSkeleton>
  );
}

export function SettingsTeamMembersSectionSkeleton() {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`team-member-skeleton-${index}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2"
        >
          <div>
            <SkeletonBlock className="h-4 w-28 rounded-full" />
            <SkeletonBlock className="mt-2 h-3 w-36 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-24 rounded-md" />
            <SkeletonBlock className="h-4 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      {/* Mirror the live SettingsPage layout exactly so the skeleton-to-real
          swap has zero width / position jitter:
            - Outer: pb-24 pt-6 sm:px-6 (width inherited from AppShell's
              mx-auto max-w-[1440px] — the single page-width source of truth)
            - Inner: mx-auto max-w-[960px] for form-column readability */}
      <div className="relative pb-24 pt-6 sm:px-6">
        <div className="pointer-events-none absolute -right-16 -top-12 h-52 w-52 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-status-info/12 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[960px]">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <SkeletonBlock className="h-12 w-40 rounded-[18px]" />
            <SkeletonBlock className="mt-3 h-3 w-64 rounded-full" />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <SkeletonBlock className="h-11 w-full rounded-full sm:w-36" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SettingsPanelSkeleton titleWidth="w-20" rows={2} buttonWidth="w-28" />
          <SettingsPanelSkeleton titleWidth="w-24" rows={2} buttonWidth="w-32" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCardSkeleton className="rounded-3xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:p-6">
            <SkeletonBlock className="mb-4 h-7 w-32 rounded-full" />
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={`notification-skeleton-${index}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-3"
                >
                  <SkeletonBlock className="h-4 w-40 rounded-full" />
                  <SkeletonBlock className="h-6 w-10 rounded-full" />
                </div>
              ))}
              <SkeletonBlock className="h-10 w-40 rounded-lg" />
            </div>
          </SectionCardSkeleton>

          <SectionCardSkeleton className="rounded-3xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:p-6">
            <SkeletonBlock className="mb-4 h-7 w-28 rounded-full" />
            <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
              <SkeletonBlock className="h-4 w-52 rounded-full" />
              <SkeletonBlock className="mt-4 h-10 w-28 rounded-full" />
            </div>
          </SectionCardSkeleton>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SettingsPanelSkeleton titleWidth="w-28" rows={2} buttonWidth="w-32" />

          <SectionCardSkeleton className="rounded-3xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:p-6">
            <SkeletonBlock className="mb-4 h-7 w-24 rounded-full" />
            <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
              <SkeletonBlock className="h-4 w-44 rounded-full" />
              <SkeletonBlock className="mt-4 h-10 w-24 rounded-lg" />
            </div>
          </SectionCardSkeleton>
        </div>

        <SectionCardSkeleton className="mt-6 rounded-3xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:p-6">
          <SkeletonBlock className="mb-4 h-7 w-36 rounded-full" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <SkeletonBlock className="h-10 w-full rounded-lg sm:col-span-2" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
          </div>
          <SettingsTeamMembersSectionSkeleton />
        </SectionCardSkeleton>

        <SettingsPanelSkeleton titleWidth="w-20" rows={3} buttonWidth="w-40" />

        <SectionCardSkeleton className="mt-6 rounded-3xl border-status-error/35 bg-status-error/10 p-6 shadow-none">
          <SkeletonBlock className="h-7 w-32 rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-[min(28rem,100%)] rounded-full" />
          <div className="mt-4 space-y-4">
            <SettingsFieldSkeleton />
            <SkeletonBlock className="h-10 w-40 rounded-lg" />
          </div>
        </SectionCardSkeleton>
        </div>
      </div>
    </main>
  );
}
