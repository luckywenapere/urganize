'use client';

type LoadingScreenVariant = 'shell' | 'dashboard' | 'detail' | 'form';

type LoadingScreenProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  variant?: LoadingScreenVariant;
  asPage?: boolean;
};

const shellClassByVariant: Record<LoadingScreenVariant, string> = {
  shell: 'max-w-lg',
  dashboard: 'max-w-[1100px]',
  detail: 'max-w-[1080px]',
  form: 'max-w-3xl',
};

export function LoadingScreen({
  eyebrow = 'Urganize',
  title = 'Preparing your workspace',
  description = 'Loading your release checklist interface.',
  variant = 'shell',
  asPage = true,
}: LoadingScreenProps) {
  const content = (
    <>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[-180px] h-[330px] w-[330px] rounded-full bg-brand/10 blur-[130px]" />
        <div className="absolute bottom-[-220px] right-[10%] h-[370px] w-[370px] rounded-full bg-white/[0.04] blur-[140px]" />
      </div>
      <div className={`relative mx-auto min-h-screen w-full px-4 pb-8 pt-20 sm:px-10 sm:py-10 ${shellClassByVariant[variant]}`}>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center sm:min-h-[calc(100vh-5rem)]">
          <section className="w-full rounded-[30px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">{eyebrow}</p>
                <h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] tracking-tight text-content-primary">{title}</h1>
                <p className="mt-3 text-sm text-content-secondary">{description}</p>
              </div>
              <div
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 flex-col justify-center gap-1.5 rounded-[20px] border border-stroke-subtle bg-bg-elevated/85 p-3"
              >
                <div className="h-2.5 w-full rounded-full skeleton-shimmer" />
                <div className="h-2.5 w-3/4 rounded-full skeleton-shimmer" />
                <div className="h-2.5 w-1/2 rounded-full skeleton-shimmer" />
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-stroke-subtle bg-bg-elevated/80 p-4">
                <div className="h-3 w-24 rounded-full skeleton-shimmer" />
                <div className="mt-4 h-10 rounded-2xl skeleton-shimmer" />
              </div>
              <div className="rounded-2xl border border-stroke-subtle bg-bg-elevated/80 p-4">
                <div className="h-3 w-20 rounded-full skeleton-shimmer" />
                <div className="mt-4 h-10 rounded-2xl skeleton-shimmer" />
              </div>
              <div className="rounded-2xl border border-stroke-subtle bg-bg-elevated/80 p-4">
                <div className="h-3 w-28 rounded-full skeleton-shimmer" />
                <div className="mt-4 h-10 rounded-2xl skeleton-shimmer" />
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
              <div className="h-4 w-40 rounded-full skeleton-shimmer" />
              <div className="mt-4 space-y-3">
                <div className="h-14 rounded-2xl skeleton-shimmer" />
                <div className="h-14 rounded-2xl skeleton-shimmer" />
                <div className="h-14 rounded-2xl skeleton-shimmer" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );

  if (asPage) {
    return <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">{content}</main>;
  }

  return <div className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">{content}</div>;
}
