'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MessageCircle, SlidersHorizontal } from '@/components/icons';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { BRIEF_SKIP, BRIEF_SKIP_LABEL } from '@/lib/chappi/brief-questions';
import {
  briefSectionTitle,
  briefSections,
  type MorningBrief,
  type MorningBriefItem,
} from '@/lib/chappi/morning-brief';

/**
 * The morning brief in the one Assistant chat (#1207, mock
 * docs/mocks/assistant-one-chat). Four short parts: what needs you today,
 * what changed since yesterday, what is coming up, and one next step with a
 * button. Empty parts are left out, so a quiet morning is a short card.
 *
 * Since #1314 (mock docs/mocks/brief-daily-question) the card may also carry:
 * a line saying why it looks this way (from the person's answers, with
 * Change), a "Waiting on" part for a teammate they asked to watch, the parts
 * in the order they chose, and today's question with one-tap answers.
 *
 * Rows that point at a task open it in the task panel; rows that point at a
 * rollout go there. The text itself was written on the server from the facts
 * (lib/chappi/morning-brief.ts); nothing here computes anything.
 */
export function ChappiBriefCard({
  brief,
  messageId,
  answer = null,
  onAnswer,
}: {
  brief: MorningBrief;
  messageId?: string;
  /** The words of the person's answer to this brief's question, if they gave one. */
  answer?: string | null;
  /** Saves a tap on the question. Left out where the question cannot be
   *  answered: earlier pages of the chat, and any brief but the newest. */
  onAnswer?: (date: string, choiceId: string) => Promise<BriefTapOutcome>;
}) {
  const router = useRouter();
  const { openTask } = useTaskUI();
  const openSettings = useOpenSettings();

  const open = (target: { taskId?: string; href?: string }) => {
    if (target.taskId) openTask(target.taskId);
    else if (target.href) router.push(target.href);
  };
  const openBriefSettings = () => openSettings({ segment: 'notifications' });

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

      {brief.because ? (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-bg-hover px-3 py-1.5 text-xs text-content-secondary">
          <span className="flex min-w-0 items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate">{brief.because}</span>
          </span>
          <button
            type="button"
            onClick={openBriefSettings}
            className="motion-focus -mr-1.5 inline-flex min-h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-brand"
          >
            Change
          </button>
        </div>
      ) : null}

      {briefSections(brief).map(({ key, items }) => (
        <BriefSection key={key} title={briefSectionTitle(key, brief)} items={items} onOpen={open} />
      ))}

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

      <BriefQuestionBlock brief={brief} answer={answer} onAnswer={onAnswer} onOpenSettings={openBriefSettings} />
    </section>
  );
}

/** What a tap came to: saved (null), an error to show, or the question closed. */
export type BriefTapOutcome = null | { error: string; closed: boolean };

/**
 * Today's question (#1314). Open only on the newest brief and only where it
 * can be answered; once answered it shows the pick. The server decides whether
 * it is still today (never this device's clock): a tap on a question that has
 * closed hides it. An old question nobody answered is simply left out.
 */
function BriefQuestionBlock({
  brief,
  answer,
  onAnswer,
  onOpenSettings,
}: {
  brief: MorningBrief;
  answer: string | null;
  onAnswer?: (date: string, choiceId: string) => Promise<BriefTapOutcome>;
  onOpenSettings: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);
  const question = brief.question;
  if (!question) return null;

  const answered = Boolean(answer);
  const isOpen = !answered && !closed && Boolean(onAnswer);
  if (!answered && !isOpen) return null;
  if (answer === BRIEF_SKIP_LABEL) return null;

  const tap = async (choiceId: string) => {
    if (!onAnswer || busy) return;
    setBusy(choiceId);
    setError('');
    const outcome = await onAnswer(brief.date, choiceId);
    setBusy(null);
    if (outcome?.closed) setClosed(true);
    else if (outcome) setError(outcome.error);
  };

  return (
    <div className="mt-4 border-t border-dashed border-stroke-default pt-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Today&apos;s question
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-snug text-content-primary">{question.text}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={question.text}>
        {question.choices.map((choice) => {
          const picked = answered && choice.label === answer;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={!isOpen || Boolean(busy)}
              aria-pressed={picked}
              onClick={() => void tap(choice.id)}
              className={`motion-focus motion-press inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                picked
                  ? 'border-brand bg-brand text-content-inverse'
                  : answered
                    ? 'border-stroke-subtle text-content-tertiary'
                    : 'border-stroke-default bg-bg-base text-content-primary hover:border-brand/50'
              } ${busy === choice.id ? 'opacity-70' : ''}`}
            >
              {picked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {choice.label}
            </button>
          );
        })}
      </div>
      {isOpen ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-content-secondary">
          <span>Or skip it for today.</span>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void tap(BRIEF_SKIP)}
            className="motion-focus -mr-2 inline-flex min-h-10 items-center rounded-md px-2 font-medium text-content-primary"
          >
            {BRIEF_SKIP_LABEL}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenSettings}
          className="motion-focus -ml-1 mt-1.5 inline-flex min-h-9 items-center rounded-md px-1 text-xs font-medium text-content-secondary underline-offset-2 hover:underline"
        >
          Saved. Change it in Settings
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-status-error">
          {error}
        </p>
      ) : null}
    </div>
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
