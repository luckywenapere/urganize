'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { ProfileFace, profileInitials } from '@/components/shared/ProfileFace';
import { useSentRequests } from '@/components/directory/SentRequestsList';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import type { DirectoryEntry } from '@/lib/directory-search';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import { isVouched, rowMeta } from '@/lib/directory-chips';
import { HIRE_CHIPS, deliveredLine, neededLabel, rolloutNeeds, type HireChipKey } from '@/lib/directory-hire';
import { describeRequestStatus } from '@/lib/work-requests';
import { formatCalendarDate } from '@/lib/artist-page';
import { roleLine } from '@/lib/person-page';
import { PERSON_AVAILABILITY_COPY } from '@/lib/person-profile';
import type { ListedUnclaimed } from '@/lib/directory-unclaimed-server';
import type { ProfileRole } from '@/types/directory';
import type { ProfileType } from '@/lib/directory-profile-type';

/**
 * The Directory on a computer (lg and up, #1221, approved mock
 * docs/mocks/directory-desktop). One list you hire from, with the role chips,
 * a city select and an Open to work switch above it, and a right column about
 * you: what your rollouts still need, the asks you sent, and your listing.
 * Phones keep the page DirectoryPageClient draws for them.
 */

export type DeskPerson = DirectoryEntry & { slug: string | null; isPublic: boolean };

const CARD = 'rounded-2xl border border-stroke-subtle bg-bg-surface';
const CHIP = 'hit-44 relative motion-focus inline-flex h-8 items-center rounded-full border px-3.5 text-[13px]';

export function DirectoryDeskFilters({
  query,
  onQuery,
  city,
  cities,
  onCity,
  chip,
  onChip,
  strayRoleLabel,
  onClearStrayRole,
  openOnly,
  onOpenOnly,
  onListing,
}: {
  query: string;
  onQuery: (value: string) => void;
  city: string | null;
  cities: string[];
  onCity: (value: string | null) => void;
  chip: HireChipKey | null;
  onChip: (key: HireChipKey) => void;
  /** A role a link brought in that no chip names, shown so it can be cleared. */
  strayRoleLabel: string | null;
  onClearStrayRole: () => void;
  openOnly: boolean;
  onOpenOnly: (value: boolean) => void;
  onListing: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-6 pt-4">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-[38px] text-content-primary">Directory</h1>
          <p className="mt-1 text-sm text-content-secondary">
            People who have delivered work on real rollouts. Ask one to work on yours.
          </p>
        </div>
        <button
          type="button"
          onClick={onListing}
          className="motion-focus inline-flex h-9 shrink-0 items-center rounded-full border border-stroke-default px-4 text-[13px] font-medium text-content-primary hover:bg-bg-hover"
        >
          Your listing
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search by name"
          aria-label="Search by name"
          className="motion-focus h-11 min-w-0 flex-1 rounded-xl border border-stroke-control bg-bg-surface px-4 text-sm text-content-primary placeholder:text-content-tertiary"
        />
        <select
          value={city ?? ''}
          onChange={(event) => onCity(event.target.value || null)}
          aria-label="City"
          className="motion-focus h-11 rounded-xl border border-stroke-control bg-bg-surface px-3.5 text-sm text-content-primary"
        >
          <option value="">Any city</option>
          {cities.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Role">
          {HIRE_CHIPS.map((entry) => {
            const on = chip === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={on}
                onClick={() => onChip(entry.key)}
                className={`${CHIP} ${
                  on
                    ? 'border-transparent bg-content-primary font-semibold text-content-inverse'
                    : 'border-stroke-default text-content-secondary hover:text-content-primary'
                }`}
              >
                {entry.label}
              </button>
            );
          })}
          {strayRoleLabel ? (
            <button
              type="button"
              aria-pressed
              onClick={onClearStrayRole}
              className={`${CHIP} border-transparent bg-content-primary font-semibold text-content-inverse`}
            >
              {strayRoleLabel} ×
            </button>
          ) : null}
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-content-primary">
          Open to work only
          <button
            type="button"
            role="switch"
            aria-checked={openOnly}
            aria-label="Open to work only"
            onClick={() => onOpenOnly(!openOnly)}
            className={`motion-focus relative h-5 w-8 rounded-full transition-colors ${
              openOnly ? 'bg-brand' : 'bg-stroke-default'
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-[left] ${
                openOnly ? 'left-[15px]' : 'left-[3px]'
              }`}
            />
          </button>
        </label>
      </div>
    </div>
  );
}

