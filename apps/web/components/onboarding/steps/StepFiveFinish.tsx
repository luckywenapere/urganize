'use client';

export function StepFiveFinish({
  isSaving,
  onFinish,
}: {
  isSaving: boolean;
  onFinish: () => Promise<void>;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-1 py-8">
      <div className="w-full max-w-5xl">
        <div className="rounded-[34px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.82*var(--shadow-alpha-scale)))] sm:p-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Your workspace is ready.
            </span>
          </div>

          <div className="mt-8 flex flex-col items-center">
            <p className="text-[clamp(1.5rem,4vw,2.4rem)] font-medium tracking-tight text-content-primary">
              Unlock your full potential
            </p>
            <p className="mt-4 max-w-lg text-center text-lg text-content-secondary">
              You have full access to all Urganize Pro features. Start managing your releases with structured workflows and collaboration tools today.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void onFinish();
            }}
            disabled={isSaving}
            className="mt-10 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
          >
            {isSaving ? 'Finishing setup...' : 'Go to Dashboard ->'}
          </button>
        </div>
      </div>
    </div>
  );
}
