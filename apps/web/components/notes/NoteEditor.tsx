'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Pin, Sparkles, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/relative-time';
import { NoteReleasePicker } from './NoteReleasePicker';
import type { NoteSaveState } from './useNoteAutosave';
import type { ExecutionRelease } from '@/lib/execution-types';
import type { Note } from '@/types/notes';

type NoteEditorProps = {
  note: Note;
  draft: string;
  saveState: NoteSaveState;
  releases: ExecutionRelease[];
  onDraftChange: (body: string) => void;
  onFlush: () => void;
  onRetry: () => void;
  onSetRelease: (releaseId: string | null) => void;
  onTogglePin: () => void;
  onRequestDelete: () => void;
  /** Turn this note into a release plan. Absent hides the action — the notes
   * page decides, because it knows whether the linked release already has one. */
  onMakePlan?: () => void;
  onBack: () => void;
  /** True only for a note that was just created — focus once, then never steal. */
  autoFocus: boolean;
  onAutoFocusConsumed: () => void;
};

/** How often the idle "Edited …" label re-renders so it stays honest. */
const RELATIVE_TICK_MS = 60_000;

export function NoteEditor({
  note,
  draft,
  saveState,
  releases,
  onDraftChange,
  onFlush,
  onRetry,
  onSetRelease,
  onTogglePin,
  onMakePlan,
  onRequestDelete,
  onBack,
  autoFocus,
  onAutoFocusConsumed,
}: NoteEditorProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [, setTick] = useState(0);

  // Autosize: the textarea grows with its content, so the note reads as a
  // document rather than a scrolling box (TaskDetailView's technique).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = bodyRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(0, 0);
    }
    onAutoFocusConsumed();
  }, [autoFocus, onAutoFocusConsumed]);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), RELATIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const indicator = (() => {
    if (saveState === 'dirty' || saveState === 'saving') {
      // "Queued" versus "in flight" is a distinction without a difference to
      // the person typing — both mean their words are being handled.
      return (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Saving…
        </>
      );
    }
    if (saveState === 'saved') {
      return (
        <>
          <Check className="h-3 w-3 text-brand" aria-hidden="true" />
          Saved
        </>
      );
    }
    if (saveState === 'error') {
      return (
        <>
          <span className="text-status-error">Couldn&rsquo;t save</span>
          <button
            type="button"
            onClick={onRetry}
            className="motion-focus rounded px-1 font-semibold text-content-secondary underline transition-colors hover:text-content-primary"
          >
            Retry
          </button>
        </>
      );
    }
    return <>Edited {formatRelativeTime(note.updatedAt)}</>;
  })();

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 pb-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to notes"
          className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <NoteReleasePicker
          releases={releases}
          linkedReleaseId={note.releaseId}
          onSelect={onSetRelease}
        />

        {onMakePlan ? (
          <button
            type="button"
            onClick={onMakePlan}
            title="Turn this note into a release plan"
            className="motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:border-brand/50 hover:bg-bg-hover"
          >
            <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            <span className="hidden sm:inline">Make a plan</span>
            <span className="sm:hidden">Plan</span>
          </button>
        ) : null}

        <div className="min-w-0 flex-1" />

        <span
          aria-live="polite"
          className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-content-tertiary"
          title={saveState === 'idle' ? new Date(note.updatedAt).toLocaleString() : undefined}
        >
          {indicator}
        </span>

        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={note.pinned}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin' : 'Pin'}
          className={`motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
            note.pinned
              ? 'bg-brand/10 text-brand'
              : 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
          }`}
        >
          <Pin
            className="h-4 w-4"
            fill={note.pinned ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={onRequestDelete}
          aria-label="Delete note"
          title="Delete"
          className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-status-error/10 hover:text-status-error"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <div className="mx-auto w-full max-w-[46rem]">
          <textarea
            ref={bodyRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onBlur={onFlush}
            placeholder="Start writing — the first line becomes the title"
            aria-label="Note body"
            rows={1}
            // 16px keeps iOS from zooming on focus, and a note body wants the
            // larger reading size on desktop anyway. No focus ring here: the
            // whole writing surface lighting up would be noise, and every
            // control around it carries motion-focus.
            className="w-full resize-none bg-transparent text-[16px] leading-7 text-content-primary placeholder:text-content-tertiary focus:outline-none"
          />
        </div>
      </div>
    </>
  );
}

/** Shown at lg+ when no note is open — the list pane owns the actionable state. */
export function NoteEditorEmpty({ title }: { title?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-content-tertiary">
        {title || 'Select a note, or start a new one.'}
      </p>
    </div>
  );
}
