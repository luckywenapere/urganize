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

function getCoverFallbackMonogram(release: ReleaseOption): string {
  const source = `${release.artistName} ${release.title}`.trim();
  const letters = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() || '')
    .join('');

  return letters || 'U';
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
  const filteredReleases = useMemo(() => {
    if (!normalizedQuery) {
      return releases;
    }

    return releases.filter((release) => normalizeValue(release.title).includes(normalizedQuery));
  }, [normalizedQuery, releases]);

  const exactMatch = useMemo(
    () =>
      releases.find((release) => normalizeValue(release.title) === normalizedQuery) || null,
    [normalizedQuery, releases]
  );

  const createValue = query.trim();
  const showCreateOption = Boolean(allowCreate && createValue && !exactMatch);
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
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-content-primary">Release selector</span>
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
          className="input h-12 rounded-[18px]"
          placeholder="Search releases or type a new title"
          autoComplete="off"
        />
      </label>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-20 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface shadow-[0_28px_70px_-40px_rgba(0,0,0,0.78)]">
          <div id={listboxId} role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
            {isLoading ? (
              <div className="rounded-[18px] px-4 py-4 text-sm text-content-secondary">
                Loading releases...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[18px] px-4 py-4 text-sm text-content-secondary">
                Type a release title to create one and keep going.
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
                      className={`flex w-full items-center justify-between rounded-[18px] px-4 py-3 text-left transition ${
                        isActive
                          ? 'bg-brand-muted text-content-primary'
                          : 'text-content-primary hover:bg-bg-elevated'
                      } disabled:cursor-not-allowed disabled:opacity-65`}
                    >
                      <div>
                        <p className="text-sm font-semibold">Create &ldquo;{item.value}&rdquo;</p>
                        <p className="mt-1 text-xs text-content-secondary">
                          New release will be created inline and selected automatically.
                        </p>
                      </div>
                      <span className="rounded-full border border-stroke-default px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-secondary">
                        {isCreating ? 'Saving' : 'Create'}
                      </span>
                    </button>
                  );
                }

                const coverFallbackMonogram = getCoverFallbackMonogram(item.release);

                return (
                  <button
                    key={item.release.id}
                    id={`${baseId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selectedRelease?.id === item.release.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onSelectRelease(item.release);
                      setIsOpen(false);
                      setActiveIndex(-1);
                    }}
                    className={`flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition ${
                      isActive ? 'bg-brand-muted' : 'hover:bg-bg-elevated'
                    }`}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px] border border-stroke-default bg-bg-overlay">
                      {item.release.coverArtUrl ? (
                        <img
                          src={item.release.coverArtUrl}
                          alt={`${item.release.title} cover`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.2),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                          <span className="text-sm font-semibold tracking-[-0.06em] text-content-primary">
                            {coverFallbackMonogram}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-content-primary">
                        {item.release.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-content-secondary">
                        {item.release.artistName || 'Artist name pending'}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                        {formatReleaseDate(item.release.releaseDate)}
                      </p>
                    </div>
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
