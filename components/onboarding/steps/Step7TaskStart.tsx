'use client';

type Step7TaskStartProps = {
  isBusy: boolean;
  taskTitle: string;
  taskOutcome: string;
  onLogout: () => Promise<void>;
  onMarkStarted: () => Promise<void>;
};

export function Step7TaskStart({
  isBusy,
  taskTitle,
  taskOutcome,
  onLogout,
  onMarkStarted,
}: Step7TaskStartProps) {
  return (
    <div className="mx-auto mt-[16vh] w-full max-w-[700px]">
      <button
        type="button"
        onClick={onLogout}
        className="absolute right-6 top-8 text-sm text-content-secondary hover:text-content-primary"
      >
        Logout
      </button>
      <div className="space-y-12">
        <h2 className="text-[clamp(2.6rem,6.2vw,4.8rem)] text-content-primary">{taskTitle}</h2>
        <p className="text-[clamp(2rem,4.8vw,3.8rem)] text-content-secondary">{taskOutcome}</p>
        <button type="button" disabled={isBusy} onClick={onMarkStarted} className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)] text-content-primary disabled:opacity-40">
          <span className="inline-block h-12 w-12 rounded-md border border-stroke-default bg-bg-elevated sm:h-14 sm:w-14" />
          <span>Mark Started</span>
        </button>
      </div>
    </div>
  );
}
