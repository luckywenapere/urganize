'use client';

import Link from 'next/link';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import type { DirectoryEntry } from '@/lib/directory-search';
import { PERSON_AVAILABILITY_COPY } from '@/lib/person-profile';
import { describeManagerRecord, type ManagerRecord } from '@/lib/manager-record';
import { captureAnalyticsEvent } from '@/lib/analytics/client';

/**
 * One person in the directory: on the list, and on the Featured and On the rise
 * shelves above it. One card, so a person looks the same wherever they appear.
 */

export type DirectoryPerson = DirectoryEntry & { slug: string | null; isPublic: boolean };

export function PersonCard({
  person,
  onAsk,
  managerRecord = null,
  shelfRole = null,
}: {
  person: DirectoryPerson;
  onAsk: (() => void) | null;
  /** A manager's record, worked out from rollouts. Only the shelves carry it. */
  managerRecord?: ManagerRecord | null;
  /** The role of the shelf this card sits on. "Also works as" is about the OTHER
   *  roles, so the shelf's own is left out: a card under the Manager heading
   *  should not say "Also works as Manager". */
  shelfRole?: DirectoryEntry['roles'][number]['role'] | null;
}) {
  const delivered = person.roles.filter((entry) => entry.delivered > 0);
  const claimed = person.roles.filter(
    (entry) => entry.delivered === 0 && entry.role !== shelfRole
  );
  const recordLine = describeManagerRecord(managerRecord);

  const body = (
    <div className="rounded-xl border border-stroke-default p-4 transition-colors hover:border-brand">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-content-primary">{person.displayName}</span>
        <span className="text-xs text-content-tertiary">
          {PERSON_AVAILABILITY_COPY[person.availability].label}
          {person.city ? ` · ${person.city}` : ''}
        </span>
      </div>

      {/* A manager's numbers are counted from rollouts that came out. Like the
          counts below, they are something the product vouches for. */}
      {recordLine ? <p className="mt-2 text-sm text-brand">{recordLine}</p> : null}

      {/* Delivered and claimed are kept apart here exactly as they are on the
          profile and in Settings. A count is something the product vouches for;
          a bare role is the person's own word. */}
      {delivered.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {delivered.map((entry) => (
            <li
              key={entry.role}
              className="rounded-full border border-stroke-default px-3 py-1 text-sm text-content-primary"
            >
              {DIRECTORY_ROLE_LABELS[entry.role]}
              <span className="ml-1.5 text-brand">{entry.delivered} delivered</span>
            </li>
          ))}
        </ul>
      ) : null}

      {claimed.length > 0 ? (
        <p className="mt-2 text-xs text-content-tertiary">
          Also works as {claimed.map((entry) => DIRECTORY_ROLE_LABELS[entry.role]).join(', ')}
        </p>
      ) : null}
    </div>
  );

  // The Ask button is a SIBLING of the card, never inside it. The card body is
  // wrapped in a Link for a public profile, and a button inside an anchor is
  // invalid markup whose click would navigate instead of opening the sheet.
  return (
    <div>
      {person.isPublic && person.slug ? (
        <Link
          href={`/p/${person.slug}`}
          className="motion-focus block"
          onClick={() =>
            captureAnalyticsEvent({
              name: 'directory_profile_opened',
              properties: { role: delivered[0]?.role ?? claimed[0]?.role ?? null },
            })
          }
        >
          {body}
        </Link>
      ) : (
        body
      )}

      {onAsk ? (
        <button
          type="button"
          onClick={onAsk}
          className="motion-focus mt-2 h-10 w-full rounded-lg border border-stroke-default text-sm font-medium text-content-primary hover:border-brand"
        >
          Ask {person.displayName.split(' ')[0] || 'them'} about work
        </button>
      ) : null}
    </div>
  );
}
