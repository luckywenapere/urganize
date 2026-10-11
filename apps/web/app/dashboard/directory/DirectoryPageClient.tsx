'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  applyDirectoryFilters,
  availableCities,
  fallbackCounts,
  type DirectoryEntry,
  type DirectoryFilters,
} from '@/lib/directory-search';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import {
  DIRECTORY_SETTINGS_ANCHOR,
  PERSON_AVAILABILITIES,
  PERSON_AVAILABILITY_COPY,
} from '@/lib/person-profile';
import type { PersonAvailability } from '@/types/directory';
import { DirectoryEmptyState } from '@/components/directory/DirectoryEmptyState';
import { WorkRequestSheet } from '@/components/directory/WorkRequestSheet';
import { canReceiveRequests } from '@/lib/work-requests';
import {
  PROFILE_TYPES,
  PROFILE_TYPE_LABELS,
  canShowMessageButton,
  isProfileType,
  openToLabel,
  orderForViewer,
  type ProfileType,
} from '@/lib/directory-profile-type';
import { DirectoryShelves } from '@/components/directory/DirectoryShelves';
import { DirectoryInvites } from '@/components/directory/DirectoryInvites';
import type { ShelfPerson } from '@/lib/featured-shelves-server';

import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { bucketResultCount, type DirectoryDemandSource } from '@/lib/directory-demand';

const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const REQUESTS_ENABLED =
  DIRECTORY_ENABLED && process.env.NEXT_PUBLIC_FEATURE_DIRECTORY_REQUESTS === 'true';

/**
 * Find somebody who has delivered the work a release needs.
 *
 * FILTERS IN THE BROWSER over a set fetched once. lib/directory-search.ts
 * carries the full reasoning; the short version is that the empty state has to
 * say how many people exist NEARBY, which is free with the set in hand and a
 * round trip per suggestion without it.
 *
 * A card links to /p/{slug} only for a PUBLIC profile. Somebody listed as
 * `directory` is findable here and their page is not open, so offering the link
 * would hand a manager a 404.
 */

type Person = DirectoryEntry & {
  slug: string | null;
  isPublic: boolean;
  /** One line of what they lead with, built on the server. Empty is fine. */
  lead?: string;
};

const NO_FILTERS: DirectoryFilters = {
  query: '',
  role: null,
  city: null,
  availability: null,
  profileType: null,
};

const controlClass =
  'h-11 rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none';

export function DirectoryPageClient() {
  return (
    <Suspense fallback={<DirectoryFrame />}>
      <DirectoryBody />
    </Suspense>
  );
}

/** The header alone, so the Suspense boundary below shows something real
 *  rather than nothing while the params resolve. */
function DirectoryFrame() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Title + subtitle hidden on desktop (founder call, 2026-10-11): the
          Directory tab above already names the page. Phones keep them. */}
      <header className="mb-6 lg:mb-0">
        <h1 className="font-display text-2xl text-content-primary lg:sr-only">Directory</h1>
        <p className="mt-1 text-sm text-content-secondary lg:hidden">
          Find people who have delivered the work your rollout needs.
        </p>
      </header>
    </div>
  );
}

