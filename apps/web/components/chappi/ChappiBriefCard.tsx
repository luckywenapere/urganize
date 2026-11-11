'use client';

import { useRouter } from 'next/navigation';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import type { MorningBrief, MorningBriefItem } from '@/lib/chappi/morning-brief';

/**
 * The morning brief in the one Assistant chat (#1207, mock
 * docs/mocks/assistant-one-chat). Four short parts: what needs you today,
 * what changed since yesterday, what is coming up, and one next step with a
 * button. Empty parts are left out, so a quiet morning is a short card.
 *
 * Rows that point at a task open it in the task panel; rows that point at a
 * rollout go there. The text itself was written on the server from the facts
 * (lib/chappi/morning-brief.ts); nothing here computes anything.
 */
export function ChappiBriefCard({ brief, messageId }: { brief: MorningBrief; messageId?: string }) {
  const router = useRouter();
  const { openTask } = useTaskUI();

  const open = (target: { taskId?: string; href?: string }) => {
    if (target.taskId) openTask(target.taskId);
    else if (target.href) router.push(target.href);
  };

  return (
    <section
      data-message-id={messageId}
      aria-label="Morning brief"
      className="rounded-2xl border border-stroke-default bg-bg-surface px-4 py-4 shadow-sm sm:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="font-display text-lg text-content-primary">{brief.greeting}</h3>
        <span className="text-xs text-content-tertiary">Morning brief</span>
      </div>
      <p className="mt-1 text-sm leading-6 text-content-secondary">{brief.lede}</p>

      <BriefSection title="Needs you today" items={brief.needs} onOpen={open} />
      <BriefSection title="Since yesterday" items={brief.changed} onOpen={open} />
      <BriefSection title="Coming up" items={brief.upcoming} onOpen={open} />

      {brief.next ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-brand/10 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-content-primary">
            <span className="font-semibold">One thing first: </span>
            {brief.next.text}
          </p>
          {brief.next.taskId || brief.next.href ? (
            <button
              type="button"
              onClick={() => open(brief.next ?? {})}
              className="motion-focus motion-press inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-brand px-4 text-sm font-semibold text-content-inverse"
            >
              {brief.next.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function BriefSection({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: MorningBriefItem[];
  onOpen: (target: { taskId?: string; href?: string }) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-content-tertiary">{title}</h4>
      <ul className="mt-1 divide-y divide-stroke-subtle">
        {items.map((item, index) => {
          const clickable = Boolean(item.taskId || item.href);
          const dot =
            item.tone === 'late' ? 'bg-status-error' : item.tone === 'good' ? 'bg-brand' : 'bg-content-tertiary/60';
          const body = (
            <>
              <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span className="min-w-0 flex-1 text-sm text-content-primary">{item.text}</span>
              {item.meta ? (
                <span
                  className={`shrink-0 text-xs ${
                    item.tone === 'late' ? 'font-semibold text-status-error' : 'text-content-secondary'
                  }`}
                >
                  {item.meta}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={`${item.text}-${index}`}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="motion-focus flex w-full flex-wrap items-start gap-x-2.5 gap-y-0.5 py-2 text-left hover:opacity-80"
                >
                  {body}
                </button>
              ) : (
                <div className="flex flex-wrap items-start gap-x-2.5 gap-y-0.5 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
