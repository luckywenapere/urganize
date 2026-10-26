'use client';

import { useEffect, useState } from 'react';
import { CATALOGUE_CHANGED_EVENT, fetchArtistCatalogue, type CatalogueRow } from '@/lib/artist-import/client';
import { ImportReleasesButton } from './ImportReleasesDialog';

function kindLabel(kind: CatalogueRow['kind']): string {
  return kind === 'ep' ? 'EP' : kind === 'album' ? 'Album' : 'Single';
}

/**
 * The artist's past releases, brought in from a public catalogue during
 * onboarding or the Import releases dialog (2026-10-26). Always drawn, so the
 * button to bring releases in is where the artist is; it refreshes itself when
 * an import finishes.
 */
export function ArtistCatalogueCard({ artistId, artistName }: { artistId: string; artistName: string }) {
  const [rows, setRows] = useState<CatalogueRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchArtistCatalogue(artistId).then((found) => {
        if (!cancelled) setRows(found);
      });
    load();
    window.addEventListener(CATALOGUE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CATALOGUE_CHANGED_EVENT, load);
    };
  }, [artistId]);

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-content-primary">Catalogue</h2>
        <ImportReleasesButton
          from="artist"
          initialQuery={artistName}
          className="motion-focus motion-press inline-flex min-h-9 items-center rounded-full border border-stroke-default px-3.5 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          Import releases
        </ImportReleasesButton>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-content-tertiary">No releases yet. Bring them in from their public profile.</p>
      ) : null}
      <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {rows.map((row) => {
          const body = (
            <>
              {row.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote cover, never stored by us
                <img src={row.cover_url} alt="" loading="lazy" className="aspect-square w-full rounded-lg bg-bg-elevated object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-bg-elevated text-lg font-semibold text-content-secondary">
                  {row.title.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="mt-1.5 truncate text-xs font-semibold text-content-primary">{row.title}</p>
              <p className="truncate text-xs text-content-secondary">
                {kindLabel(row.kind)}
                {row.release_date ? `, ${row.release_date.slice(0, 4)}` : ''}
              </p>
            </>
          );
          return (
            <li key={row.id} className="min-w-0">
              {row.url ? (
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="block">
                  {body}
                </a>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
