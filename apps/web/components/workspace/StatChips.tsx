'use client';

type StatChipsProps = {
  activeReleases: number;
  tasksDone: number;
  tasksTotal: number;
  overdue: number;
  dueToday: number;
};

type Chip = {
  label: string;
  value: string;
  tone: 'default' | 'danger' | 'warning';
};

export function StatChips({
  activeReleases,
  tasksDone,
  tasksTotal,
  overdue,
  dueToday,
}: StatChipsProps) {
  const chips: Chip[] = [
    { label: 'Active releases', value: String(activeReleases), tone: 'default' },
    { label: 'Tasks done', value: `${tasksDone} / ${tasksTotal}`, tone: 'default' },
    { label: 'Overdue', value: String(overdue), tone: overdue > 0 ? 'danger' : 'default' },
    { label: 'Due today', value: String(dueToday), tone: dueToday > 0 ? 'warning' : 'default' },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-2" role="list" aria-label="Workspace stats">
      {chips.map((chip) => (
        <div
          key={chip.label}
          role="listitem"
          className="flex min-w-[128px] flex-col gap-1 border border-stroke-default bg-bg-surface px-4 py-3"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {chip.label}
          </span>
          <span
            className={`font-display text-2xl font-semibold leading-none ${
              chip.tone === 'danger'
                ? 'text-status-error'
                : chip.tone === 'warning'
                  ? 'text-status-warning'
                  : 'text-content-primary'
            }`}
          >
            {chip.value}
          </span>
        </div>
      ))}
    </div>
  );
}
