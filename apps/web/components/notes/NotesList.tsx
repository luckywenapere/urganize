'use client';

import { Archive, ArrowLeft, Pin, Plus, X } from '@/components/icons';
import { ListToolbar } from '@/components/shell/ListToolbar';
import type { NotesView } from '@/lib/note-archive';
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
  /** Raw query behind the search box. */
  searchQuery: string;
  /** Parsed terms, passed to each row so a deep match previews itself. */
  searchTerms: string[];
  onSearchChange: (query: string) => void;
  onSelect: (noteId: string) => void;
  onNewNote: () => void;
  onClearFilter: () => void;
  /** Another page exists on the server. */
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** How many notes are loaded, before the release filter and search narrow
   *  them. Used only to be honest about what a search actually covered. */
  loadedCount: number;
  /** Which list is on screen. */
  view: NotesView;
  onViewChange: (view: NotesView) => void;
};

const sectionSurface =
  'urg-cartouche overflow-hidden rounded-xl border border-stroke-default bg-bg-surface divide-y divide-stroke-subtle';

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
  searchQuery,
  searchTerms,
  onSearchChange,
  onSelect,
  onNewNote,
  onClearFilter,
  hasMore,
  isLoadingMore,
  onLoadMore,
  loadedCount,
  view,
  onViewChange,
}: NotesListProps) {
  const isEmpty = pinned.length === 0 && others.length === 0;
  const isFiltering = Boolean(filterRelease) || filterUnresolved;
  const isSearching = searchTerms.length > 0;
  const isArchivedView = view === 'archived';

  // Paging is keyset, so "older" is literally what the next page holds:
  // the list is newest-first and the cursor walks backwards through it.
  const loadMoreButton = (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={isLoadingMore}
      className="motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
    >
      {isLoadingMore ? 'Loading…' : 'Load older notes'}
    </button>
  );

  const renderRows = (notes: Note[]) =>
    notes.map((note) => (
      <NoteListRow
        key={note.id}
        note={note}
        releaseTitle={note.releaseId ? releaseTitlesById.get(note.releaseId) ?? null : null}
        selected={note.id === selectedNoteId}
        draftOverride={note.id === selectedNoteId ? draftOverride : undefined}
        searchTerms={searchTerms}
        onSelect={onSelect}
      />
    ));

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <h1 className="font-display text-lg font-semibold text-content-primary">
          {isArchivedView ? 'Archived' : 'Notes'}
        </h1>
        {/* The archive offers no "New note": you do not write into an
            archive, and a create there would land in the list you are not
            looking at. It gets a way back instead. */}
        {isArchivedView ? (
          <button
            type="button"
            onClick={() => onViewChange('active')}
            className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Notes
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onViewChange('archived')}
              aria-label="Show archived notes"
              title="Archived"
              className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
            </button>
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
        )}
      </div>

      {/* Search sits above the release chip because it is the broader filter:
          it narrows everything, where the chip narrows to one release. The
          input is `text-lg` — 16px in this preset — because anything smaller
          makes iOS zoom the page on focus, and `text-base` here is 14px. No
          autoFocus: this is a persistent bar on a page you land on, not a
          palette you opened, so stealing focus would put the phone keyboard
          over the list every time Notes is opened. */}
      {/* In the tab row on a computer (founder mock, 2026-10-11), here on a
          phone. ListToolbar keeps the phone box at 16px so iOS does not zoom. */}
      <ListToolbar
        className="shrink-0 pb-3"
        search={{ value: searchQuery, onChange: onSearchChange, placeholder: 'Search notes' }}
      />

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
              {filterRelease ? filterRelease.title : 'Unknown rollout'}
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
        {isEmpty && isSearching ? (
          // A search miss is NOT an empty notebook, and must never offer to
          // create a note: the user is looking for one that already exists,
          // and "New note" here would read as the only way out of a typo.
          <EmptyState
            title="No notes match that."
            description={
              // While a page is unloaded, a miss is genuinely inconclusive —
              // search filters what is in memory, so saying only "no match"
              // would be telling the reader their note is gone when we have
              // not looked at it. That case leads.
              hasMore
                ? `Search only covers the ${loadedCount} notes loaded so far. Load older notes and try again.`
                : isFiltering
                  ? 'Nothing here matches your search. Try fewer words, or clear the rollout filter to search everything.'
                  : 'Try fewer words. Search matches the title and the body, in any order.'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {hasMore ? loadMoreButton : null}
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="motion-focus motion-press inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                Clear search
              </button>
              </div>
            }
          />
        ) : isEmpty && isArchivedView ? (
          <EmptyState
            title="Nothing archived."
            description="Archiving a note puts it here instead of deleting it. Nothing is lost, and one tap puts it back."
            action={
              <button
                type="button"
                onClick={() => onViewChange('active')}
                className="motion-focus motion-press inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                Back to notes
              </button>
            }
          />
        ) : isEmpty ? (
          <EmptyState
            mascot="resting"
            title={
              isFiltering ? 'No notes for this rollout yet.' : 'Park a thought before it gets away.'
            }
            description={
              isFiltering
                ? 'Notes you link to this rollout show up here. Start one now, or clear the filter to see everything.'
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
            {/* One flat list in the archive. A "Pinned" heading there would
                be labelling an ordering that no longer does anything: pinning
                keeps a note at the top of the notebook you work in, and an
                archived note is out of it. The pin is kept on the row, so
                restoring puts it back where its owner left it. */}
            {isArchivedView ? (
              <section>
                <div className={sectionSurface}>{renderRows([...pinned, ...others])}</div>
              </section>
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

            {/* The 201st note used to be invisible with nothing on screen to
                say so. Now the end of the list is either the end of the
                notebook or a control — never a silent stop. */}
            {hasMore ? (
              <div className="mt-4 flex flex-col items-center gap-2 pb-2">
                {isSearching ? (
                  <p className="text-center text-xs text-content-tertiary">
                    Searched the {loadedCount} notes loaded so far.
                  </p>
                ) : null}
                {loadMoreButton}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
