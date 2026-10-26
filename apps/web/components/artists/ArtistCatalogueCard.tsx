'use client';

import { useEffect, useState } from 'react';
import { fetchArtistCatalogue, type CatalogueRow } from '@/lib/artist-import/client';

function kindLabel(kind: CatalogueRow['kind']): string {
  return kind === 'ep' ? 'EP' : kind === 'album' ? 'Album' : 'Single';
}

/**
 * The artist's past releases, brought in from a public catalogue during
 * onboarding (2026-10-26). Shows nothing at all for an artist with none, so
 * an artist made by hand sees no empty card.
 */
export function ArtistCatalogueCard({ artistId }: { artistId: string }) {
  const [rows, setRows] = useState<CatalogueRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchArtistCatalogue(artistId).then((found) => {
      if (!cancelled) setRows(found);
    });
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <h2 className="font-display text-base font-semibold text-content-primary">Catalogue</h2>
      <p className="mt-1 text-xs text-content-tertiary">Brought in from their public releases.</p>
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