/** A face: their photo, or a flat initials tile (never a gradient). */
function Face({ name, photoUrl, size }: { name: string; photoUrl?: string | null; size: number }) {
  if (photoUrl) return <ProfileFace name={name} photoUrl={photoUrl} size={size} />;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bg-active font-semibold text-content-primary ${
        size >= 40 ? 'text-[13px]' : 'text-[11px]'
      }`}
      style={{ width: size, height: size }}
    >
      {profileInitials(name)}
    </span>
  );
}

function Tick({ size = 16 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Verified"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
    >
      ✓
    </span>
  );
}

function OpenMarker() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
      Open to work
    </span>
  );
}

const ROW = 'grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-3.5 xl:gap-4';

/** The list: one row per person, with Ask on the row. */
export function DirectoryDeskList({
  people,
  unclaimed,
  countLabel,
  canAsk,
  onAsk,
  empty,
}: {
  people: DeskPerson[];
  unclaimed: ListedUnclaimed[];
  countLabel: string;
  canAsk: (person: DeskPerson) => boolean;
  onAsk: (person: DeskPerson) => void;
  empty: ReactNode;
}) {
  if (people.length === 0 && unclaimed.length === 0) return <div>{empty}</div>;
  return (
    <div>
      <p className="mb-2 text-[13px] text-content-secondary">{countLabel}</p>
      <ul className={`${CARD} divide-y divide-stroke-subtle overflow-hidden`}>
        {people.map((person) => (
          <li key={person.userId} className={ROW}>
            <Face name={person.displayName} photoUrl={person.avatarUrl} size={40} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {person.isPublic && person.slug ? (
                  <Link
                    href={`/p/${person.slug}`}
                    onClick={() =>
                      captureAnalyticsEvent({
                        name: 'directory_profile_opened',
                        properties: { role: person.roles.find((held) => held.delivered > 0)?.role ?? person.roles[0]?.role ?? null },
                      })
                    }
                    className="motion-focus truncate text-sm font-semibold text-content-primary hover:underline"
                  >
                    {person.displayName}
                  </Link>
                ) : (
                  <span className="truncate text-sm font-semibold text-content-primary">{person.displayName}</span>
                )}
                {isVouched(person) ? <Tick /> : null}
              </div>
              {rowMeta(person) ? (
                <p className="truncate text-[13px] text-content-secondary">{rowMeta(person)}</p>
              ) : null}
            </div>
            <p
              className={`truncate text-[13px] ${
                person.roles.some((held) => held.delivered > 0) ? 'text-content-primary' : 'text-content-tertiary'
              }`}
            >
              {deliveredLine(person.roles)}
            </p>
            <span>
              {person.availability === 'open' ? (
                <OpenMarker />
              ) : (
                <span className="text-xs text-content-tertiary">
                  {PERSON_AVAILABILITY_COPY[person.availability]?.label ?? ''}
                </span>
              )}
            </span>
            {canAsk(person) ? (
              <button
                type="button"
                onClick={() => onAsk(person)}
                className="motion-focus inline-flex h-9 items-center rounded-full border border-stroke-default px-4 text-[13px] font-semibold text-content-primary hover:bg-bg-hover"
              >
                Ask
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
        {unclaimed.map((person) => (
          <li key={person.personId} className={ROW}>
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-dashed border-stroke-default text-xs font-semibold text-content-tertiary"
            >
              {profileInitials(person.displayName)}
            </span>
            <div className="min-w-0">
              <Link
                href={`/p/${person.slug}`}
                className="motion-focus truncate text-sm font-semibold text-content-primary hover:underline"
              >
                {person.displayName}
              </Link>
              {person.roleLabel ? (
                <p className="truncate text-[13px] text-content-secondary">{person.roleLabel}</p>
              ) : null}
            </div>
            <p className="truncate text-[13px] text-content-tertiary">Credited on a rollout</p>
            <span className="text-xs text-content-tertiary">Unclaimed</span>
            <span />
          </li>
        ))}
      </ul>
    </div>
  );
}

type OwnListing = {
  displayName: string;
  avatarUrl: string | null;
  line: string;
  listed: boolean;
} | null;

/** Your own profile, for the "You are listed" card. Null when you have none. */
function useOwnListing(): { listing: OwnListing; loaded: boolean } {
  const [listing, setListing] = useState<OwnListing>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/directory/profile', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          profile?: {
            displayName: string;
            avatarUrl?: string | null;
            city: string | null;
            availability: keyof typeof PERSON_AVAILABILITY_COPY;
            visibility: string;
            profileType?: ProfileType | null;
          } | null;
          roles?: ProfileRole[];
          view?: { location?: string | null; photoUrl?: string | null } | null;
        } | null;
        const profile = body?.profile;
        if (cancelled || !profile) return;
        const role = roleLine({
          roles: body?.roles ?? [],
          profileType: profile.profileType ?? null,
          city: body?.view?.location || profile.city,
        });
        const open = PERSON_AVAILABILITY_COPY[profile.availability]?.label;
        setListing({
          displayName: profile.displayName,
          avatarUrl: body?.view?.photoUrl ?? profile.avatarUrl ?? null,
          line: [role, open].filter(Boolean).join(' · '),
          listed: profile.visibility !== 'private',
        });
      } catch {
        // The card falls back to "not listed yet"; nothing else depends on it.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { listing, loaded };
}

const NEEDS_SHOWN = 4;
const ASKS_SHOWN = 4;

/** The right column: about you, not about them. */
export function DirectoryDeskAside({
  onFind,
  onAllAsks,
  onEditListing,
}: {
  onFind: (need: { role: string; releaseId: string; taskId: string }) => void;
  onAllAsks: () => void;
  onEditListing: () => void;
}) {
  const viewerId = useAuthStore((state) => state.user?.id ?? '');
  const releases = useReleaseStore((state) => state.releases);
  const tasks = useTaskStore((state) => state.tasks);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  const needs = useMemo(
    () =>
      rolloutNeeds(
        releases,
        tasks.map((task) => ({
          id: task.id,
          releaseId: task.releaseId,
          templateTaskId: task.templateTaskId,
          assignedToUserId: task.assignedToUserId,
          status: task.status,
          dueDate: task.dueDate,
          title: task.title,
        })),
        viewerId
      ),
    [releases, tasks, viewerId]
  );
  const titleOf = useMemo(() => new Map(releases.map((release) => [release.id, release.title])), [releases]);
  const coverOf = useMemo(
    () => new Map(releases.map((release) => [release.id, release.coverThumbUrl || release.coverArtUrl || null])),
    [releases]
  );
  const { requests, loaded: asksLoaded } = useSentRequests();
  const { listing, loaded: listingLoaded } = useOwnListing();

  return (
    <aside className="flex flex-col gap-4">
      {needs.length > 0 ? (
        <section className={`${CARD} p-5`}>
          <h2 className="mb-3 text-sm font-semibold text-content-primary">Your rollouts need</h2>
          <ul className="divide-y divide-stroke-subtle">
            {needs.slice(0, NEEDS_SHOWN).map((need) => {
              const due = formatCalendarDate(need.dueDate);
              const cover = coverOf.get(need.releaseId);
              return (
                <li key={`${need.releaseId}:${need.role}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span aria-hidden className="h-10 w-10 shrink-0 rounded-md bg-bg-active" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content-primary">{neededLabel(need.role)}</span>
                    <span className="line-clamp-2 block text-[13px] text-content-secondary">
                      {need.releaseTitle} · {need.taskTitle}
                      {due ? ` · due ${due}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onFind({ role: need.role, releaseId: need.releaseId, taskId: need.taskId })}
                    className="motion-focus shrink-0 text-[13px] font-semibold text-brand underline underline-offset-[3px]"
                  >
                    Show
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {asksLoaded && requests.length > 0 ? (
        <section className={`${CARD} p-5`}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-content-primary">Your asks</h2>
            <button
              type="button"
              onClick={onAllAsks}
              className="motion-focus text-[13px] font-medium text-brand hover:underline"
            >
              All
            </button>
          </div>
          <ul className="divide-y divide-stroke-subtle">
            {requests.slice(0, ASKS_SHOWN).map((request) => {
              const release = request.release_id ? titleOf.get(request.release_id) : null;
              const role = DIRECTORY_ROLE_LABELS[request.role] || request.role;
              return (
                <li key={request.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Face name={request.recipient_name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content-primary">{request.recipient_name}</span>
                    <span className="block truncate text-[13px] text-content-secondary">
                      {release ? `${role} for ${release}` : role}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 text-xs font-semibold leading-5 ${
                      request.status === 'interested'
                        ? 'bg-brand/10 text-brand'
                        : 'bg-bg-hover text-content-secondary'
                    }`}
                  >
                    {describeRequestStatus(request.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {listingLoaded ? (
        <section className={`${CARD} flex items-center gap-3 p-5`}>
          <Face name={listing?.displayName || '?'} photoUrl={listing?.avatarUrl} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-content-primary">
              {listing?.listed ? 'You are listed' : 'You are not listed yet'}
            </span>
            <span className="block truncate text-[13px] text-content-secondary">
              {listing?.listed ? listing.line : 'Get found for the work you deliver.'}
            </span>
          </span>
          <button
            type="button"
            onClick={onEditListing}
            className="motion-focus shrink-0 text-[13px] font-semibold text-brand underline underline-offset-[3px]"
          >
            {listing?.listed ? 'Edit' : 'List me'}
          </button>
        </section>
      ) : null}
    </aside>
  );
}
