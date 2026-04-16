'use client';

type Step8TaskDoneProps = {
  isBusy: boolean;
  onLogout: () => Promise<void>;
  onMarkDone: () => Promise<void>;
  onDropFeedback: () => Promise<void>;
  onGoToDashboard: () => void;
};

export function Step8TaskDone({
  isBusy,
  onLogout,
  onMarkDone,
  onDropFeedback,
  onGoToDashboard,
}: Step8TaskDoneProps) {
  return (
    <div className="mx-auto mt-[16vh] w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl sm:p-8">
      <button type="button" disabled={isBusy} onClick={onMarkDone} className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)] text-content-primary disabled:opacity-40">
        <span className="inline-block h-12 w-12 rounded-md border border-stroke-default bg-bg-elevated sm:h-14 sm:w-14" />
        <span>Mark Done</span>
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={onDropFeedback}
        className="mt-8 rounded-xl border border-brand/30 bg-brand/15 px-5 py-3 text-base font-semibold text-content-primary transition hover:bg-brand/25 disabled:opacity-40"
      >
        Drop Feedback
      </button>
      <button
        type="button"
        onClick={onGoToDashboard}
        className="mt-8 rounded-xl border border-stroke-default bg-bg-elevated px-4 py-2 text-sm font-medium text-content-primary transition hover:bg-bg-hover"
      >
        Go to Dashboard
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={onLogout}
        className="mt-4 text-sm text-content-secondary transition hover:text-content-primary disabled:opacity-40"
      >
        Logout
      </button>
    </div>
  );
}
