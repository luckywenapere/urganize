'use client';

import { deriveNotePreview, deriveNoteTitle } from '@/lib/notes';
import { deriveNoteSearchPreview } from '@/lib/note-search';
import { formatRelativeTime } from '@/lib/relative-time';
import type { Note } from '@/types/notes';

type NoteListRowProps = {
  note: Note;
  /** Linked release's title, when it resolves to a release still in the store. */
  releaseTitle: string | null;
  selected: boolean;
  /**
   * The live draft for the selected note. Passed so the row's title and
   * preview track typing immediately instead of waiting for the autosave —
   * the note's identity is its first line, and watching it appear as you type
   * is the whole feedback loop.
   */
  draftOverride?: string;
  /**
   * Active search terms, when a query is filtering the list. The preview then
   * shows the region around the match instead of the line under the title: a
   * note runs to 20,000 characters, so a row that matched on something far
   * down would otherwise explain itself with text that has nothing to do with
   * why it is there.
   */
  searchTerms?: string[];
  onSelect: (noteId: string) => void;
};

export function NoteListRow({
  note,
  releaseTitle,
  selected,
  draftOverride,
  searchTerms,
  onSelect,
}: NoteListRowProps) {
  const body = draftOverride ?? note.body;
  const title = deriveNoteTitle(body);
  const preview =
    searchTerms && searchTerms.length > 0
      ? deriveNoteSearchPreview(body, searchTerms)
      : deriveNotePreview(body);

  return (
    <button
      type="button"
      onClick={() => onSelect(note.id)}
      aria-current={selected ? 'true' : undefined}
      className={`motion-focus block w-full px-3.5 py-2.5 text-left transition-colors ${
        selected ? 'bg-brand/10' : 'hover:bg-bg-hover'
      }`}
    >
      <p
        className={`truncate text-sm font-semibold ${
          title ? 'text-content-primary' : 'italic text-content-tertiary'
        }`}
        title={title || undefined}
      >
        {title || 'New note'}
      </p>
      <p className="mt-0.5 truncate text-[13px] text-content-secondary">
        {preview || 'No additional text'}
      </p>
      <span className="mt-1 flex items-center gap-2">
        <span className="shrink-0 font-mono text-[10px] text-content-tertiary">
          {formatRelativeTime(note.updatedAt)}
        </span>
        {/* Captured offline and not sent yet. Without this a note that
            exists only on this device looks exactly like one that is safely
            stored — which is the same silence paging and search were fixed
            for. Deliberately not styled as an error: nothing has gone wrong
            and the note is not at risk, it simply has not travelled yet. */}
        {note.pendingSync ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold text-content-tertiary">
            Waiting to sync
          </span>
        ) : null}
        {releaseTitle ? (
          <span className="inline-flex min-w-0 items-center rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
            <span className="truncate">{releaseTitle}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}
