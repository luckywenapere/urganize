'use client';

import { useMemo, useRef } from 'react';
import { SearchableGenreSelect } from '@/components/ui/SearchableGenreSelect';

type ManagerArtistOption = {
  id: string;
  name: string;
  genre?: string;
  imageUrl?: string | null;
};

type SelectorCard =
  | {
      slotKey: string;
      id: string;
      title: string;
      subtitle: string;
      kind: 'support';
    }
  | {
      slotKey: string;
      id: string;
      title: string;
      subtitle: string;
      kind: 'artist';
      artist: ManagerArtistOption;
    };

type Step2ArtistSelectorProps = {
  artists: ManagerArtistOption[];
  isLoading: boolean;
  isBusy: boolean;
  selectedArtistId: string | null;
  isAddArtistOpen: boolean;
  addArtistName: string;
  addArtistGenre: string;
  addArtistNotes: string;
  onSelectArtist: (artistId: string) => void;
  onMovePrevious: () => void;
  onMoveNext: () => void;
  onContinue: () => Promise<void>;
  onOpenAddArtist: () => void;
  onCloseAddArtist: () => void;
  onAddArtistNameChange: (value: string) => void;
  onAddArtistGenreChange: (value: string) => void;
  onAddArtistNotesChange: (value: string) => void;
  onSaveArtist: () => Promise<void>;
};

const buildDecorativeCard = (key: string, title: string, subtitle: string): SelectorCard => ({
  slotKey: key,
  id: key,
  title,
  subtitle,
  kind: 'support' as const,
});