function DirectoryBody() {
  const router = useRouter();
  const openSettings = useOpenSettings();
  // Read ONCE, into the initial state, never mirrored. The role gaps panel
  // links here pre-filtered (?role=…&availability=open), and after that the
  // filters belong to whoever is typing — keeping them in sync with the URL
  // would make every keystroke fight a param nobody set.
  const searchParams = useSearchParams();
  const [people, setPeople] = useState<Person[]>([]);
  // Where this visit's role filter came from. The role gaps panel links here
  // pre-filtered, and demand it created is worth telling apart from demand
  // somebody typed: it is the retention mechanic either working or not.
  // `from=task` is the activity pop-up's "Find someone": the same plan-driven
  // demand as the role gaps panel (the task IS the gap), so it reports as the
  // same source and the demand summary is left untouched.
  const arrivedFrom = searchParams.get('from');
  const arrivedFromRoleGaps = arrivedFrom === 'role_gaps' || arrivedFrom === 'task';
  const [filters, setFilters] = useState<DirectoryFilters>(() => {
    const role = searchParams.get('role');
    const availability = searchParams.get('availability');
    const type = searchParams.get('type');
    return {
      ...NO_FILTERS,
      profileType: isProfileType(type) ? type : null,
      // Validated against the real vocabularies rather than trusted: a link
      // carrying a role that no longer exists must filter nothing rather than
      // filter everything out.
      role: role && (DIRECTORY_ROLES as readonly string[]).includes(role)
        ? (role as DirectoryRole)
        : null,
      availability:
        availability && (PERSON_AVAILABILITIES as readonly string[]).includes(availability)
          ? (availability as PersonAvailability)
          : null,
    };
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);
  // Who is reading. Decides who comes first and who gets a Message button.
  const [viewerType, setViewerType] = useState<ProfileType>('manager');
  // The two shelves. Fetched with the list so they arrive together and never
  // push the results down after the page has painted. A failed read is no shelf.
  const [shelves, setShelves] = useState<{ featured: ShelfPerson[]; onTheRise: ShelfPerson[] }>({
    featured: [],
    onTheRise: [],
  });
  const [asking, setAsking] = useState<Person | null>(null);
  const [sent, setSent] = useState('');

  useEffect(() => {
    if (!DIRECTORY_ENABLED) {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [response, shelvesResponse] = await Promise.all([
          fetch('/api/directory', { headers, cache: 'no-store' }),
          fetch('/api/directory/shelves', { headers, cache: 'no-store' }).catch(() => null),
        ]);
        const body = await response.json().catch(() => ({}));
        const shelvesBody =
          shelvesResponse && shelvesResponse.ok ? await shelvesResponse.json().catch(() => null) : null;

        if (cancelled) return;

        if (!response.ok) {
          setError(typeof body.error === 'string' ? body.error : 'Could not open the directory.');
          return;
        }

        setPeople(Array.isArray(body.people) ? body.people : []);
        setShelves({
          featured: Array.isArray(shelvesBody?.featured) ? shelvesBody.featured : [],
          onTheRise: Array.isArray(shelvesBody?.onTheRise) ? shelvesBody.onTheRise : [],
        });
        setTruncated(Boolean(body.truncated));
        if (isProfileType(body.viewerType)) setViewerType(body.viewerType);
      } catch {
        if (!cancelled) setError('Could not open the directory. Check your connection.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const results = useMemo(() => {
    const filtered = applyDirectoryFilters(people, filters);
    // A typed search ranks by name. With nothing typed, the people a reader most
    // likely came for go first (managers for an artist, creatives for a manager).
    return filters.query.trim() ? filtered : orderForViewer(filtered, viewerType);
  }, [people, filters, viewerType]);

  // One report per settled filter, not per keystroke. The delay is what keeps
  // "designer" from also reporting d, de, des and desi.
  //
  // The role is reported to the SERVER only when there is a role: a search with
  // no role filter says nothing about which job is short, which is the only
  // question that durable row exists to answer.
  const reportedRef = useRef('');
  useEffect(() => {
    if (!loaded || error) return;

    const timer = window.setTimeout(() => {
      const signature = JSON.stringify([filters.query.trim(), filters.role, filters.city, filters.availability, filters.profileType]);
      if (reportedRef.current === signature) return;
      reportedRef.current = signature;

      captureAnalyticsEvent({
        name: 'directory_searched',
        properties: {
          has_query: filters.query.trim().length > 0,
          role: filters.role,
          availability: filters.availability,
          filtered_by_city: Boolean(filters.city),
          results: bucketResultCount(results.length),
        },
      });

      if (!filters.role) return;
      const source: DirectoryDemandSource = arrivedFromRoleGaps ? 'role_gap' : 'search';
      void reportRoleDemand({ role: filters.role, matched: results.length > 0, source });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [filters, results.length, loaded, error, arrivedFromRoleGaps]);

  const counts = useMemo(() => fallbackCounts(people, filters), [people, filters]);
  const isDefaultView =
    !filters.query.trim() && !filters.role && !filters.city && !filters.availability;
  const cities = useMemo(() => availableCities(people), [people]);

  const patch = useCallback(
    (next: Partial<DirectoryFilters>) => setFilters((current) => ({ ...current, ...next })),
    []
  );

  if (!DIRECTORY_ENABLED) return null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Title + subtitle hidden on desktop (founder call, 2026-10-11): the
          Directory tab above already names the page. Phones keep them. */}
      <header className="mb-6 lg:mb-0">
        <h1 className="font-display text-2xl text-content-primary lg:sr-only">Directory</h1>
        <p className="mt-1 text-sm text-content-secondary lg:hidden">
          Find people who have delivered the work your rollout needs.
        </p>
      </header>

      {!loaded ? (
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Opening the directory
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-status-error">{error}</p>
      ) : (
        <>
          {/* Invite your producers, engineers and directors (#834). Draws
              nothing until the server says invites are ready. */}
          <DirectoryInvites />

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="Search by name"
              aria-label="Search by name"
              className={`${controlClass} sm:col-span-2 lg:col-span-3`}
            />
            <select
              value={filters.role ?? ''}
              onChange={(event) => patch({ role: (event.target.value || null) as DirectoryRole | null })}
              aria-label="Filter by role"
              className={controlClass}
            >
              <option value="">Any role</option>
              {DIRECTORY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {DIRECTORY_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <select
              value={filters.profileType ?? ''}
              onChange={(event) =>
                patch({ profileType: (event.target.value || null) as ProfileType | null })
              }
              aria-label="Filter by profile type"
              className={controlClass}
            >
              <option value="">Any type</option>
              {PROFILE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROFILE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <select
              value={filters.city ?? ''}
              onChange={(event) => patch({ city: event.target.value || null })}
              aria-label="Filter by city"
              className={controlClass}
            >
              <option value="">Anywhere</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <select
              value={filters.availability ?? ''}
              onChange={(event) =>
                patch({ availability: (event.target.value || null) as PersonAvailability | null })
              }
              aria-label="Filter by what they are open to"
              className={controlClass}
            >
              <option value="">Open to: any</option>
              {PERSON_AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {PERSON_AVAILABILITY_COPY[value].label}
                </option>
              ))}
            </select>
          </div>

          {/* Shelves are for browsing, so they step aside the moment somebody
              searches or filters. Search results are never ranked or mixed
              with them. */}
          {isDefaultView ? (
            <DirectoryShelves
              featured={shelves.featured}
              onTheRise={shelves.onTheRise}
              renderCard={(person) => (
                <PersonCard
                  person={person}
                  onAsk={
                    REQUESTS_ENABLED && canReceiveRequests(person.availability)
                      ? () => setAsking(person)
                      : null
                  }
                />
              )}
            />
          ) : null}

          {results.length === 0 ? (
            <DirectoryEmptyState
              nobodyListed={people.length === 0}
              counts={counts}
              role={filters.role}
              city={filters.city}
              hasQuery={filters.query.trim().length > 0}
              onClearQuery={() => patch({ query: '' })}
              onDropRole={() => patch({ role: null })}
              onDropCity={() => patch({ city: null })}
              onShowOpen={() => setFilters({ ...NO_FILTERS, availability: 'open' })}
              onListMe={() =>
                openSettings({ segment: 'directory', section: DIRECTORY_SETTINGS_ANCHOR })
              }
            />
          ) : (
            <ul className="space-y-3">
              {results.map((person) => (
                <li key={person.userId}>
                  <PersonCard
                    person={person}
                    // Somebody who is "Not taking work" is listed and findable
                    // but cannot be asked, and the server refuses it too. The
                    // button is the courtesy; the route is the rule.
                    // The Message button also follows the type rule: an artist is
                    // offered managers who are taking artists, a manager is
                    // offered people who are open to hire.
                    onAsk={
                      REQUESTS_ENABLED &&
                      canReceiveRequests(person.availability) &&
                      canShowMessageButton({
                        targetType: person.profileType ?? null,
                        availability: person.availability,
                        viewerType,
                      })
                        ? () => setAsking(person)
                        : null
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {sent ? (
            <p className="mt-4 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-content-primary">
              {sent}
            </p>
          ) : null}

          {truncated ? (
            <p className="mt-4 text-xs text-content-tertiary">
              Showing the most recently updated profiles. Narrow the filters to see others.
            </p>
          ) : null}
        </>
      )}

      {asking ? (
        <WorkRequestSheet
          person={asking}
          // Prefilled when the manager arrived from the role gaps panel, which
          // is the whole point of that link: the plan already knows the job.
          defaultRole={filters.role ?? (asking.profileType === 'manager' ? 'manager' : null)}
          releaseId={arrivedFromRoleGaps ? searchParams.get('release') : null}
          taskId={arrivedFromRoleGaps ? searchParams.get('task') : null}
          onClose={() => setAsking(null)}
          onSent={setSent}
        />
      ) : null}
    </div>
  );
}

/** Fire and forget, deliberately. This is a beacon on somebody else's
 *  keystroke: the route answers 202 whatever it makes of the payload, and a
 *  failure here must never surface as a failure of the search being run. */
async function reportRoleDemand(demand: {
  role: DirectoryRole;
  matched: boolean;
  source: DirectoryDemandSource;
}) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/directory/demand', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(demand),
      keepalive: true,
    });
  } catch {
    // Nothing to do and nobody to tell.
  }
}

function PersonCard({ person, onAsk }: { person: Person; onAsk: (() => void) | null }) {
  const delivered = person.roles.filter((entry) => entry.delivered > 0);
  const claimed = person.roles.filter((entry) => entry.delivered === 0);

  const body = (
    <div className="rounded-xl border border-stroke-default p-4 transition-colors hover:border-brand">
      {/* Face first (2026-10-11): hiring is person to person, and a list of
          faces is scanned faster than a list of names. No photo is initials
          on a gradient, never a grey silhouette. */}
      <div className="flex items-start gap-3">
        <ProfileFace name={person.displayName} photoUrl={person.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="truncate text-base font-semibold text-content-primary">{person.displayName}</span>
            <span className="text-xs text-content-tertiary">
              {openToLabel(person.profileType ?? null, person.availability)}
              {person.city ? ` · ${person.city}` : ''}
            </span>
          </div>

          {person.profileType ? (
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-content-tertiary">
              {PROFILE_TYPE_LABELS[person.profileType]}
            </p>
          ) : null}
        </div>
      </div>

      {/* What this type leads with. Empty for a creative, whose lead is the
          delivered credits just below, and never a zero. */}
      {person.lead ? (
        <p className="mt-2 text-sm text-content-primary">{person.lead}</p>
      ) : null}

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
