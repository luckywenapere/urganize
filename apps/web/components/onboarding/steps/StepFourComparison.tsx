'use client';

const STEP_FOUR_COMPARISON_ROWS = [
  {
    without: 'Scattered DMs and spreadsheets',
    with: 'One workspace per release',
  },
  {
    without: 'Chasing credits at the last minute',
    with: 'Credits collected automatically',
  },
  {
    without: "Team confusion about what's next",
    with: 'Everyone sees the same plan',
  },
  {
    without: 'Release chaos every single time',
    with: 'A repeatable process',
  },
] as const;

export function StepFourComparison({
  isSaving,
  onContinue,
}: {
  isSaving: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-1 py-8">
      <div className="w-full max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="saas-eyebrow">Step 4 of 5</p>
          <h1 className="mt-4 text-[clamp(2.4rem,6vw,4.8rem)] tracking-tight text-content-primary">
            Here&apos;s what changes.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-content-secondary sm:text-base">
            The release is real now. This is the difference between holding it together manually and running it with one shared system.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="rounded-[30px] border border-status-error/20 bg-status-error/[0.06] p-5 shadow-[0_24px_80px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error/75">Without</p>
            <div className="mt-5 space-y-3">
              {STEP_FOUR_COMPARISON_ROWS.map((row, index) => (
                <div
                  key={row.without}
                  className="animate-in rounded-[22px] border border-status-error/15 bg-bg-surface/80 px-4 py-4"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <p className="text-sm leading-6 text-[rgba(226,226,226,0.72)]">{row.without}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-brand/20 bg-brand-muted/65 p-5 shadow-[0_24px_80px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">With Urganize</p>
            <div className="mt-5 space-y-3">
              {STEP_FOUR_COMPARISON_ROWS.map((row, index) => (
                <div
                  key={row.with}
                  className="animate-in rounded-[22px] border border-brand/20 bg-bg-surface/85 px-4 py-4"
                  style={{ animationDelay: `${index * 100 + 80}ms` }}
                >
                  <p className="text-sm font-semibold leading-6 text-content-primary">{row.with}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="animate-in mt-6 rounded-[30px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_24px_80px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
          <p className="text-sm font-semibold text-content-primary">
            Artists using Urganize spend 70% less time on release admin.
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                <span>Without</span>
                <span>Admin capacity</span>
              </div>
              <div className="h-3 rounded-full bg-bg-overlay">
                <div className="animate-in h-full w-[32%] rounded-full bg-content-tertiary" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                <span>With Urganize</span>
                <span>More room to ship</span>
              </div>
              <div className="h-3 rounded-full bg-bg-overlay">
                <div className="animate-in h-full w-[88%] rounded-full bg-brand" style={{ animationDelay: '120ms' }} />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onContinue}
            disabled={isSaving}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
          >
            {isSaving ? 'Loading...' : "I'm ready to use this ->"}
          </button>
        </div>
      </div>
    </div>
  );
}