export function Step2ArtistSelector({
  artists,
  isLoading,
  isBusy,
  selectedArtistId,
  isAddArtistOpen,
  addArtistName,
  addArtistGenre,
  addArtistNotes,
  onSelectArtist,
  onMovePrevious,
  onMoveNext,
  onContinue,
  onOpenAddArtist,
  onCloseAddArtist,
  onAddArtistNameChange,
  onAddArtistGenreChange,
  onAddArtistNotesChange,
  onSaveArtist,
}: Step2ArtistSelectorProps) {
  const touchStartXRef = useRef<number | null>(null);

  const selectedIndex = useMemo(() => {
    if (artists.length === 0 || !selectedArtistId) return -1;
    return artists.findIndex((artist) => artist.id === selectedArtistId);
  }, [artists, selectedArtistId]);

  const cards = useMemo<SelectorCard[]>(() => {
    if (artists.length === 0) {
      return [
        buildDecorativeCard('support-left', 'Artist Library', 'Save artist records once and reuse them across plans.'),
        buildDecorativeCard('add-artist', 'Add Artist', 'Create an artist profile before building a plan.'),
        buildDecorativeCard('support-right', 'Plan Context', 'Artist identity stays visible before strategy begins.'),
      ];
    }

    if (artists.length === 1) {
      const artist = artists[0];
      return [
        buildDecorativeCard('left-add', 'Add New Artist', 'Keep another artist ready for future plans.'),
        {
          slotKey: `center-${artist.id}`,
          id: artist.id,
          title: artist.name,
          subtitle: artist.genre || 'Artist profile ready',
          kind: 'artist' as const,
          artist,
        },
        buildDecorativeCard('right-browse', 'Use Existing Artist Profile', 'This plan can continue immediately with the selected artist.'),
      ];
    }

    const normalizedIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const currentArtist = artists[normalizedIndex];

    if (artists.length === 2) {
      const otherArtist = artists[(normalizedIndex + 1) % artists.length];
      return [
        {
          slotKey: `left-${otherArtist.id}`,
          id: otherArtist.id,
          title: otherArtist.name,
          subtitle: otherArtist.genre || 'Artist profile',
          kind: 'artist' as const,
          artist: otherArtist,
        },
        {
          slotKey: `center-${currentArtist.id}`,
          id: currentArtist.id,
          title: currentArtist.name,
          subtitle: currentArtist.genre || 'Artist profile',
          kind: 'artist' as const,
          artist: currentArtist,
        },
        buildDecorativeCard('right-add', 'Add New Artist', 'Keep another artist ready without leaving this flow.'),
      ];
    }

    const leftIndex = (normalizedIndex - 1 + artists.length) % artists.length;
    const rightIndex = (normalizedIndex + 1) % artists.length;

    return [
      {
        slotKey: `left-${artists[leftIndex].id}`,
        id: artists[leftIndex].id,
        title: artists[leftIndex].name,
        subtitle: artists[leftIndex].genre || 'Artist profile',
        kind: 'artist' as const,
        artist: artists[leftIndex],
      },
      {
        slotKey: `center-${currentArtist.id}`,
        id: currentArtist.id,
        title: currentArtist.name,
        subtitle: currentArtist.genre || 'Artist profile',
        kind: 'artist' as const,
        artist: currentArtist,
      },
      {
        slotKey: `right-${artists[rightIndex].id}`,
        id: artists[rightIndex].id,
        title: artists[rightIndex].name,
        subtitle: artists[rightIndex].genre || 'Artist profile',
        kind: 'artist' as const,
        artist: artists[rightIndex],
      },
    ];
  }, [artists, selectedIndex]);

  const copy = artists.length === 0
    ? 'Create an artist profile first, then continue into the plan.'
    : artists.length === 1
      ? 'We found your artist profile. Confirm to continue.'
      : 'Select the artist you want to build this plan for.';

  const canContinue = artists.length > 0 && selectedIndex >= 0;

  const handleTouchStart = (clientX: number) => {
    touchStartXRef.current = clientX;
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStartXRef.current === null) return;
    const delta = clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < 36) return;
    if (delta > 0) onMovePrevious();
    if (delta < 0) onMoveNext();
  };

  return (
    <>
      <section className="mt-8 text-center">
        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Create New Plan</p>
        <h1 className="mt-3 text-[clamp(2.9rem,7vw,5.4rem)] tracking-tight text-content-primary">Who is this plan for?</h1>
        <p className="mx-auto mt-3 max-w-[640px] text-base text-content-secondary sm:text-lg">{copy}</p>
      </section>

      <section
        className="relative mt-12 min-h-[360px] sm:min-h-[420px]"
        onTouchStart={(event) => handleTouchStart(event.changedTouches[0]?.clientX || 0)}
        onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX || 0)}
      >
        <div className="pointer-events-none absolute inset-x-12 top-8 h-40 rounded-full bg-brand/15 blur-3xl" />

        {isLoading ? (
          <div className="relative mx-auto flex max-w-[880px] items-center justify-center gap-3 px-1 sm:gap-5">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={`skeleton-shimmer rounded-[2rem] border border-stroke-default bg-bg-surface/70 ${
                  index === 1 ? 'h-[320px] w-[56%]' : 'mt-8 h-[260px] w-[22%]'
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="relative mx-auto flex max-w-[900px] items-center justify-center gap-2 px-1 sm:gap-6">
            {artists.length > 1 && (
              <button
                type="button"
                onClick={onMovePrevious}
                className="absolute left-0 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-stroke-default bg-bg-surface/90 text-content-primary shadow-lg transition hover:bg-bg-hover sm:flex"
                aria-label="Previous artist"
              >
                ‹
              </button>
            )}

            {cards.map((card, index) => {
              const isCenter = index === 1;
              const isArtist = card.kind === 'artist';
              const isSelected = isArtist && card.artist.id === selectedArtistId;
              const initials = isArtist
                ? card.artist.name
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((item) => item[0]?.toUpperCase())
                    .join('')
                : card.title
                    .split(' ')
                    .slice(0, 2)
                    .map((item) => item[0]?.toUpperCase())
                    .join('');

              return (
                <button
                  key={card.slotKey}
                  type="button"
                  onClick={() => {
                    if (!isArtist) {
                      onOpenAddArtist();
                      return;
                    }
                    onSelectArtist(card.artist.id);
                  }}
                  className={`relative overflow-hidden rounded-[2rem] border px-4 py-5 text-left transition duration-300 ease-out sm:px-6 sm:py-6 ${
                    isCenter
                      ? 'z-20 min-h-[320px] w-[58%] scale-100 border-brand/45 bg-[linear-gradient(160deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] shadow-[0_32px_90px_-40px_rgba(0,0,0,0.85)]'
                      : 'z-10 min-h-[255px] w-[21%] scale-[0.88] border-stroke-default bg-bg-surface/78 opacity-75'
                  } ${isSelected ? 'ring-1 ring-brand/55' : ''}`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_56%)]" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className={`grid place-items-center rounded-2xl border border-stroke-default bg-bg-base/55 font-semibold text-content-primary ${isCenter ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm'}`}>
                          {initials || 'AR'}
                        </div>
                        {isCenter && isSelected && (
                          <span className="rounded-full border border-brand/35 bg-brand-muted px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-content-primary">
                            Selected
                          </span>
                        )}
                      </div>
                      <h2 className={`mt-6 truncate tracking-tight text-content-primary ${isCenter ? 'text-3xl' : 'text-lg'}`}>{card.title}</h2>
                      <p className={`mt-2 line-clamp-2 text-content-secondary ${isCenter ? 'text-sm' : 'text-xs'}`}>{card.subtitle}</p>
                    </div>
                    {isArtist && isCenter && (
                      <div className="mt-6 space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs text-content-secondary">
                          {card.artist.genre && <span className="rounded-full border border-stroke-subtle bg-bg-base/50 px-2.5 py-1">{card.artist.genre}</span>}
                        </div>
                        <div className="rounded-2xl border border-stroke-subtle bg-bg-base/35 px-4 py-3 text-sm text-content-secondary">
                          This plan will be created for <span className="font-medium text-content-primary">{card.artist.name}</span>.
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {artists.length > 1 && (
              <button
                type="button"
                onClick={onMoveNext}
                className="absolute right-0 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-stroke-default bg-bg-surface/90 text-content-primary shadow-lg transition hover:bg-bg-hover sm:flex"
                aria-label="Next artist"
              >
                ›
              </button>
            )}
          </div>
        )}
      </section>

      <section className="mx-auto mt-8 flex w-full max-w-[840px] flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || isBusy || isLoading}
          className="rounded-full border border-brand/40 bg-brand-muted px-7 py-3 text-base font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-45"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onOpenAddArtist}
          disabled={isBusy}
          className="rounded-full border border-stroke-default bg-bg-surface px-6 py-3 text-sm font-medium text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-45"
        >
          Add New Artist
        </button>
      </section>

      {isAddArtistOpen && (
        <section className="mx-auto mt-8 w-full max-w-[820px] rounded-[2rem] border border-stroke-default bg-bg-surface/96 p-6 shadow-[0_28px_80px_-38px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Add New Artist</p>
              <h3 className="mt-2 text-2xl tracking-tight text-content-primary">Create an artist profile for this plan</h3>
            </div>
            <button
              type="button"
              onClick={onCloseAddArtist}
              className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              Close
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-content-secondary">Artist name</span>
              <input
                value={addArtistName}
                onChange={(event) => onAddArtistNameChange(event.target.value)}
                placeholder="e.g. Tems"
                className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated/70 px-4 py-3 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
              />
            </label>
            <SearchableGenreSelect
              value={addArtistGenre}
              onChange={onAddArtistGenreChange}
              label="Genre"
            />
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm text-content-secondary">Notes</span>
              <textarea
                value={addArtistNotes}
                onChange={(event) => onAddArtistNotesChange(event.target.value)}
                placeholder="Optional context about this artist"
                className="min-h-[120px] w-full rounded-2xl border border-stroke-subtle bg-bg-elevated/70 px-4 py-3 text-base text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSaveArtist}
              disabled={isBusy}
              className="rounded-full border border-brand/40 bg-brand-muted px-6 py-3 text-sm font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-45"
            >
              Save Artist
            </button>
            <button
              type="button"
              onClick={onCloseAddArtist}
              className="rounded-full border border-stroke-default bg-bg-elevated px-6 py-3 text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </>
  );
}
