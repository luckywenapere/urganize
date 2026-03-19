type ReleasePlaybookProgressCardProps = {
  completionPercent: number;
  completedCount: number;
  totalCount: number;
  remainingCount: number;
};

export function ReleasePlaybookProgressCard({
  completionPercent,
  completedCount,
  totalCount,
  remainingCount,
}: ReleasePlaybookProgressCardProps) {
  return (
    <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 shadow-[0_20px_44px_-30px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Playbook Progress</p>
          <div className="mt-3 flex items-end gap-3">
            <p className="text-4xl font-semibold tracking-tight text-content-primary">{completionPercent}%</p>
            <p className="pb-1 text-sm text-content-secondary">
              {completedCount} completed
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs font-medium text-content-secondary">
            {completedCount} completed
          </span>
          <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs font-medium text-content-secondary">
            {remainingCount} remaining
          </span>
          <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs font-medium text-content-secondary">
            {totalCount} total
          </span>
        </div>
      </div>

      <div className="mt-5 h-2.5 rounded-full bg-bg-overlay">
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      <p className="mt-4 text-sm text-content-secondary">
        A structured checklist of the key steps strong music teams typically take when preparing and releasing a song.
      </p>
    </div>
  );
}
