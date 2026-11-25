'use client';

import { useState } from 'react';
import { bannerFor, type ArtistVerificationStatus } from '@/lib/artist-verification';
import { VerifyArtistSheet } from './VerifyArtistSheet';

// The banner (issue #1390, founder approved the mock): one line and one button.
// It stays on the artist's page and cannot be closed, and it blocks nothing:
// import, covers, UPC and ISRC and smart links all keep working. It goes away
// only when an admin approves the artist.
export function VerificationBanner({
  artistId,
  artistName,
  status,
  note,
}: {
  artistId: string;
  artistName: string;
  status: ArtistVerificationStatus;
  note: string | null;
}) {
  const [open, setOpen] = useState(false);
  const banner = bannerFor(status, artistName, note);
  if (!banner) return null;

  return (
    <>
      <section
        aria-label="Artist verification"
        className="mt-6 flex flex-col gap-4 rounded-2xl bg-bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-6 text-content-primary">{banner.title}</p>
          <p className="text-sm leading-6 text-content-secondary">{banner.body}</p>
        </div>
        {banner.button ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="motion-press inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90"
          >
            {banner.button}
          </button>
        ) : null}
      </section>
      {open ? <VerifyArtistSheet artistId={artistId} artistName={artistName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
