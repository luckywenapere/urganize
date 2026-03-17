'use client';

import { CollaboratorTableSkeleton } from './CollaboratorTableSkeleton';
import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

function ReleaseHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-3 w-40 rounded-full" />
          <SkeletonBlock className="h-7 w-24 rounded-full" />
        </div>

        <SkeletonBlock className="mt-3 h-[clamp(3.1rem,7vw,4.4rem)] w-[min(34rem,88%)] rounded-[22px]" />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <SkeletonBlock className="h-3 w-12 rounded-full" />
            <SkeletonBlock className="mt-3 h-5 w-28 rounded-full" />
          </div>
          <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <SkeletonBlock className="mt-3 h-5 w-32 rounded-full" />
          </div>
        </div>
      </div>

      <div className="w-full shrink-0 rounded-[24px] border border-stroke-subtle bg-bg-elevated/65 p-4 lg:w-[240px]">
        <SkeletonBlock className="h-3 w-16 rounded-full" />
        <div className="mt-3 flex flex-col gap-3">
          <div className="min-h-11 w-full rounded-2xl bg-brand px-5 py-3">
            <div className="flex h-full items-center justify-center">
              <div className="h-3 w-28 rounded-full bg-white/20" />
            </div>
          </div>
          <div className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3">
            <div className="flex h-full items-center justify-center">
              <SkeletonBlock className="h-3 w-24 rounded-full" />
            </div>
          </div>
          <div className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3">
            <div className="flex h-full items-center justify-center">
              <SkeletonBlock className="h-3 w-24 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseProgressCardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className="mt-3 h-4 w-60 rounded-full" />
            </div>
            <SkeletonBlock className="h-7 w-28 rounded-full" />
          </div>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SkeletonBlock className="h-[4.25rem] w-28 rounded-[22px] sm:h-[5rem] sm:w-32" />
              <SkeletonBlock className="mt-3 h-4 w-48 rounded-full" />
            </div>

            <div className="rounded-[22px] border border-stroke-default bg-bg-surface/90 px-4 py-4 sm:min-w-[220px]">
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="mt-3 h-4 w-40 rounded-full" />
              <SkeletonBlock className="mt-2 h-4 w-32 rounded-full" />
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-3 w-16 rounded-full" />
              <SkeletonBlock className="h-3 w-24 rounded-full" />
            </div>
            <div className="h-3.5 rounded-full bg-bg-overlay">
              <div className="h-full w-[56%] rounded-full bg-brand/65" />
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-stroke-subtle bg-bg-surface/90 p-5 sm:p-6">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <SkeletonBlock className="mt-4 h-6 w-36 rounded-[16px]" />
          <SkeletonBlock className="mt-4 h-4 w-44 rounded-full" />
          <SkeletonBlock className="mt-2 h-4 w-36 rounded-full" />
          <div className="mt-5 rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <SkeletonBlock className="h-3 w-16 rounded-full" />
            <div className="mt-3 flex items-center gap-2">
              <SkeletonBlock className="h-7 w-24 rounded-full" />
              <SkeletonBlock className="h-7 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3.5">
        {[
          { highlight: false, titleWidth: 'w-36', detailWidth: 'w-56' },
          { highlight: true, titleWidth: 'w-40', detailWidth: 'w-60' },
          { highlight: false, titleWidth: 'w-32', detailWidth: 'w-52' },
          { highlight: false, titleWidth: 'w-44', detailWidth: 'w-48' },
        ].map((item, index) => (
          <div
            key={`check-${index}`}
            className={`rounded-[24px] border px-4 py-4 transition sm:px-5 sm:py-5 ${
              item.highlight
                ? 'border-status-warning/30 bg-status-warning/10 ring-1 ring-status-warning/20 shadow-[0_20px_42px_-32px_rgba(0,0,0,0.34)]'
                : 'border-stroke-default bg-bg-surface'
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                    item.highlight
                      ? 'border-status-warning/35 bg-status-warning/10'
                      : 'border-stroke-default bg-bg-elevated'
                  }`}
                >
                  <SkeletonBlock className="h-3 w-4 rounded-full" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SkeletonBlock className={`h-4 ${item.titleWidth} rounded-full`} />
                    {item.highlight ? <SkeletonBlock className="h-7 w-20 rounded-full" /> : null}
                  </div>
                  <SkeletonBlock className={`mt-3 h-4 ${item.detailWidth} rounded-full`} />
                </div>
              </div>

              <SkeletonBlock className="h-7 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NextStepCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-brand/20 bg-brand-muted/35 p-5 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.36)] sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-brand/8 blur-3xl" />

      <div className="flex min-h-[356px] flex-col justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <div>
              <SkeletonBlock className="h-4 w-20 rounded-full" />
              <SkeletonBlock className="mt-2 h-3 w-24 rounded-full" />
            </div>
          </div>

          <div className="mt-5">
            <SkeletonBlock className="h-7 w-28 rounded-full" />
          </div>

          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-8 w-[min(20rem,85%)] rounded-[18px]" />
            <SkeletonBlock className="h-8 w-[min(18rem,76%)] rounded-[18px]" />
          </div>

          <div className="mt-4 space-y-2">
            <SkeletonBlock className="h-4 w-[min(19rem,82%)] rounded-full" />
            <SkeletonBlock className="h-4 w-[min(15rem,64%)] rounded-full" />
          </div>
        </div>

        <div className="rounded-[24px] border border-stroke-subtle bg-bg-surface/88 p-4">
          <SkeletonBlock className="h-3 w-32 rounded-full" />
          <SkeletonBlock className="mt-4 h-[3.25rem] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function CollaboratorSectionSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <SkeletonBlock className="h-4 w-28 rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-64 rounded-full" />
        </div>
        <SkeletonBlock className="h-11 w-full rounded-[18px] sm:w-40" />
      </div>

      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-7 w-20 rounded-full" />
        <SkeletonBlock className="h-7 w-24 rounded-full" />
        <SkeletonBlock className="h-7 w-20 rounded-full" />
      </div>

      <CollaboratorTableSkeleton rows={4} />
    </div>
  );
}

function MetadataPreviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <SkeletonBlock className="h-4 w-20 rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-60 rounded-full" />
        </div>
        <SkeletonBlock className="h-11 w-full rounded-[18px] sm:w-36 sm:rounded-full" />
      </div>

      <div className="space-y-3">
        {[
          { label: 'w-28', count: 'w-10' },
          { label: 'w-32', count: 'w-10' },
          { label: 'w-24', count: 'w-10' },
        ].map((group, index) => (
          <div
            key={`metadata-group-${index}`}
            className="flex items-center justify-between gap-3 rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4"
          >
            <SkeletonBlock className={`h-4 ${group.label} rounded-full`} />
            <SkeletonBlock className={`h-7 ${group.count} rounded-full`} />
          </div>
        ))}

        <div className="rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
          <SkeletonBlock className="h-3 w-20 rounded-full" />
          <SkeletonBlock className="mt-3 h-8 w-14 rounded-[16px]" />
        </div>
      </div>
    </div>
  );
}

export function CommandCenterSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <SkeletonBlock className="h-4 w-28 rounded-full" />
        </div>

        <div className="space-y-7">
          <SectionCardSkeleton className="sm:p-7">
            <ReleaseHeaderSkeleton />
          </SectionCardSkeleton>

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1.08fr)_380px] lg:items-start">
            <SectionCardSkeleton className="order-1 min-h-[900px] sm:p-7 lg:min-h-[860px]">
              <ReleaseProgressCardSkeleton />
            </SectionCardSkeleton>

            <div className="order-2 lg:sticky lg:top-24">
              <NextStepCardSkeleton />
            </div>

            <SectionCardSkeleton className="order-3 min-h-[620px] sm:p-7 lg:min-h-[520px]">
              <CollaboratorSectionSkeleton />
            </SectionCardSkeleton>

            <SectionCardSkeleton className="order-4 min-h-[360px] sm:p-7 lg:min-h-[320px]">
              <MetadataPreviewSkeleton />
            </SectionCardSkeleton>
          </div>
        </div>
      </div>
    </main>
  );
}
