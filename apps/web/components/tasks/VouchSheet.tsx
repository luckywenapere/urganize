'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { roleLine } from '@/lib/relationships-page';
import { firstName, MAX_VOUCH_NOTE, suggestSkills } from '@/lib/vouches';
import { useRelationshipsStore } from '@/stores/useRelationshipsStore';
import { useTaskStore, type VouchPromptState } from '@/stores/useTaskStore';
import { PersonFace } from '@/app/dashboard/relationships/PersonFace';

/**
 * "How was {first name} on this?" (Vouch, slice 1; founder approved the mock
 * 2026-10-24). Opens when ONE activity with a person from My People on it is
 * marked done; never during a bulk Mark done (the store decides).
 *
 * Same rules as TaskOutcomeSheet and CoverArtPromptSheet: it never delays the
 * tick, Skip is one tap and records nothing, and there is no Escape handler
 * (the task detail pop-up owns Escape).
 */
export function VouchSheet() {
  const prompt = useTaskStore((state) => state.vouchPrompt);
  const dismiss = useTaskStore((state) => state.dismissVouchPrompt);
  if (!prompt) return null;
  return <VouchBody key={`${prompt.taskId}:${prompt.tick}`} prompt={prompt} onDismiss={dismiss} />;
}

const SWIPE_DISMISS_PX = 80;
const DONE_VISIBLE_MS = 1200;

function VouchBody({ prompt, onDismiss }: { prompt: VouchPromptState; onDismiss: () => void }) {
  const relationships = useRelationshipsStore((state) => state.relationships);
  const initialLoading = useRelationshipsStore((state) => state.isInitialLoading);
  const load = useRelationshipsStore((state) => state.load);
  const saveVouch = useRelationshipsStore((state) => state.saveVouch);

  const person = useMemo(
    () => relationships.find((item) => item.personId === prompt.personId) ?? null,
    [relationships, prompt.personId]
  );

  const [skill, setSkill] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panelRef, { onBackClose: onDismiss });

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    void load();
  }, [load]);

  // Removed from My People since they were put on the activity: nothing to ask.
  useEffect(() => {
    if (!initialLoading && !person) onDismiss();
  }, [initialLoading, person, onDismiss]);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onDismiss, DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [done, onDismiss]);

  const skills = useMemo(
    () => suggestSkills({ title: prompt.title, taskType: prompt.taskType, role: person?.role }),
    [prompt.title, prompt.taskType, person?.role]
  );

  if (!person) return null;

  const name = firstName(person.label);
  const line = roleLine(person);

  async function handleVouch() {
    if (!skill || busy) return;
    setBusy(true);
    setError(null);
    const failure = await saveVouch(prompt.personId, {
      skill,
      note: note.trim() || undefined,
      taskId: prompt.taskId,
    });
    setBusy(false);
    if (failure) {
      setError(failure.error);
      return;
    }
    setDone(true);
  }

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    setDragOffset(delta > 0 ? delta : 0);
  };
  const handleTouchEnd = () => {
    dragStartY.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      onDismiss();
      return;
    }
    setDragOffset(0);
  };

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`How was ${name} on this?`}
        className="task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] sm:max-w-md sm:rounded-2xl sm:border"
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
            : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-out)' }
        }
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 px-5 pt-3 sm:px-6"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" aria-hidden="true" />
          <div className="flex justify-end">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-3">
            <PersonFace name={person.label} photoUrl={person.avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-content-primary">{person.label}</p>
              {line ? <p className="truncate text-sm text-content-secondary">{line}</p> : null}
            </div>
          </div>

          {done ? (
            <h2 className="mt-5 font-display text-xl text-content-primary">Saved.</h2>
          ) : (
            <>
              <h2 className="mt-5 font-display text-xl text-content-primary">How was {name} on this?</h2>
              <p className="mt-1 truncate text-sm text-content-secondary" title={prompt.title}>
                {prompt.title}
              </p>

              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pick one">
                {skills.map((option) => {
                  const isSelected = skill === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSkill(isSelected ? null : option)}
                      className={`motion-focus motion-press inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'border-brand bg-brand/10 text-content-primary'
                          : 'border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
                      }`}
                    >
                      {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                      {option}
                    </button>
                  );
                })}
              </div>

              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={MAX_VOUCH_NOTE}
                placeholder="One line (optional)"
                aria-label="One line (optional)"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleVouch();
                  }
                }}
                className="mt-4 w-full rounded-lg border border-stroke-control bg-bg-elevated px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <p className="mt-2 text-xs text-content-tertiary">
                Only your team sees this until {name} claims their profile.
              </p>

              {error ? (
                <p role="alert" className="mt-3 text-sm text-status-error">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="motion-focus motion-press inline-flex h-11 flex-1 items-center justify-center rounded-full border border-stroke-default bg-bg-elevated text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => void handleVouch()}
                  disabled={!skill || busy}
                  className="motion-focus motion-press inline-flex h-11 flex-1 items-center justify-center rounded-full border border-brand/25 bg-brand text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Saving' : 'Vouch'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
