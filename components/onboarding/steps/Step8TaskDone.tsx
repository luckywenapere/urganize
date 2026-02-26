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
    <div className="mx-auto mt-[20vh] w-full max-w-[700px]">
      <button
        type="button"
        onClick={onLogout}
        className="absolute right-6 top-8 text-[clamp(2rem,4vw,3rem)]"
      >
        Logout
      </button>
      <button type="button" disabled={isBusy} onClick={onMarkDone} className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)] disabled:opacity-40">
        <span className="inline-block h-12 w-12 border border-white/35 sm:h-14 sm:w-14" />
        <span>Mark Done</span>
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={onDropFeedback}
        className="mt-8 rounded-xl border border-emerald-400/35 bg-emerald-500/20 px-5 py-3 text-base font-semibold text-white transition hover:bg-emerald-500/30 disabled:opacity-40"
      >
        Drop Feedback
      </button>
      <button
        type="button"
        onClick={onGoToDashboard}
        className="mt-8 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
