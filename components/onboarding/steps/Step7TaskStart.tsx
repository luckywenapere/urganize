'use client';

type Step7TaskStartProps = {
  isBusy: boolean;
  taskTitle: string;
  taskOutcome: string;
  onLogout: () => Promise<void>;
  onMarkStarted: () => Promise<void>;
  onGoToDashboard: () => void;
};

export function Step7TaskStart({
  isBusy,
  taskTitle,
  taskOutcome,
  onLogout,
  onMarkStarted,
  onGoToDashboard,
}: Step7TaskStartProps) {
  return (
    <div className="mx-auto mt-[14vh] w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl sm:p-8">
      <div className="space-y-12">
        <h2 className="text-[clamp(2.6rem,6.2vw,4.8rem)] text-content-primary">{taskTitle}</h2>
        <p className="text-[clamp(2rem,4.8vw,3.8rem)] text-content-secondary">{taskOutcome}</p>
        <button type="button" disabled={isBusy} onClick={onMarkStarted} className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)] text-content-primary disabled:opacity-40">
          <span className="inline-block h-12 w-12 rounded-md border border-stroke-default bg-bg-elevated sm:h-14 sm:w-14" />
          <span>Mark Started</span>
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onGoToDashboard}
          className="rounded-xl border border-stroke-default bg-bg-elevated px-4 py-2 text-sm font-medium text-content-primary transition hover:bg-bg-hover disabled:opacity-40"
        >
          Go to Dashboard
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onLogout}
          className="text-sm text-content-secondary transition hover:text-content-primary disabled:opacity-40"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
