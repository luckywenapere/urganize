'use client';

import { Pin, Plus, X } from 'lucide-react';
import Image from 'next/image';
import { EmptyState } from '@/components/shared/EmptyState';
import { NoteListRow } from './NoteListRow';
import type { ExecutionRelease } from '@/lib/execution-types';
import type { Note } from '@/types/notes';

type NotesListProps = {
  pinned: Note[];
  others: Note[];
  releaseTitlesById: ReadonlyMap<string, string>;
  selectedNoteId: string | null;
  /** Live draft of the selected note, so its row tracks typing. */
  draftOverride?: string;
  /** Set when `?release=` is filtering the list. */
  filterRelease: ExecutionRelease | null;
  /** True when `?release=` names a release the store can't resolve. */
  filterUnresolved: boolean;
  isCreating: boolean;
  onSelect: (noteId: string) => void;
  onNewNote: () => void;
  onClearFilter: () => void;
};

const sectionSurface =
  'overflow-hidden rounded-xl border border-stroke-default bg-bg-surface divide-y divide-stroke-subtle';

const eyebrow =
  'flex items-center gap-1.5 px-1 pb-2 pt-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary';

export function NotesList({
  pinned,
  others,
  releaseTitlesById,
  selectedNoteId,
  draftOverride,
  filterRelease,
  filterUnresolved,
  isCreating,
  onSelect,
  onNewNote,
  onClearFilter,
}: NotesListProps) {
  const isEmpty = pinned.length === 0 && others.length === 0;
  const isFiltering = Boolean(filterRelease) || filterUnresolved;

  const renderRows = (notes: Note[]) =>
    notes.map((note) => (
      <NoteListRow
        key={note.id}
        note={note}
        releaseTitle={note.releaseId ? releaseTitlesById.get(note.releaseId) ?? null : null}
        selected={note.id === selectedNoteId}
        draftOverride={note.id === selectedNoteId ? draftOverride : undefined}
        onSelect={onSelect}
      />
    ));

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <h1 className="font-display text-lg font-semibold text-content-primary">Notes</h1>
        <button
          type="button"
          onClick={onNewNote}
          disabled={isCreating}
          className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New note
        </button>
      </div>

      {isFiltering ? (
        <div className="shrink-0 pb-3">
          <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 pl-1.5 pr-1 text-xs font-semibold text-content-primary">
            {filterRelease ? (
              <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded border border-stroke-subtle bg-bg-elevated">
                {filterRelease.coverArtUrl ? (
                  <Image
                    src={filterRelease.coverArtUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Image
                    src="/images/urganize-mark.png"
                    alt=""
                    width={161}
                    height={173}
                    className="app-wordmark h-2.5 w-auto opacity-40"
                    aria-hidden="true"
                  />
                )}
              </span>
            ) : null}
            <span className="truncate">
              {filterRelease ? filterRelease.title : 'Unknown release'}
            </span>
            <button
              type="button"
              onClick={onClearFilter}
              aria-label={
                filterRelease
                  ? `Stop filtering by ${filterRelease.title}`
                  : 'Show all notes'
              }
              className="motion-focus grid h-5 w-5 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        {isEmpty ? (
          <EmptyState
            title={
              isFiltering ? 'No notes for this release yet.' : 'Park a thought before it gets away.'
            }
            description={
              isFiltering
                ? 'Notes you link to this release show up here. Start one now, or clear the filter to see everything.'
                : undefined
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onNewNote}
                  disabled={isCreating}
                  className="motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New note
                </button>
                {isFiltering ? (
                  <button
                    type="button"
                    onClick={onClearFilter}
                    className="motion-focus motion-press inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
                  >
                    Show all notes
                  </button>
                ) : null}
              </div>
            }
          />
        ) : (
          <>
            {pinned.length > 0 ? (
              <section>
                <p className={eyebrow}>
                  <Pin className="h-3 w-3" aria-hidden="true" />
                  Pinned
                </p>
                <div className={sectionSurface}>{renderRows(pinned)}</div>
              </section>
            ) : null}

            {others.length > 0 ? (
              <section className={pinned.length > 0 ? 'mt-4' : undefined}>
                {pinned.length > 0 ? <p className={eyebrow}>Notes</p> : null}
                <div className={sectionSurface}>{renderRows(others)}</div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
