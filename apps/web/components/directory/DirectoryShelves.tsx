'use client';

import type { ReactNode } from 'react';
import { HelpTip } from '@/components/shared/HelpTip';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import type { HelpKey } from '@/lib/help-copy';
import type { ShelfPerson } from '@/lib/featured-shelves-server';

/**
 * Two shelves at the top of the directory: Featured, and On the rise this month.
 *
 * Why shelves and not a ranking: search results stay in the order they came,
 * because a list that quietly puts somebody first is a list people stop
 * trusting. A shelf is different. It says out loud why a person is there (we
 * picked them, or their recent work earned it), and a new person scanning the
 * directory on a phone gets a place to start that is not a blank search box.
 *
 * A shelf with nobody on it is not drawn at all, heading included. Until
 * thirty days of activity exist On the rise is empty, and an empty heading would
 * read as a broken page rather than a young one.
 *
 * Each row scrolls sideways with a snap, so the next card peeks in from the
 * edge and tells a thumb there is more.
 */

type Shelf = { title: string; helpKey: HelpKey; people: ShelfPerson[] };

export function DirectoryShelves({
  featured,
  onTheRise,
  renderCard,
}: {
  featured: ShelfPerson[];
  onTheRise: ShelfPerson[];
  renderCard: (person: ShelfPerson) => ReactNode;
}) {
  const all: Shelf[] = [
    { title: 'Featured', helpKey: 'directory.featured', people: featured },
    { title: 'On the rise this month', helpKey: 'directory.rising', people: onTheRise },
  ];
  const shelves = all.filter((shelf) => shelf.people.length > 0);

  if (shelves.length === 0) return null;

  return (
    <div className="mb-6 space-y-6">
      {shelves.map((shelf) => (
        <section key={shelf.title} aria-labelledby={`shelf-${shelf.helpKey}`}>
          <div className="mb-2 flex items-center gap-1">
            <h2 id={`shelf-${shelf.helpKey}`} className="font-display text-lg text-content-primary">
              {shelf.title}
            </h2>
            <HelpTip helpKey={shelf.helpKey} />
          </div>
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {shelf.people.map((person) => (
              <li
                key={`${person.userId}-${person.shelfRole}`}
                className="w-64 shrink-0 snap-start"
              >
                <p className="mb-1.5 text-xs font-medium text-brand">
                  {DIRECTORY_ROLE_LABELS[person.shelfRole]}
                </p>
                {renderCard(person)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
