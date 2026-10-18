'use client';

// /admin/more (2026-10-18, URG-369; a list first since the phone bottom bar,
// 2026-10-18, founder approved the mock): a search field, one Runway row,
// then every dashboard the tabs do not carry, grouped into Numbers /
// Operations / Content, and on phone "Back to catalog" at the foot (the
// desktop sidebar carries its own). Teams and Emails are tabs, so they are not
// listed here. Rows are labels only on phone; the one-line descriptions show
// on desktop and are still searched on both. Reports and Pitch payments carry
// the same "N waiting" badge as the Overview.
//
// Gate: GET /api/admin/me (verifyAdmin / ADMIN_EMAILS), anyone else bounces to
// /dashboard, as on every admin page. The Runway row opens a sheet whose form
// saves through PUT /api/admin/runway (DELETE to clear), then the cockpit is
// read again so runway is worked out on the server, in one place.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, LayoutDashboard, LogOut, Search, Wallet2 } from '@/components/icons';
import { ADMIN_SECTION_ICONS } from '@/components/admin/AdminNav';
import { ADMIN_SECTION_GROUPS, matchesSearch, moreSectionsInGroup } from '@/lib/admin-sections';
import { attentionRows, type AdminOverview } from '@/lib/admin-overview';
import { runwayRowValue } from '@/lib/admin-runway-format';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { useCockpit } from '@/components/admin/CockpitSlot';
import { RunwaySheet, type RunwayFormValues } from '@/components/admin/RunwayPanel';
import { Badge, Card, SectionLabel, Separator, Skeleton } from '@/components/admin/ui';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function writeRunway(method: 'PUT' | 'DELETE', values?: RunwayFormValues): Promise<string | null> {
  try {
    const response = await fetch('/api/admin/runway', {
      method,
      headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
      body: values ? JSON.stringify(values) : undefined,
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return response.ok ? null : body.error || 'Could not save the figures.';
  } catch {
    return 'Could not save the figures.';
  }
}

/** The "N waiting" counts the Overview shows, keyed by section, for the badges. */
function useWaiting(): Record<string, number> {
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/overview', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
          cache: 'no-store',
        });
        const body = (await response.json().catch(() => ({}))) as { overview?: AdminOverview };
        if (cancelled || !response.ok || !body.overview) return;
        const counts: Record<string, number> = {};
        for (const row of attentionRows(body.overview.attention)) counts[row.key] = row.count;
        setWaiting(counts);
      } catch {
        // The badges are a nicety: without them the rows still open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return waiting;
}

const RUNWAY_ROW = { label: 'Runway', description: 'Cash, spend, and whether we are default alive.' };
const ROW = 'motion-focus group flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover';

function Chevron() {
  return (
    <ChevronRight
      className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5"
      aria-hidden="true"
    />
  );
}

function RowText({ label, description }: { label: string; description: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-content-primary">{label}</span>
      <span className="hidden truncate text-xs text-content-secondary lg:block">{description}</span>
    </span>
  );
}

export default function MoreAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        setChecked(true);
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  if (authLoading || !user || !checked) {
    return <AdminPageSkeleton titleWidth="w-28" table={{ columns: 2, rows: 10 }} />;
  }

  return <MoreList />;
}

/** The page once the gate has passed, so its reads go out with a session. */
function MoreList() {
  const [query, setQuery] = useState('');
  const [runwayOpen, setRunwayOpen] = useState(false);
  const { state: cockpit, reload } = useCockpit();
  const waiting = useWaiting();

  const groups = useMemo(
    () =>
      ADMIN_SECTION_GROUPS.map((group) => ({
        ...group,
        sections: moreSectionsInGroup(group.key).filter((section) => matchesSearch(section, query)),
      })).filter((group) => group.sections.length > 0),
    [query]
  );

  const showRunway = matchesSearch(RUNWAY_ROW, query);
  const nothing = !showRunway && groups.length === 0;
  const runway = cockpit.status === 'ready' ? cockpit.payload.runway : null;
  const readable = cockpit.status === 'ready' ? cockpit.payload.runwayReadable : true;
  // The sheet opens only once the figures are known (or known to be unset),
  // so it never prefills from nothing. A failed read can't be edited over.
  const runwayReady = cockpit.status === 'ready' && readable;

  return (
    <div className="lg:max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-content-primary">More</h1>

      <label className="relative mt-5 block">
        <span className="sr-only">Search dashboards</span>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search dashboards"
          autoComplete="off"
          className="input h-12 w-full rounded-2xl border-stroke-control bg-bg-surface pl-11"
        />
      </label>

      {nothing ? (
        <Card className="mt-5 p-4 text-sm text-content-secondary" role="status">
          No dashboard called &ldquo;{query.trim()}&rdquo;
        </Card>
      ) : null}

      {showRunway ? (
        <Card className="mt-5 overflow-hidden">
          <button
            type="button"
            onClick={() => setRunwayOpen(true)}
            disabled={!runwayReady}
            aria-haspopup="dialog"
            className={`${ROW} disabled:cursor-default disabled:hover:bg-transparent`}
          >
            <Wallet2 className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
            <RowText {...RUNWAY_ROW} />
            {cockpit.status === 'loading' ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <span className="shrink-0 font-mono text-xs tabular-nums text-content-tertiary">
                {cockpit.status === 'error' ? 'Not read' : runwayRowValue(runway, readable)}
              </span>
            )}
            <Chevron />
          </button>
        </Card>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`more-${group.key}`} className="mt-8">
          <SectionLabel id={`more-${group.key}`}>{group.label}</SectionLabel>
          <Card className="overflow-hidden">
            <ul>
              {group.sections.map((section, index) => {
                const Icon = ADMIN_SECTION_ICONS[section.key] ?? LayoutDashboard;
                const count = waiting[section.key] ?? 0;
                return (
                  <li key={section.href}>
                    {index > 0 ? <Separator className="ml-11" /> : null}
                    <Link href={section.href} className={ROW}>
                      <Icon className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                      <RowText label={section.label} description={section.description} />
                      {count > 0 ? <Badge variant="destructive">{count} waiting</Badge> : null}
                      <Chevron />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}

      {/* The way out on phone (the top "Catalog" link went with the strip);
          the desktop sidebar keeps its own "Back to catalog". */}
      <Link
        href="/dashboard"
        className="motion-focus mt-8 flex min-h-12 items-center gap-3 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary lg:hidden"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
        Back to catalog
      </Link>

      {runwayOpen && runwayReady ? (
        <RunwaySheet
          runway={runway}
          onClose={() => setRunwayOpen(false)}
          onSave={async (values) => {
            const error = await writeRunway('PUT', values);
            if (!error) await reload();
            return error;
          }}
          onClear={async () => {
            const error = await writeRunway('DELETE');
            if (!error) await reload();
            return error;
          }}
        />
      ) : null}
    </div>
  );
}
