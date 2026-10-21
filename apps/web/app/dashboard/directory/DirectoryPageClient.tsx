'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  applyDirectoryFilters,
  fallbackCounts,
  type DirectoryEntry,
  type DirectoryFilters,
} from '@/lib/directory-search';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import { DIRECTORY_CHIPS, activeChip, chipFilters, isVouched, rowMeta } from '@/lib/directory-chips';
import type { ListedUnclaimed } from '@/lib/directory-unclaimed-server';
import { DIRECTORY_SETTINGS_ANCHOR, PERSON_AVAILABILITIES } from '@/lib/person-profile';
import type { PersonAvailability } from '@/types/directory';
import { DirectoryEmptyState } from '@/components/directory/DirectoryEmptyState';
import { WorkRequestSheet } from '@/components/directory/WorkRequestSheet';
import { canReceiveRequests } from '@/lib/work-requests';
import {
  canShowMessageButton,
  isProfileType,
  orderForViewer,
  type ProfileType,
} from '@/lib/directory-profile-type';
import { DirectoryShelves } from '@/components/directory/DirectoryShelves';
import { DirectoryInvites } from '@/components/directory/DirectoryInvites';
import type { ShelfPerson } from '@/lib/featured-shelves-server';

import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { ProfileFace, profileInitials } from '@/components/shared/ProfileFace';
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
      {/* The Directory tab above names the page (URG-304: no title, no
          subtitle on any width). */}
      <h1 className="sr-only">Directory</h1>
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
  const [unclaimed, setUnclaimed] = useState<ListedUnclaimed[]>([]);
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
        setUnclaimed(Array.isArray(body.unclaimed) ? body.unclaimed : []);
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
    !filters.query.trim() && !filters.role && !filters.city && !filters.availability && !filters.profileType;

  const patch = useCallback(
    (next: Partial<DirectoryFilters>) => setFilters((current) => ({ ...current, ...next })),
    []
  );

  if (!DIRECTORY_ENABLED) return null;

  const chip = activeChip(filters);
  // Unclaimed pages ride along only in the plain views: All, or a typed name.
  // Their role is a credit, not a delivery record, so no role, type, city or
  // availability filter ever matches one.
  const unclaimedShown =
    !filters.role && !filters.profileType && !filters.city && !filters.availability
      ? unclaimedMatching(unclaimed, filters.query)
      : [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="sr-only">Directory</h1>

      {!loaded ? (
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="sr-only">Opening the directory</span>
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-status-error">{error}</p>
      ) : (
        <>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="Search"
            aria-label="Search"
            className="motion-focus h-[46px] w-full rounded-[14px] border border-stroke-control bg-bg-surface px-4 text-[15px] text-content-primary placeholder:text-content-tertiary"
          />

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Role">
            {DIRECTORY_CHIPS.map((entry) => {
              const on = chip === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    patch(
                      entry.key === 'all'
                        ? { ...chipFilters('all'), city: null, availability: null }
                        : chipFilters(entry.key)
                    )
                  }
                  className={`hit-44 relative motion-focus rounded-full border px-3.5 py-2 text-[13px] font-bold ${
                    on
                      ? 'border-transparent bg-content-primary text-content-inverse'
                      : 'border-stroke-default text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
            {/* A role a link brought in (the role gaps panel) that no chip
                names: shown so it can be seen and cleared. */}
            {chip === null && filters.role ? (
              <button
                type="button"
                aria-pressed
                onClick={() => patch(chipFilters('all'))}
                className="hit-44 relative motion-focus rounded-full border border-transparent bg-content-primary px-3.5 py-2 text-[13px] font-bold text-content-inverse"
              >
                {DIRECTORY_ROLE_LABELS[filters.role]} ×
              </button>
            ) : null}
          </div>

          {/* The Rising shelf is for browsing, so it steps aside the moment
              somebody searches or filters. Results are never ranked by it. */}
          <div className="mt-5">
            {isDefaultView ? (
              <DirectoryShelves featured={shelves.featured} onTheRise={shelves.onTheRise} />
            ) : null}
          </div>

          {results.length === 0 && unclaimedShown.length === 0 ? (
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
            <ul className="-mx-1">
              {results.map((person) => (
                <li key={person.userId}>
                  <PersonRow
                    person={person}
                    // Somebody who is "Not taking work" is listed and findable
                    // but cannot be asked, and the server refuses it too. The
                    // row is the courtesy; the route is the rule. The type rule
                    // decides it too (canShowMessageButton).
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
              {unclaimedShown.map((person) => (
                <li key={person.personId}>
                  <UnclaimedRow person={person} />
                </li>
              ))}
            </ul>
          )}

          {sent ? (
            <p className="mt-4 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-content-primary">
              {sent}
            </p>
          ) : null}

          {/* Invite your producers, engineers and directors (#834). Draws
              nothing until the server says invites are ready. */}
          <div className="mt-6">
            <DirectoryInvites />
          </div>
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

function unclaimedMatching(list: ListedUnclaimed[], query: string): ListedUnclaimed[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return list;
  return list.filter((person) => {
    const name = person.displayName.toLowerCase();
    return terms.every((term) => name.includes(term));
  });
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

const ROW = 'flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left';

function Tick() {
  return (
    <span
      aria-label="Verified"
      className="ml-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[9px] font-black text-black"
    >
      ✓
    </span>
  );
}

/** A compact row: face, name + tick, role · city (URG-304). */
function PersonRow({ person, onAsk }: { person: Person; onAsk: (() => void) | null }) {
  const role = person.roles.find((entry) => entry.delivered > 0)?.role ?? person.roles[0]?.role ?? null;
  const meta = rowMeta(person);
  const body = (
    <>
      <ProfileFace name={person.displayName} photoUrl={person.avatarUrl} size={52} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center">
          <span className="truncate font-display text-base text-content-primary">{person.displayName}</span>
          {isVouched(person) ? <Tick /> : null}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate font-mono text-[13px] text-content-secondary">{meta}</span>
        ) : null}
      </span>
    </>
  );

  // A public profile opens its page. Otherwise, somebody who can be asked
  // opens the request sheet; anyone else is a plain row.
  if (person.isPublic && person.slug) {
    return (
      <Link
        href={`/p/${person.slug}`}
        className={`motion-focus ${ROW} hover:bg-bg-hover`}
        onClick={() =>
          captureAnalyticsEvent({ name: 'directory_profile_opened', properties: { role } })
        }
      >
        {body}
      </Link>
    );
  }
  if (onAsk) {
    return (
      <button type="button" onClick={onAsk} className={`motion-focus ${ROW} hover:bg-bg-hover`}>
        {body}
      </button>
    );
  }
  return <div className={ROW}>{body}</div>;
}

/** An unclaimed page: dashed monogram, name + Unclaimed, credited role. */
function UnclaimedRow({ person }: { person: ListedUnclaimed }) {
  return (
    <Link href={`/p/${person.slug}`} className={`motion-focus ${ROW} hover:bg-bg-hover`}>
      <span
        aria-hidden
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-white/25 text-[17px] font-extrabold text-white/60"
      >
        {profileInitials(person.displayName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center">
          <span className="truncate font-display text-base text-content-primary">{person.displayName}</span>
          <span className="ml-1.5 shrink-0 rounded-full border border-stroke-default px-2 py-0.5 text-[11px] font-bold text-content-secondary">
            Unclaimed
          </span>
        </span>
        {person.roleLabel ? (
          <span className="mt-0.5 block truncate font-mono text-[13px] text-content-secondary">{person.roleLabel}</span>
        ) : null}
      </span>
    </Link>
  );
}
