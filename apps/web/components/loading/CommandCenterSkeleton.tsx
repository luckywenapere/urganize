'use client';

import { SectionCard } from '@/components/shared/SectionCard';

type BlockProps = {
  className?: string;
};

function Block({ className = '' }: BlockProps) {
  return <div className={`skeleton-shimmer rounded-2xl bg-bg-elevated/90 ${className}`} />;
}

function HeaderSkeleton() {
  return (
    <SectionCard className="sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Block className="h-4 w-40 rounded-full" />
          <Block className="mt-3 h-12 w-full max-w-[28rem] rounded-[22px]" />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
              <Block className="h-3 w-16 rounded-full" />
              <Block className="mt-3 h-6 w-32 rounded-xl" />
            </div>
            <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
              <Block className="h-3 w-24 rounded-full" />
              <Block className="mt-3 h-6 w-36 rounded-xl" />
            </div>
          </div>
        </div>

        <div className="w-full shrink-0 rounded-[24px] border border-stroke-subtle bg-bg-elevated/65 p-4 lg:w-[240px]">
          <Block className="h-3 w-14 rounded-full" />
          <div className="mt-3 flex flex-col gap-3">
            <Block className="h-11 w-full rounded-2xl" />
            <Block className="h-11 w-full rounded-2xl" />
            <Block className="h-11 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function ReleaseProgressSkeleton() {
  return (
    <SectionCard className="sm:p-7">
      <div className="space-y-6">
        <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Block className="h-5 w-36 rounded-full" />
              <Block className="mt-3 h-4 w-full max-w-[21rem] rounded-full" />
            </div>
            <Block className="h-7 w-28 rounded-full" />
          </div>

          <div className="mt-6">
            <Block className="h-20 w-32 rounded-[28px]" />
            <Block className="mt-3 h-4 w-44 rounded-full" />
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Block className="h-3 w-16 rounded-full" />
              <Block className="h-3 w-24 rounded-full" />
            </div>
            <Block className="h-3.5 w-full rounded-full" />
          </div>
        </div>

        <div className="space-y-3.5">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="rounded-[24px] border border-stroke-default bg-bg-surface px-4 py-4 sm:px-5 sm:py-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                  <Block className="h-11 w-11 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Block className="h-5 w-40 rounded-full" />
                      {item === 2 ? <Block className="h-7 w-20 rounded-full" /> : null}
                    </div>
                    <Block className="mt-3 h-4 w-full rounded-full" />
                    <Block className="mt-2 h-4 w-3/4 rounded-full" />
                  </div>
                </div>
                <Block className="h-7 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function CollectCreditsSkeleton() {
  return (
    <SectionCard className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <Block className="h-7 w-36 rounded-[18px]" />
          <Block className="mt-3 h-4 w-full rounded-full" />
          <Block className="mt-2 h-3 w-40 rounded-full" />
        </div>
        <Block className="h-7 w-24 rounded-full" />
      </div>

      <div className="mt-4 rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3">
        <Block className="h-3 w-32 rounded-full" />
        <Block className="mt-3 h-4 w-full rounded-full" />
        <Block className="mt-2 h-4 w-5/6 rounded-full" />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Block className="h-11 flex-1 rounded-2xl" />
        <Block className="h-11 sm:w-32 rounded-2xl" />
      </div>

      <Block className="mt-4 h-4 w-32 rounded-full" />
    </SectionCard>
  );
}

function NextStepSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-brand/20 bg-brand-muted/35 p-5 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.36)] sm:p-6">
      <div className="flex h-full flex-col justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Block className="h-9 w-9 rounded-full" />
            <div className="min-w-0 flex-1">
              <Block className="h-4 w-20 rounded-full" />
              <Block className="mt-2 h-3 w-28 rounded-full" />
            </div>
          </div>

          <div className="mt-5">
            <Block className="h-7 w-28 rounded-full" />
          </div>

          <Block className="mt-4 h-12 w-full rounded-[24px]" />
          <Block className="mt-3 h-4 w-full rounded-full" />
          <Block className="mt-2 h-4 w-4/5 rounded-full" />
        </div>

        <div className="rounded-[24px] border border-stroke-subtle bg-bg-surface/88 p-4">
          <Block className="h-3 w-32 rounded-full" />
          <Block className="mt-4 h-11 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function CollaboratorsSkeleton() {
  return (
    <SectionCard className="sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Block className="h-5 w-28 rounded-full" />
          <Block className="mt-3 h-4 w-full max-w-[24rem] rounded-full" />
        </div>
        <Block className="h-11 w-full rounded-2xl sm:w-36" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Block className="h-7 w-28 rounded-full" />
        <Block className="h-7 w-24 rounded-full" />
        <Block className="h-7 w-20 rounded-full" />
      </div>

      <div className="mt-5 hidden md:block">
        <div className="overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface/95">
          <div className="grid grid-cols-[1.3fr_0.85fr_1.15fr_0.9fr_1fr] gap-4 border-b border-stroke-default bg-bg-elevated/80 px-5 py-3">
            {['Collaborator', 'Role', 'Contact', 'Status', 'Actions'].map((label) => (
              <Block key={label} className="h-3 w-20 rounded-full" />
            ))}
          </div>
          {[1, 2, 3].map((row) => (
            <div
              key={row}
              className="grid grid-cols-[1.3fr_0.85fr_1.15fr_0.9fr_1fr] gap-4 border-b border-stroke-default px-5 py-4 last:border-b-0"
            >
              <Block className="h-5 w-32 rounded-full" />
              <Block className="h-4 w-20 rounded-full" />
              <Block className="h-4 w-full rounded-full" />
              <div className="space-y-2">
                <Block className="h-7 w-20 rounded-full" />
                <Block className="h-3 w-24 rounded-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Block className="h-9 w-20 rounded-full" />
                <Block className="h-9 w-16 rounded-full" />
                {row === 2 ? <Block className="h-9 w-14 rounded-full" /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3 md:hidden">
        {[1, 2].map((card) => (
          <div
            key={card}
            className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/70 p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.3)]"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Block className="h-5 w-32 rounded-full" />
                  <Block className="mt-3 h-3 w-20 rounded-full" />
                </div>
                <Block className="h-7 w-24 rounded-full" />
              </div>

              <div className="grid gap-3">
                <div className="rounded-[18px] border border-stroke-default bg-bg-surface/90 px-4 py-3">
                  <Block className="h-3 w-10 rounded-full" />
                  <Block className="mt-3 h-4 w-28 rounded-full" />
                </div>
                <div className="rounded-[18px] border border-stroke-default bg-bg-surface/90 px-4 py-3">
                  <Block className="h-3 w-16 rounded-full" />
                  <Block className="mt-3 h-4 w-full rounded-full" />
                </div>
              </div>

              <div className="rounded-[18px] border border-stroke-subtle bg-bg-surface/70 px-4 py-3">
                <Block className="h-3 w-20 rounded-full" />
                <Block className="mt-3 h-4 w-28 rounded-full" />
              </div>
            </div>

            <div className="mt-4 grid gap-2.5">
              <Block className="h-11 w-full rounded-2xl" />
              <Block className="h-11 w-full rounded-2xl" />
              {card === 2 ? <Block className="h-11 w-full rounded-2xl" /> : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function MetadataSkeleton() {
  return (
    <SectionCard className="sm:p-7">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Block className="h-5 w-24 rounded-full" />
            <Block className="mt-3 h-4 w-full rounded-full" />
          </div>
          <Block className="h-11 w-full rounded-2xl sm:w-36 sm:rounded-full" />
        </div>

        <div className="space-y-3">
          {[1, 2, 3].map((group) => (
            <div
              key={group}
              className="flex items-center justify-between gap-3 rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4"
            >
              <Block className="h-4 w-28 rounded-full" />
              <Block className="h-8 w-10 rounded-full" />
            </div>
          ))}
          <div className="rounded-[20px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <Block className="h-3 w-20 rounded-full" />
            <Block className="mt-3 h-8 w-14 rounded-[18px]" />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function CommandCenterSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Block className="h-4 w-28 rounded-full" />
        </div>

        <div className="space-y-7">
          <HeaderSkeleton />

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
            <div className="contents lg:block lg:min-w-0 lg:space-y-7">
              <div className="order-1 min-w-0">
                <ReleaseProgressSkeleton />
              </div>
              <div className="order-4 min-w-0">
                <CollaboratorsSkeleton />
              </div>
            </div>

            <div className="contents lg:block lg:min-w-0 lg:space-y-4">
              <div className="order-2 min-w-0">
                <CollectCreditsSkeleton />
              </div>
              <div className="order-3 min-w-0">
                <NextStepSkeleton />
              </div>
              <div className="order-5 min-w-0">
                <MetadataSkeleton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
