'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search } from '@/components/icons';
import { MAX_SONG_TITLE_LENGTH } from '@/lib/song-catalog';

export type CatalogSong = { id: string; title: string; durationSeconds: number | null };

type SongPickerProps = {
  catalog: CatalogSong[];
  /** Songs already in this set, marked rather than hidden: playing a song
   *  twice is rare but real (an encore), and hiding it would read as lost. */
  inSetIds: ReadonlySet<string>;
  busy: boolean;
  onPick: (songId: string) => void | Promise<void>;
  onCreate: (title: string) => void | Promise<void>;
};

type Option = { kind: 'song'; song: CatalogSong } | { kind: 'create'; title: string };

/**
 * One field to add a song: type to search the artist's catalog, Enter adds the
 * highlighted match, and when nothing matches, the last option adds what you
 * typed as a new song. Replaced a wall of chips (one per song in the catalog)
 * plus a separate "New song title" box, which asked the manager to know which
 * of the two to use.
 *
 * A combobox in the ARIA sense: the input owns a listbox, arrow keys move the
 * highlight, Escape closes it.
 */
export function SongPicker({ catalog, inSetIds, busy, onPick, onCreate }: SongPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo<Option[]>(() => {
    const term = query.trim().toLowerCase();
    const matches = (term
      ? catalog.filter((song) => song.title.toLowerCase().includes(term))
      : catalog
    )
      .slice()
      .sort((a, b) => {
        // Titles that START with what was typed come first.
        const aStarts = term && a.title.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = term && b.title.toLowerCase().startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.title.localeCompare(b.title);
      })
      .slice(0, 8)
      .map((song) => ({ kind: 'song' as const, song }));
    const exact = catalog.some((song) => song.title.trim().toLowerCase() === term);
    return term && !exact ? [...matches, { kind: 'create' as const, title: query.trim() }] : matches;
  }, [catalog, query]);

  const choose = async (option: Option | undefined) => {
    if (!option || busy) return;
    if (option.kind === 'song') await onPick(option.song.id);
    else await onCreate(option.title.slice(0, MAX_SONG_TITLE_LENGTH));
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  };

  const activeId = open && options[highlight] ? `${listId}-${highlight}` : undefined;

  return (
    <div className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
          aria-hidden
        />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Add a song"
          value={query}
          placeholder={catalog.length > 0 ? 'Add a song' : 'Type a song title to add it'}
          maxLength={MAX_SONG_TITLE_LENGTH}
          onChange={(changeEvent) => {
            setQuery(changeEvent.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'ArrowDown') {
              keyEvent.preventDefault();
              setOpen(true);
              setHighlight((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
            } else if (keyEvent.key === 'ArrowUp') {
              keyEvent.preventDefault();
              setHighlight((index) => Math.max(index - 1, 0));
            } else if (keyEvent.key === 'Enter') {
              keyEvent.preventDefault();
              void choose(options[highlight]);
            } else if (keyEvent.key === 'Escape') {
              if (open) {
                keyEvent.preventDefault();
                keyEvent.stopPropagation();
                setOpen(false);
              }
            }
          }}
          className="h-10 w-full rounded-lg border border-stroke-control bg-bg-base pl-9 pr-9 text-content-primary outline-none transition-colors focus:border-brand"
        />
        {busy ? (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-content-tertiary"
            aria-hidden
          />
        ) : null}
      </div>

      {open && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Songs"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-stroke-default bg-bg-surface p-1 shadow-lg"
        >
          {options.map((option, index) => {
            const active = index === highlight;
            return (
              <li
                key={option.kind === 'song' ? option.song.id : 'create'}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active}
                onMouseDown={(mouseEvent) => {
                  // Before the input's blur closes the list.
                  mouseEvent.preventDefault();
                  void choose(option);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                  active ? 'bg-bg-hover text-content-primary' : 'text-content-secondary'
                }`}
              >
                {option.kind === 'song' ? (
                  <>
                    <span className="truncate">{option.song.title}</span>
                    {inSetIds.has(option.song.id) ? (
                      <span className="shrink-0 text-[11px] font-semibold text-content-tertiary">In set</span>
                    ) : null}
                  </>
                ) : (
                  <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-brand">
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Add &ldquo;{option.title}&rdquo; as a new song</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
