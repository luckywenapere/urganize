'use client';

type SubmissionSuccessStateProps = {
  releaseTitle: string;
  artistName?: string;
};

export function SubmissionSuccessState({ releaseTitle, artistName = '' }: SubmissionSuccessStateProps) {
  const releaseSummary = [releaseTitle, artistName].filter(Boolean).join(' • ');

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-status-success/18 bg-bg-surface/95 p-6 shadow-[0_20px_52px_-30px_rgba(0,0,0,0.35)] sm:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-status-success/8 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-status-success/40 to-transparent" />

      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-status-success/30 bg-status-success/10 text-2xl text-status-success">
        ✓
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-status-success">Credits submitted</p>
      <h2 className="mt-3 text-[clamp(2rem,5vw,2.6rem)] tracking-tight text-content-primary">Credits submitted</h2>
      <p className="mt-3 text-sm leading-6 text-content-secondary">
        Your information has been added to the release
      </p>
      <p className="mt-2 text-sm text-content-tertiary">You can close this page.</p>

      {releaseSummary ? (
        <div className="mt-6 rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Saved to release</p>
          <p className="mt-2 text-sm font-semibold text-content-primary">{releaseSummary}</p>
        </div>
      ) : null}
    </div>
  );
}
