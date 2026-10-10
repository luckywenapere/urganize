'use client';

import { useState } from 'react';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import { SHELF_COPY, type Shelf, type ShelfPerson } from '@/lib/directory-featuring';
import { PersonCard, type DirectoryPerson } from '@/components/directory/PersonCard';

/**
 * Featured and On the rise this month, at the top of the directory (spec,
 * section 6: "Featured, not ranked").
 *
 * Neither is a leaderboard, and nothing here is numbered or scored: Featured is
 * who Urganize picked, On the rise is who delivered work lately, and both only
 * hold people who chose to be published. There is no "top" and no "best", and the
 * words on the page keep it that way.
 *
 * Renders nothing until there is somebody on a shelf. An empty "Featured" box on
 * a young directory is a promise it cannot keep.
 */

/** How many roles show before "Show more". Six people per role on two shelves is
 *  a long page, and a phone should not have to scroll past all sixteen roles to
 *  reach the search results. */
const ROLES_SHOWN_FIRST = 2;

type ShelfCard = ShelfPerson & DirectoryPerson;

export function DirectoryShelves({
  shelves,
  onAsk,
}: {
  shelves: Shelf[];
  /** Null when asking is not available for this person. */
  onAsk: (person: DirectoryPerson) => (() => void) | null;
}) {
  const [showAll, setShowAll] = useState(false);
  if (shelves.length === 0) return null;

  const shown = showAll ? shelves : shelves.slice(0, ROLES_SHOWN_FIRST);

  return (
    <section aria-label="Featured and on the rise" className="mb-8 space-y-6">
      {shown.map((shelf) => (
        <div key={shelf.role}>
          <h2 className="font-display text-lg text-content-primary">
            {DIRECTORY_ROLE_LABELS[shelf.role]}
          </h2>

          {shelf.featured.length > 0 ? (
            <ShelfList
              label={SHELF_COPY.featured}
              role={shelf.role}
              people={shelf.featured as ShelfCard[]}
              onAsk={onAsk}
            />
          ) : null}
          {shelf.onTheRise.length > 0 ? (
            <ShelfList
              label={SHELF_COPY.onTheRise}
              role={shelf.role}
              people={shelf.onTheRise as ShelfCard[]}
              onAsk={onAsk}
            />
          ) : null}
        </div>
      ))}

      {shelves.length > ROLES_SHOWN_FIRST ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="motion-focus min-h-11 rounded-lg px-1 text-sm text-content-secondary underline underline-offset-2 hover:text-content-primary"
        >
          {showAll ? 'Show fewer roles' : `Show ${shelves.length - ROLES_SHOWN_FIRST} more roles`}
        </button>
      ) : null}
    </section>
  );
}

function ShelfList({
  label,
  role,
  people,
  onAsk,
}: {
  label: string;
  role: Shelf['role'];
  people: ShelfCard[];
  onAsk: (person: DirectoryPerson) => (() => void) | null;
}) {
  return (
    <div className="mt-3">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
        {label}
      </h3>
      <ul className="mt-2 space-y-3">
        {people.map((person) => (
          <li key={person.userId}>
            <PersonCard
              person={person}
              managerRecord={person.managerRecord}
              shelfRole={role}
              onAsk={onAsk(person)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
