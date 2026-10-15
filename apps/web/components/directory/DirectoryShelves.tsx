'use client';

import Link from 'next/link';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { risingShelf, shelfName } from '@/lib/directory-chips';
import type { ShelfPerson } from '@/lib/featured-shelves-server';

/**
 * The Rising shelf at the top of the directory (URG-304): one row of faces.
 *
 * Featured people come first, then On the rise this month, each person once
 * (risingShelf). Search results are never ranked by it, and it is drawn only in
 * the default view (the page holds that rule). With nobody on it, nothing is
 * drawn at all.
 *
 * No heading and no helper text (bare-minimum rule). A tile is a face and a
 * short name; it opens the person's page when that page is public.
 */

export function DirectoryShelves({
  featured,
  onTheRise,
}: {
  featured: ShelfPerson[];
  onTheRise: ShelfPerson[];
}) {
  const people = risingShelf(featured, onTheRise);
  if (people.length === 0) return null;

  return (
    <section aria-label="Rising" className="mb-2">
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {people.map((person) => {
          const tile = (
            <div className="relative h-[170px] w-[130px] overflow-hidden rounded-[18px] bg-bg-surface">
              <ProfileFace name={person.displayName} photoUrl={person.avatarUrl} size="fill" />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.85))' }}
              />
              <span className="absolute bottom-2.5 left-3 right-2 truncate font-display text-[15px] text-white">
                {shelfName(person.displayName)}
              </span>
            </div>
          );
          return (
            <li key={person.userId} className="shrink-0 snap-start">
              {person.isPublic && person.slug ? (
                <Link href={`/p/${person.slug}`} className="motion-focus block rounded-[18px]" aria-label={person.displayName}>
                  {tile}
                </Link>
              ) : (
                tile
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
