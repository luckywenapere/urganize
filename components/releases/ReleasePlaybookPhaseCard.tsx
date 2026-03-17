import type { ReleasePlaybookPhase } from '@/lib/release-playbook';

type ReleasePlaybookPhaseCardProps = {
  phase: ReleasePlaybookPhase;
  pendingItemKey: string;
  onToggle: (itemKey: string, isCompleted: boolean) => void;
};

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ReleasePlaybookPhaseCard({
  phase,
  pendingItemKey,
  onToggle,
}: ReleasePlaybookPhaseCardProps) {
  return (
    <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.4)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Phase</p>
          <h2 className="mt-2 text-2xl tracking-tight text-content-primary">{phase.title}</h2>
          <p className="mt-2 max-w-xl text-sm text-content-secondary">{phase.description}</p>
        </div>
        <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs font-medium text-content-secondary">
          {phase.completedCount}/{phase.totalCount} complete
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {phase.items.map((item) => {
          const isPending = pendingItemKey === item.itemKey;

          return (
            <button
              key={item.itemKey}
              type="button"
              aria-pressed={item.isCompleted}
              disabled={isPending}
              onClick={() => onToggle(item.itemKey, !item.isCompleted)}
              className={`flex min-h-[72px] w-full items-center gap-4 rounded-[22px] border px-4 py-4 text-left transition ${
                item.isCompleted
                  ? 'border-brand/35 bg-brand/10'
                  : 'border-stroke-subtle bg-bg-elevated/70 hover:border-stroke-default hover:bg-bg-hover'
              } ${isPending ? 'cursor-wait opacity-75' : ''}`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
                  item.isCompleted
                    ? 'border-brand bg-brand text-content-inverse'
                    : 'border-stroke-default bg-bg-surface text-content-tertiary'
                }`}
              >
                {item.isCompleted ? <CheckIcon /> : <span className="text-sm font-semibold">{phase.items.indexOf(item) + 1}</span>}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-content-primary">{item.title}</span>
                <span className="mt-1 block text-sm text-content-secondary">
                  {isPending ? 'Saving...' : item.isCompleted ? 'Completed' : 'Mark complete'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
