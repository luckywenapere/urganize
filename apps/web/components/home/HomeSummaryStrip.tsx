import { CheckCircle2 } from '@/components/icons';

type Chip = { key: string; count: number; label: string; href: string; tone: 'urgent' | 'warn' | 'calm' };

const TONE_NUMBER: Record<Chip['tone'], string> = {
  urgent: 'text-status-error',
  warn: 'text-status-warning',
  calm: 'text-content-primary',
};

/**
 * The state of the day in one glance, right under the greeting: how many tasks
 * are late, due today, and stuck with other people. The numbers are the second
 * thing the eye lands on (after the greeting) and each one jumps to its list, so
 * "waiting on others" has a front door at the top of the page instead of living
 * at the bottom of a long list.
 */
export function HomeSummaryStrip({
  late,
  today,
  waiting,
}: {
  late: number;
  today: number;
  waiting: number;
}) {
  if (late + today + waiting === 0) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-content-secondary">
        <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden="true" />
        You are all clear. Nothing is late, due today or waiting on anyone.
      </p>
    );
  }

  const chips: Chip[] = [
    { key: 'late', count: late, label: late === 1 ? 'task late' : 'tasks late', href: '#home-tasks', tone: 'urgent' },
    { key: 'today', count: today, label: 'due today', href: '#home-tasks', tone: 'warn' },
    { key: 'waiting', count: waiting, label: 'waiting on others', href: '#home-waiting', tone: 'calm' },
  ];

  return (
    <ul aria-label="Today at a glance" className="flex flex-wrap gap-2">
      {chips
        .filter((chip) => chip.count > 0)
        .map((chip) => (
          <li key={chip.key}>
            <a
              href={chip.href}
              className="motion-focus motion-press inline-flex min-h-11 items-baseline gap-2 rounded-full border border-stroke-default bg-bg-surface px-4 py-2 hover:border-stroke-strong"
            >
              <span className={`font-display text-xl font-semibold tabular-nums ${TONE_NUMBER[chip.tone]}`}>
                {chip.count}
              </span>
              <span className="text-sm text-content-secondary">{chip.label}</span>
            </a>
          </li>
        ))}
    </ul>
  );
}
