'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { supabase } from '@/lib/supabase/client';
import {
  OUTCOME_NOTE_MAX_LENGTH,
  TASK_OUTCOME_LABELS,
  TASK_OUTCOME_RATINGS,
  type TaskOutcome,
  type TaskOutcomeRating,
} from '@/lib/task-outcomes';
import { useTaskStore, type OutcomePromptState } from '@/stores/useTaskStore';

/**
 * The post-completion check-in: "Done. How did it go?".
 *
 * Mounted once by TaskUIProvider, after the task detail pop-up, so a
 * completion triggered from inside that pop-up stacks the sheet above it. No
 * portal: the provider's subtree already hosts the z-[170] modal tier.
 *
 * Rules this surface must keep:
 * - It never blocks or delays completion. The store writes its prompt slot in
 *   the same synchronous frame as the done flip, so this renders immediately
 *   and nothing here can slow the task down.
 * - Dismissing is one tap (X, backdrop, swipe down), records nothing, and
 *   never reopens the task. No confirmation and no guilt copy.
 * - No Escape handler on purpose: the task detail pop-up owns Escape, and a
 *   second window listener would close both surfaces on one keypress.
 */
export function TaskOutcomeSheet() {
  const prompt = useTaskStore((state) => state.outcomePrompt);
  const dismiss = useTaskStore((state) => state.dismissOutcomePrompt);

  if (!prompt) return null;

  // The tick in the key remounts the body for every completion, so a rapid
  // complete, reopen, complete never inherits the previous sheet's state.
  return <OutcomeSheetBody key={`${prompt.taskId}:${prompt.tick}`} prompt={prompt} onDismiss={dismiss} />;
}

type Phase = 'collect' | 'submitting' | 'followup' | 'thanks';

const SWIPE_DISMISS_PX = 80;
const THANKS_VISIBLE_MS = 1200;

function OutcomeSheetBody({
  prompt,
  onDismiss,
}: {
  prompt: OutcomePromptState;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('collect');
  const [rating, setRating] = useState<TaskOutcomeRating | null>(null);
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [saveError, setSaveError] = useState('');
  const [dragOffset, setDragOffset] = useState(0);

  const dragStartY = useRef<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'thanks') return;
    const timer = setTimeout(onDismiss, THANKS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [onDismiss, phase]);

  const authorizedFetch = useCallback(async (input: string, init: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    });
  }, []);

  const submitOutcome = useCallback(async () => {
    if (!rating) return;
    setPhase('submitting');
    setSaveError('');

    try {
      const response = await authorizedFetch(`/api/tasks/${prompt.taskId}/outcome`, {
        method: 'POST',
        body: JSON.stringify({ outcome: rating, note: note.trim() || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        outcome?: TaskOutcome;
        error?: string;
      };
      if (!isMounted.current) return;

      if (!response.ok || !payload.outcome) {
        setSaveError('Could not save. Try again.');
        setPhase('collect');
        return;
      }

      // The server only returns a question when the user wrote a note, so
      // the one-follow-up-maximum rule holds by construction.
      if (payload.outcome.aiFollowupQuestion) {
        setQuestion(payload.outcome.aiFollowupQuestion);
        setPhase('followup');
        return;
      }
      setPhase('thanks');
    } catch {
      if (!isMounted.current) return;
      setSaveError('Could not save. Try again.');
      setPhase('collect');
    }
  }, [authorizedFetch, note, prompt.taskId, rating]);

  const submitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setPhase('thanks');
    try {
      // The outcome itself is already saved, so a lost answer is never worth
      // an error message. Fire it and thank them either way.
      await authorizedFetch(`/api/tasks/${prompt.taskId}/outcome`, {
        method: 'PATCH',
        body: JSON.stringify({ answer: trimmed }),
      });
    } catch {
      // Intentionally silent.
    }
  }, [answer, authorizedFetch, prompt.taskId]);

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    setDragOffset(Math.max(0, delta));
  };

  const handleTouchEnd = () => {
    dragStartY.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      onDismiss();
      return;
    }
    setDragOffset(0);
  };

  const isSubmitting = phase === 'submitting';

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How did it go"
        className="task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] sm:max-w-md sm:rounded-2xl sm:border"
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
            : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-out)' }
        }
      >
        {/* Drag region: the handle and header only, so swiping never fights
            the textarea's own text selection. */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 px-5 pt-3 sm:px-6"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              UrgAns
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="motion-focus motion-press grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
          {phase === 'thanks' ? (
            <div>
              <h2 className="font-display text-xl text-content-primary">Thanks. Saved.</h2>
              <p className="mt-1 text-sm text-content-secondary">
                UrgAns will remember this for the release.
              </p>
            </div>
          ) : phase === 'followup' && question ? (
            <div>
              <h2 className="font-display text-xl text-content-primary">One quick thing</h2>
              <p className="mt-2 text-sm text-content-primary">{question}</p>
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value.slice(0, OUTCOME_NOTE_MAX_LENGTH))}
                rows={2}
                autoFocus
                placeholder="Your answer"
                className="mt-3 w-full resize-none rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={submitAnswer}
                disabled={!answer.trim()}
                className="motion-focus motion-press mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-brand/25 bg-brand text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          ) : (
            <div>
              <h2 className="font-display text-xl text-content-primary">Done. How did it go?</h2>
              <p className="mt-1 truncate text-sm text-content-secondary" title={prompt.title}>
                {prompt.title}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {TASK_OUTCOME_RATINGS.map((option) => {
                  const isSelected = rating === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setRating(option)}
                      className={`motion-focus motion-press inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'border-brand bg-brand/10 text-content-primary'
                          : 'border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
                      }`}
                    >
                      {TASK_OUTCOME_LABELS[option]}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, OUTCOME_NOTE_MAX_LENGTH))}
                rows={3}
                placeholder="Tell UrgAns what happened"
                className="mt-4 w-full resize-none rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
              />
              <p className="mt-1 text-xs text-content-tertiary">Optional</p>

              {saveError ? <p className="mt-3 text-sm text-status-error">{saveError}</p> : null}

              <button
                type="button"
                onClick={submitOutcome}
                disabled={!rating || isSubmitting}
                className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-brand/25 bg-brand text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
