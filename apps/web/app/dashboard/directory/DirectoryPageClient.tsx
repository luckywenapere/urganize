'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  applyDirectoryFilters,
  availableCities,
  fallbackCounts,
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
import { DirectoryShelves } from '@/components/directory/DirectoryShelves';
import { PersonCard, type DirectoryPerson } from '@/components/directory/PersonCard';
import { WorkRequestSheet } from '@/components/directory/WorkRequestSheet';
import { canReceiveRequests } from '@/lib/work-requests';
import type { Shelf } from '@/lib/directory-featuring';

import { captureAnalyticsEvent } from '@/lib/analytics/client';
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

type Person = DirectoryPerson;

const NO_FILTERS: DirectoryFilters = { query: '', role: null, city: null, availability: null };

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
      <header className="mb-6">
        <h1 className="font-display text-2xl text-content-primary">Directory</h1>
        <p className="mt-1 text-sm text-content-secondary">
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
  const arrivedFromRoleGaps = searchParams.get('from') === 'role_gaps';
  const [filters, setFilters] = useState<DirectoryFilters>(() => {
    const role = searchParams.get('role');
    const availability = searchParams.get('availability');
    return {
      ...NO_FILTERS,
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
  const [asking, setAsking] = useState<Person | null>(null);
  const [sent, setSent] = useState('');
  // Featured and On the rise. An extra at the top, never a reason the page
  // fails: it loads on its own and a failure just leaves it out.
  const [shelves, setShelves] = useState<Shelf[]>([]);

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

      // Asked for in parallel and awaited separately, so the list never waits
      // on the shelves.
      const shelvesRequest = fetch('/api/directory/shelves', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);

      try {
        const response = await fetch('/api/directory', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          setError(typeof body.error === 'string' ? body.error : 'Could not open the directory.');
          return;
        }

        setPeople(Array.isArray(body.people) ? body.people : []);
        setTruncated(Boolean(body.truncated));
      } catch {
        if (!cancelled) setError('Could not open the directory. Check your connection.');
      } finally {
        if (!cancelled) setLoaded(true);
      }

      const shelfBody = await shelvesRequest;
      if (!cancelled && shelfBody && Array.isArray(shelfBody.shelves)) {
        setShelves(shelfBody.shelves as Shelf[]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const results = useMemo(() => applyDirectoryFilters(people, filters), [people, filters]);

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
      const signature = JSON.stringify([filters.query.trim(), filters.role, filters.city, filters.availability]);
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
  const cities = useMemo(() => availableCities(people), [people]);

  const patch = useCallback(
    (next: Partial<DirectoryFilters>) => setFilters((current) => ({ ...current, ...next })),
    []
  );

  if (!DIRECTORY_ENABLED) return null;

  // The shelves are for browsing. The moment somebody searches or filters they
  // know what they want, and shelves above the results would just push it down.
  const isFiltering =
    filters.query.trim().length > 0 ||
    filters.role !== null ||
    filters.city !== null ||
    filters.availability !== null;

  const askFor = (person: Person) =>
    // Somebody who is "Not taking work" is listed and findable but cannot be
    // asked, and the server refuses it too. The button is the courtesy; the
    // route is the rule.
    REQUESTS_ENABLED && canReceiveRequests(person.availability) ? () => setAsking(person) : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-content-primary">Directory</h1>
        <p className="mt-1 text-sm text-content-secondary">
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
          {isFiltering ? null : <DirectoryShelves shelves={shelves} onAsk={askFor} />}

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="Search by name"
              aria-label="Search by name"
              className={`${controlClass} sm:col-span-2 lg:col-span-1`}
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
              aria-label="Filter by availability"
              className={controlClass}
            >
              <option value="">Any availability</option>
              {PERSON_AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {PERSON_AVAILABILITY_COPY[value].label}
                </option>
              ))}
            </select>
          </div>

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
                  <PersonCard person={person} onAsk={askFor(person)} />
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
          defaultRole={filters.role}
          releaseId={arrivedFromRoleGaps ? searchParams.get('release') : null}
          // The activity the manager came from ("Find someone" on a job), so a
          // yes puts the person on that activity and not just on the rollout.
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
