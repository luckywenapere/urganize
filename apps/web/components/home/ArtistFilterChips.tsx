import { Check } from '@/components/icons';
import type { HomeArtistChip } from '@/lib/home/types';

type ArtistFilterChipsProps = {
  artists: readonly HomeArtistChip[];
  selectedArtistId: string | null;
  onSelect: (artistId: string | null) => void;
};

/**
 * The artist filter row. Hides itself entirely at 0 or 1 artist (mapping
 * report: "Hide at 1 artist") — a filter over a single option narrows
 * nothing and is one more thing to read past.
 */
export function ArtistFilterChips({ artists, selectedArtistId, onSelect }: ArtistFilterChipsProps) {
  if (artists.length <= 1) return null;

  const chipClass = (active: boolean) =>
    `motion-focus inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-brand bg-brand/10 text-brand'
        : 'border-stroke-default bg-bg-surface text-content-secondary hover:border-stroke-strong hover:text-content-primary'
    }`;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <button
        type="button"
        aria-pressed={selectedArtistId === null}
        onClick={() => onSelect(null)}
        className={chipClass(selectedArtistId === null)}
      >
        {selectedArtistId === null ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
        All artists
      </button>
      {artists.map((artist) => (
        <button
          key={artist.id}
          type="button"
          aria-pressed={selectedArtistId === artist.id}
          onClick={() => onSelect(artist.id)}
          className={chipClass(selectedArtistId === artist.id)}
        >
          {selectedArtistId === artist.id ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          {artist.name}
        </button>
      ))}
    </div>
  );
}
