'use client';

// Short links (2026-11-27, #1409): taps and sign-ups from each
// go.urganize.app link (TikTok, Instagram, X ...), this week against last
// week, and what the sign-ups went on to do. Counts and rules come from
// GET /api/admin/source-links (lib/admin-source-links.ts). Access is gated
// server-side by ADMIN_EMAILS: the GET doubles as the check and anyone else is
// sent to /dashboard, the /admin/nps pattern.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import {
  SOURCE_LINK_PLAN_LABEL,
  formatSignupRate,
  type SourceLinkStats,
  type SourceLinkWindow,
} from '@/lib/admin-source-links';
import { weekChange } from '@/lib/founder-cockpit';
import { formatWeekChange } from '@/lib/founder-cockpit-format';
import { SOURCE_LINKS } from '@/lib/source-links';

type SourceLinksResponse = SourceLinkStats & {
  host: string;
  notRead: { taps: boolean; signups: boolean; accounts: boolean; after: boolean };
};

const wholeNumber = new Intl.NumberFormat('en-US');

/** "27 Nov 2026" on the Lagos clock, where the weeks are cut. */
function formatDay(value: string | null): string {
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
}

function n(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not tracked' : wholeNumber.format(value);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

function weekHint(window: SourceLinkWindow | null): string | undefined {
  return window ? formatWeekChange(weekChange(window.thisWeek, window.lastWeek)) : undefined;
}

function WindowCells({ window }: { window: SourceLinkWindow | null }) {
  if (!window) {
    return (
      <td colSpan={3} className="px-4 py-3 text-content-tertiary">
        Not tracked
      </td>
    );
  }
  return (
    <>
      <td className="px-4 py-3 font-mono font-semibold text-content-primary">{wholeNumber.format(window.thisWeek)}</td>
      <td className="px-4 py-3 font-mono text-content-secondary">{wholeNumber.format(window.lastWeek)}</td>
      <td className="px-4 py-3 font-mono text-content-secondary">{wholeNumber.format(window.all)}</td>
    </>
  );
}

export default function SourceLinksAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [data, setData] = useState<SourceLinksResponse | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch('/api/admin/source-links', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as SourceLinksResponse | null;
        if (!cancelled && payload) setData(payload);
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  if (authLoading || !user || !data) {
    return (
      <AdminPageSkeleton
        titleWidth="w-40"
        descriptionLines={2}
        statCards={{ count: 4, gridClassName: 'grid-cols-2 sm:grid-cols-4', hint: true }}
        sections={[
          // One row per link on the list, plus two for the taller two-line
          // header, so the table lands at its real height.
          { table: { columns: 6, rows: SOURCE_LINKS.length + 2 } },
          { table: { columns: 5, rows: 4 } },
        ]}
      />
    );
  }

  const { totals, rows, recentSignups, host } = data;
  const since = formatDay(data.countingSince);

  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-semibold">Short links</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Where people come from: taps and sign-ups for each {host} link. Weeks run Monday to Sunday, Lagos time. Our own
        accounts are left out of sign-ups. {since ? `Counting since ${since}.` : 'Nothing counted yet.'}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Taps this week" value={n(totals.taps?.thisWeek)} hint={weekHint(totals.taps) ?? 'Not tracked'} />
        <StatCard
          label="Sign-ups this week"
          value={n(totals.signups?.thisWeek)}
          hint={weekHint(totals.signups) ?? 'Not tracked'}
        />
        <StatCard label="Taps, all" value={n(totals.taps?.all)} hint={since ? `Since ${since}` : 'None yet'} />
        <StatCard
          label="Sign-ups, all"
          value={n(totals.signups?.all)}
          hint={`${wholeNumber.format(totals.withRollout)} made a rollout, ${wholeNumber.format(totals.paying)} paying`}
        />
      </div>

      {!data.tracked ? (
        <p className="mt-4 max-w-2xl text-xs text-content-tertiary">
          Taps and sign-ups are not tracked yet. Apply the source_link_events migration to start counting.
        </p>
      ) : null}

      <section aria-labelledby="source-links-by-link" className="mt-8">
        <h2 id="source-links-by-link" className="text-base font-semibold text-content-primary">
          By link
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-content-secondary">
          Most sign-ups first. Each link is {host} and the short name beside it. The rate is sign-ups for every 100
          taps, over everything counted. Rollout and Paying count the sign-ups who made a rollout or pay today.
        </p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-stroke-subtle bg-bg-surface font-mono text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
                <th rowSpan={2} className="px-4 py-3 align-bottom">
                  Link
                </th>
                <th colSpan={3} className="px-4 pb-1 pt-3">
                  Taps
                </th>
                <th colSpan={3} className="px-4 pb-1 pt-3">
                  Sign-ups
                </th>
                <th rowSpan={2} className="px-4 py-3 align-bottom">
                  Rate
                </th>
                <th rowSpan={2} className="px-4 py-3 align-bottom">
                  Rollout
                </th>
                <th rowSpan={2} className="px-4 py-3 align-bottom">
                  Paying
                </th>
              </tr>
              <tr className="border-b border-stroke-default bg-bg-surface font-mono text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
                <th className="px-4 pb-3 pt-1 font-normal">This week</th>
                <th className="px-4 pb-3 pt-1 font-normal">Last week</th>
                <th className="px-4 pb-3 pt-1 font-normal">All</th>
                <th className="px-4 pb-3 pt-1 font-normal">This week</th>
                <th className="px-4 pb-3 pt-1 font-normal">Last week</th>
                <th className="px-4 pb-3 pt-1 font-normal">All</th>
              </tr>
            </thead>
            {/* One line per link: nothing in the body wraps, so the table keeps the height the skeleton reserved. */}
            <tbody className="divide-y divide-stroke-subtle whitespace-nowrap">
              {rows.map((row) => (
                <tr key={row.slug} className="align-top hover:bg-bg-hover">
                  <td className="px-4 py-3">
                    <span className="font-medium text-content-primary">{row.listed ? row.label : 'Removed link'}</span>
                    <span className="ml-2 font-mono text-xs text-content-tertiary">/{row.slug}</span>
                  </td>
                  <WindowCells window={row.taps} />
                  <WindowCells window={row.signups} />
                  <td className="px-4 py-3 text-content-secondary">
                    {row.taps && row.signups ? formatSignupRate(row.ratePercent) : 'Not tracked'}
                  </td>
                  <td className="px-4 py-3 font-mono text-content-secondary">{wholeNumber.format(row.withRollout)}</td>
                  <td className="px-4 py-3 font-mono text-content-secondary">{wholeNumber.format(row.paying)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="source-links-signups" className="mt-12">
        <h2 id="source-links-signups" className="text-base font-semibold text-content-primary">
          Latest sign-ups
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-content-secondary">
          The newest {recentSignups.length === 1 ? 'person' : 'people'} who made a team after tapping a link, and
          where they stand today.
        </p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-stroke-default bg-bg-surface font-mono text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3">Rollout</th>
                <th className="px-4 py-3">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {recentSignups.map((person) => (
                <tr key={person.userId} className="align-top hover:bg-bg-hover">
                  <td className="px-4 py-3">
                    <p className="font-medium text-content-primary">{person.name || 'No name yet'}</p>
                    <p className="text-xs text-content-tertiary">{person.email || 'No email'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-content-primary">{person.label}</p>
                    <p className="font-mono text-xs text-content-tertiary">
                      {host}/{person.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-content-secondary">{formatDay(person.at)}</td>
                  <td className="px-4 py-3 text-content-secondary">{person.hasRollout ? 'Made one' : 'Not yet'}</td>
                  <td className="px-4 py-3 text-content-secondary">{SOURCE_LINK_PLAN_LABEL[person.plan]}</td>
                </tr>
              ))}
              {recentSignups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-content-tertiary">
                    {data.notRead.signups ? 'Not tracked yet.' : 'No sign-ups from a link yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {data.notRead.accounts ? (
        <p className="mt-4 max-w-2xl text-xs text-content-tertiary">
          Some accounts could not be read, so a few names are missing and our own sign-ups may be counted. Reload to try
          again.
        </p>
      ) : null}
      {data.notRead.after ? (
        <p className="mt-4 max-w-2xl text-xs text-content-tertiary">
          Some of what the sign-ups did next could not be read, so Made a rollout and Paying may be low. Reload to try
          again.
        </p>
      ) : null}
      <p className="mt-4 max-w-2xl text-xs text-content-tertiary">
        A tap is a person opening a link. Link previews and bots are left out; our own taps while testing are in. A
        sign-up is matched to a link only in the same browser, within 30 days, and the last link tapped wins. Someone
        who taps inside TikTok or Instagram and then signs up in Chrome or Safari is not matched, so the real numbers
        can be higher. In the first weeks the rate can read high, because a sign-up can come from a tap made before
        counting started. A sign-up leaves the count if that account is deleted.
      </p>
      <p className="mt-2 max-w-2xl text-xs text-content-tertiary">
        PostHog has the same two events (source_link_clicked, signup_from_source_link), including taps from before
        counting started here.
      </p>
    </div>
  );
}
