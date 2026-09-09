/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatReleaseDate, type ReleaseOption } from '@/lib/release-helpers';

type ReleaseComboboxProps = {
  releases: ReleaseOption[];
  selectedRelease: ReleaseOption | null;
  query: string;
  isLoading: boolean;
  isCreating: boolean;
  allowCreate?: boolean;
  onQueryChange: (value: string) => void;
  onSelectRelease: (release: ReleaseOption) => void;
  onCreateRelease: (title: string) => Promise<ReleaseOption | null>;
};

type ComboboxItem =
  | {
      kind: 'release';
      release: ReleaseOption;
    }
  | {
      kind: 'create';
      value: string;
    };

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function ReleaseCombobox({
  releases,
  selectedRelease,
  query,
  isLoading,
  isCreating,
  allowCreate = true,
  onQueryChange,
  onSelectRelease,
  onCreateRelease,
}: ReleaseComboboxProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedQuery = normalizeValue(query);
  // When the modal opens with a release pre-selected, the parent seeds the
  // input value with that release's title (so users see what's currently
  // selected as they tab through). If we then filtered by that string, the
  // dropdown would show ONLY the selected release — defeating the picker.
  // So when `query` exactly matches the currently-selected release's title
  // and nothing else has been typed, treat it as an empty filter: show all
  // releases so any can be chosen. As soon as the user edits the input,
  // normal substring filtering kicks back in.
  const queryEqualsSelection =
    selectedRelease !== null &&
    normalizedQuery === normalizeValue(selectedRelease.title) &&
    normalizedQuery.length > 0;

  const filteredReleases = useMemo(() => {
    if (!normalizedQuery || queryEqualsSelection) {
      return releases;
    }

    return releases.filter((release) => normalizeValue(release.title).includes(normalizedQuery));
  }, [normalizedQuery, queryEqualsSelection, releases]);

  // ALL releases whose title matches the typed text, not the first one
  // (URG-233). Release titles are not unique, and since the title became
  // optional at creation every unnamed release shares the same default, so
  // "first by title" silently resolved to an arbitrary one of them.
  const titleMatches = useMemo(
    () => releases.filter((release) => normalizeValue(release.title) === normalizedQuery),
    [normalizedQuery, releases]
  );

  // Only safe to auto-commit on blur when the typed text identifies exactly
  // one release. Two candidates means we genuinely don't know which was
  // meant, so the user picks a row instead (see commitTypedValue).
  const exactMatch = titleMatches.length === 1 ? titleMatches[0] : null;

  const createValue = query.trim();
  // Suppressed whenever ANY release already carries this title — keyed off
  // the full match list, not `exactMatch`, so an ambiguous title doesn't
  // start offering to create yet another release with the same name.
  const showCreateOption = Boolean(allowCreate && createValue && titleMatches.length === 0);
  const items = useMemo<ComboboxItem[]>(
    () => [
      ...filteredReleases.map((release) => ({ kind: 'release', release }) satisfies ComboboxItem),
      ...(showCreateOption
        ? ([{ kind: 'create', value: createValue }] satisfies ComboboxItem[])
        : []),
    ],
    [createValue, filteredReleases, showCreateOption]
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex((current) => {
      if (items.length === 0) {
        return -1;
      }

      if (current < 0 || current >= items.length) {
        return 0;
      }

      return current;
    });
  }, [isOpen, items]);

  const commitTypedValue = async (): Promise<ReleaseOption | null> => {
    const trimmedValue = query.trim();
    if (!trimmedValue || isCreating) {
      setIsOpen(false);
      return null;
    }

    if (exactMatch) {
      onSelectRelease(exactMatch);
      setIsOpen(false);
      return exactMatch;
    }

    // Ambiguous: several releases share this exact title (URG-233). Leave the
    // current selection alone and take no action — guessing here would file
    // the activity against the wrong release with no visible sign of it. The
    // dropdown lists every candidate, so the user resolves it by clicking.
    if (titleMatches.length > 1) {
      setIsOpen(false);
      setActiveIndex(-1);
      return null;
    }

    if (!allowCreate) {
      setIsOpen(false);
      setActiveIndex(-1);
      return null;
    }

    const createdRelease = await onCreateRelease(trimmedValue);
    if (createdRelease) {
      setIsOpen(false);
      setActiveIndex(-1);
    }

    return createdRelease;
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (containerRef.current?.contains(activeElement)) {
        return;
      }

      const selectedMatchesQuery =
        selectedRelease && normalizeValue(selectedRelease.title) === normalizeValue(query);

      if (query.trim() && !selectedMatchesQuery) {
        if (!allowCreate) {
          onQueryChange(selectedRelease?.title || '');
          setIsOpen(false);
          setActiveIndex(-1);
          return;
        }

        void commitTypedValue();
        return;
      }

      setIsOpen(false);
      setActiveIndex(-1);
    }, 0);
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => {
        if (items.length === 0) {
          return -1;
        }

        return current < items.length - 1 ? current + 1 : 0;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => {
        if (items.length === 0) {
          return -1;
        }

        return current > 0 ? current - 1 : items.length - 1;
      });
      return;
    }

    if (event.key === 'Escape') {
      // Claim Escape only while the dropdown is actually open — a prevented
      // Escape tells an enclosing modal "the dropdown consumed this", so an
      // unconditional preventDefault would stop Escape from ever closing the
      // modal while this input has focus.
      if (!isOpen) {
        return;
      }
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      if (!items.length) {
        await commitTypedValue();
        return;
      }

      const activeItem = activeIndex >= 0 ? items[activeIndex] : items[0];
      if (!activeItem) {
        await commitTypedValue();
        return;
      }

      if (activeItem.kind === 'release') {
        onSelectRelease(activeItem.release);
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }

      await commitTypedValue();
    }
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && items[activeIndex] ? `${baseId}-option-${activeIndex}` : undefined;

  return (
    // The outer field-label is owned by the caller (TaskQuickCreateModal renders
    // its own "Release *" label so the required-marker can live with the rest
    // of the form). The combobox no longer renders its own redundant label —
    // there was a "Release selector" eyebrow here that stacked under "Release"
    // and read as two competing field names.
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(event) => void handleKeyDown(event)}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label="Release"
        className="input h-12 w-full rounded-[18px]"
        placeholder="Search rollouts or type a new title"
        autoComplete="off"
      />

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-20 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface shadow-[0_28px_70px_-40px_rgb(var(--shadow-ink)/calc(0.78*var(--shadow-alpha-scale)))]">
          <div id={listboxId} role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
            {isLoading ? (
              <div className="rounded-[18px] px-4 py-4 text-sm text-content-secondary">
                Loading rollouts...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[18px] px-4 py-4 text-sm text-content-secondary">
                Type a title to create one and keep going.
              </div>
            ) : (
              items.map((item, index) => {
                const isActive = index === activeIndex;

                if (item.kind === 'create') {
                  return (
                    <button
                      key={`create-${item.value}`}
                      id={`${baseId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => void commitTypedValue()}
                      disabled={isCreating}
                      className={`flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2 text-left transition ${
                        isActive
                          ? 'bg-brand-muted text-content-primary'
                          : 'text-content-primary hover:bg-bg-elevated'
                      } disabled:cursor-not-allowed disabled:opacity-65`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight">
                          Create &ldquo;{item.value}&rdquo;
                        </p>
                        <p className="mt-0.5 truncate text-[11px] leading-tight text-content-secondary">
                          New rollout will be created inline and selected automatically.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-stroke-default px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-secondary">
                        {isCreating ? 'Saving' : 'Create'}
                      </span>
                    </button>
                  );
                }

                // Compact row: smaller thumbnail (h-9 vs h-12), tighter
                // vertical padding (py-2 vs py-3), smaller secondary text
                // (text-[11px] vs text-xs), and a subtler date eyebrow. The
                // information set is unchanged — title, artist, release date
                // — just less heft per row so more options fit before
                // scrolling.
                const isCurrentSelection = selectedRelease?.id === item.release.id;
                return (
                  <button
                    key={item.release.id}
                    id={`${baseId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isCurrentSelection}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onSelectRelease(item.release);
                      setIsOpen(false);
                      setActiveIndex(-1);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left transition ${
                      isActive
                        ? 'bg-brand-muted'
                        : isCurrentSelection
                          ? 'bg-bg-elevated'
                          : 'hover:bg-bg-elevated'
                    }`}
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[10px] border border-stroke-default bg-bg-overlay">
                      {item.release.coverArtUrl ? (
                        <img
                          src={item.release.coverArtUrl}
                          alt={`${item.release.title} cover`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        // Same default cover art as the catalog cards
                        // (founder call, 2026-07-23): the Urganize U mark,
                        // theme-aware via the shared .app-wordmark invert —
                        // not derived initials.
                        <div className="flex h-full w-full items-center justify-center bg-bg-elevated" aria-hidden="true">
                          <img
                            src="/images/urganize-mark.png"
                            alt=""
                            className="app-wordmark h-4 w-auto opacity-40"
                          />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight text-content-primary">
                        {item.release.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-content-secondary">
                        {item.release.artistName || 'Artist name pending'}
                      </p>
                    </div>

                    {/* Dateless releases render no date column at all rather
                        than a placeholder — formatReleaseDate returns null
                        for them (2026-08-09). */}
                    {formatReleaseDate(item.release.releaseDate) ? (
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                          {formatReleaseDate(item.release.releaseDate)}
                        </p>
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
