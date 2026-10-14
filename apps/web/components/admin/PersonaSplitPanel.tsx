import { InfoTip } from '@/components/shared/HelpTip';
import type { PersonaSplit } from '@/lib/admin-persona-split';

// The persona split on the founder cockpit (URG-262, 2026-10-14): who our
// accounts say they are, worked out by lib/admin-persona-split.ts. Display
// only. Shares are of the accounts that answered; "Not answered" says how
// much of the base that still is. One column on a phone.

function share(count: number, of: number): string {
  if (of === 0) return '';
  return `${Math.round((count / of) * 100)}%`;
}

export function PersonaSplitPanel({ split }: { split: PersonaSplit }) {
  const unanswered = split.accounts - split.answered;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-1.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">Who signs up</p>
        <InfoTip
          label="Who signs up"
          text="Each account's own answer to Who are you?, asked in onboarding and once on Home for older accounts. Not the account role, which Google sign-in sets to manager by default. Our own accounts and curator-only accounts are left out. Shares are of those who answered."
        />
      </div>
      <div className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <ul className="space-y-2">
          {split.byPersona.map((entry) => (
            <li key={entry.persona} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-content-primary">{entry.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-stroke-default" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: split.answered ? `${(entry.count / split.answered) * 100}%` : '0%' }}
                />
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-content-secondary">
                {entry.count}
                {split.answered ? ` · ${share(entry.count, split.answered)}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-content-tertiary">
          {split.answered} of {split.accounts} accounts answered. {unanswered} not answered yet.
          {split.internalLeftOut > 0 ? ` ${split.internalLeftOut} of ours left out.` : ''}
        </p>
      </div>
    </div>
  );
}
