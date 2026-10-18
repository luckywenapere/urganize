import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import { InfoTip } from '@/components/shared/HelpTip';
import { Badge, Card, CardContent, CardHeader, CardTitle, Separator, SectionLabel, Skeleton, buttonVariants, cn } from '@/components/admin/ui';
import { attentionRows, sinceLabel, type AdminOverview } from '@/lib/admin-overview';
import type { AtRiskTeam } from '@/lib/founder-cockpit';
import { messageComposeHref, messageMailto } from '@/lib/admin-message-list';
import { formatNaira } from '@/lib/scoreboard-format';

// The one-screen admin Overview (2026-10-18, URG-369; mock approved by the
// founder: "Perfect"). Display only: AdminHubClient owns the gate, the load
// and the 60-second refresh. Built from shadcn-shaped parts (./ui.tsx) in the
// app's tokens.
//
// Order: six tiles, then Today and This week as rows (numbers in rows, not
// cards), then Needs a message, whose Draft email is the only accent button
// on the screen, then Reports / Pitch payments only when they need someone.
// What each number means sits behind an info icon; nothing grey is stacked
// under a heading.
//
// Since 2026-10-18 (approved mock, with the phone bottom bar): Scoreboard and
// Metrics are no longer tabs, so they open from here. "Today ›" opens Metrics,
// "This week ›" opens Scoreboard, and the people tiles open the matching
// Metrics section; only a tile that links shows a chevron. On phone Needs a
// message comes before Today, since it is the only action on the page; on
// desktop it stays in the right column. The "All dashboards" row went: the
// More tab is the same page.

const number = new Intl.NumberFormat('en');

function fmt(value: number | null | undefined): string {
  return typeof value === 'number' ? number.format(value) : '—';
}

function Tile({
  label,
  value,
  fact,
  dot,
  href,
  opens,
}: {
  label: string;
  value: string;
  fact?: string | null;
  dot?: 'on' | 'off';
  href?: string;
  /** What the tap opens, for screen readers ("who is online"). */
  opens?: string;
}) {
  const body = (
    <Card className={cn('h-full', href && 'transition-colors group-hover:bg-bg-hover')}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5 font-normal">
          {dot ? (
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 rounded-full', dot === 'on' ? 'bg-brand' : 'bg-content-tertiary')}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {href ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-display text-4xl font-semibold tabular-nums leading-tight text-content-primary">{value}</p>
        {fact ? <p className="mt-1 text-xs text-content-secondary">{fact}</p> : null}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="motion-focus group block rounded-2xl"
      aria-label={`${label}: ${value}. Open ${opens ?? 'Metrics'}.`}
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5">
      <span className="text-sm text-content-primary">{label}</span>
      <span className="flex items-baseline gap-2 text-right">
        <span className="font-mono text-base font-bold tabular-nums text-content-primary">{value}</span>
        {note ? <span className="font-mono text-xs text-content-tertiary">{note}</span> : null}
      </span>
    </div>
  );
}

function Rows({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <Card className="px-4">
      {items.map((child, index) => (
        <div key={index}>
          {index > 0 ? <Separator /> : null}
          {child}
        </div>
      ))}
    </Card>
  );
}

/** The quiet link on a section header: "Metrics ›", "Scoreboard ›". */
function HeaderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="motion-focus group -my-1 inline-flex items-center gap-0.5 rounded-md py-1 text-sm text-content-secondary hover:text-content-primary"
    >
      {label}
      <ChevronRight
        className="h-4 w-4 text-content-tertiary transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function reasonLine(team: AtRiskTeam): string {
  if (team.reason === 'paying_quiet') {
    return `Pays, but ${team.activeMembers7d} of ${team.members} active this week`;
  }
  return 'Busy last week, quiet this week';
}

function NeedsAMessage({ teams }: { teams: AtRiskTeam[] | null }) {
  return (
    <section aria-labelledby="overview-needs">
      <SectionLabel
        id="overview-needs"
        info={
          <InfoTip
            label="Needs a message"
            text="Paying teams where fewer than 2 people did something this week, then teams that were active last week and are quiet this week. Draft email opens the admin email page with a note filled in, sent from the Urganize address. Nothing is sent until you press Send."
          />
        }
      >
        Needs a message
      </SectionLabel>
      {teams === null ? (
        <Card className="p-4 text-sm text-content-secondary">Couldn&apos;t work out who needs a message.</Card>
      ) : teams.length === 0 ? (
        <Card className="p-4 text-sm text-content-secondary">No team has slipped this week.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {teams.map((team) => {
            const compose = messageComposeHref({
              email: team.ownerEmail,
              teamName: team.name,
              stage: team.stalledAt.stage,
            });
            const mailto = compose
              ? null
              : messageMailto({
                  email: team.ownerEmail,
                  ownerName: team.ownerName,
                  teamName: team.name,
                  stage: team.stalledAt.stage,
                });
            return (
              <Card key={team.workspaceId} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-content-primary">
                    <span className="truncate">{team.name || 'Unnamed team'}</span>
                    {team.paying ? <Badge>Paying</Badge> : null}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-content-secondary">{reasonLine(team)}</p>
                </div>
                {compose ? (
                  <Link href={compose} className={buttonVariants({ size: 'sm' })}>
                    Draft email
                  </Link>
                ) : mailto ? (
                  <a href={mailto} className={buttonVariants({ size: 'sm' })}>
                    Draft email
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-content-tertiary">No email</span>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LinkRow({ href, label, count, tone }: { href: string; label: string; count: number; tone?: 'alert' }) {
  return (
    <Link
      href={href}
      className="motion-focus group flex items-center justify-between gap-3 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-4 transition-colors hover:bg-bg-hover"
    >
      <span className="text-sm font-medium text-content-primary">{label}</span>
      <span className="flex items-center gap-2">
        {tone === 'alert' ? (
          <Badge variant="destructive">{fmt(count)} waiting</Badge>
        ) : (
          <span className="font-mono text-xs tabular-nums text-content-tertiary">{fmt(count)}</span>
        )}
        <ChevronRight
          className="h-4 w-4 text-content-tertiary transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

export function AdminOverviewView({ overview }: { overview: AdminOverview }) {
  const tracking = overview.online !== null;
  const ticked = overview.today.ticked;
  const attention = attentionRows(overview.attention);

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Online now"
          value={tracking ? fmt(overview.online) : '—'}
          fact={tracking ? null : 'Starts once tracking is on'}
          dot={tracking ? 'on' : 'off'}
          href="/admin/metrics#metrics-now"
          opens="who is online"
        />
        <Tile
          label="Active today"
          value={fmt(overview.activeToday)}
          href="/admin/metrics#metrics-active"
          opens="active people"
        />
        <Tile
          label="Active yesterday"
          value={fmt(overview.activeYesterday)}
          href="/admin/metrics#metrics-active"
          opens="active people"
        />
        <Tile
          label="Total users"
          value={fmt(overview.totalUsers)}
          fact={`+${fmt(overview.newUsers7d)} this week`}
          href="/admin/metrics#metrics-accounts"
          opens="accounts"
        />
        <Tile label="Visits today" value={fmt(overview.visitsToday)} />
        <Tile label="Visits all time" value={fmt(overview.visitsAllTime)} fact={sinceLabel(overview.visitsSince)} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="overview-today">
            <SectionLabel
              id="overview-today"
              info={
                <InfoTip
                  label="Today"
                  text={`Lagos calendar day; "this week" is the last 7 days. Our own accounts are left out. Rollouts leave out test rollouts. Activities ticked uses the time an activity was ticked, recorded since 18 Oct 2026; older ticks are dated by their last edit${ticked.datedByEdit7d > 0 ? ` (${fmt(ticked.datedByEdit7d)} of this week's)` : ''}.`}
                />
              }
              action={<HeaderLink href="/admin/metrics" label="Metrics" />}
            >
              Today
            </SectionLabel>
            <Rows>
              {[
                <Row key="s" label="New sign-ups" value={fmt(overview.today.signups.today)} note={`${fmt(overview.today.signups.week)} this week`} />,
                <Row key="r" label="Rollouts made" value={fmt(overview.today.rollouts.today)} note={`${fmt(overview.today.rollouts.week)} this week`} />,
                <Row key="t" label="Activities ticked" value={fmt(ticked.today)} note={`${fmt(ticked.week)} this week`} />,
              ]}
            </Rows>
          </section>

          <section aria-labelledby="overview-week">
            <SectionLabel
              id="overview-week"
              info={
                <InfoTip
                  label="This week"
                  text={`The last 7 days, by the Scoreboard's rules. North Star: teams on a paid plan where 2 or more people did something. Weekly active people: anyone who did something, opened the app or signed in. Active teams: any team where 2 or more people did something. MRR counts yearly plans as a twelfth. Past weeks use today's paying status and members.${overview.partial.length > 0 ? ` Not fully read: ${overview.partial.join(', ')}.` : ''}`}
                />
              }
              action={<HeaderLink href="/admin/scoreboard" label="Scoreboard" />}
            >
              This week
            </SectionLabel>
            {overview.week ? (
              <Rows>
                {[
                  <Row key="n" label="North Star" value={fmt(overview.week.northStar)} note="active paying teams" />,
                  <Row key="p" label="Weekly active people" value={fmt(overview.week.weeklyActivePeople)} />,
                  <Row key="a" label="Active teams, 2+ people" value={fmt(overview.week.activeTeams)} />,
                  <Row key="m" label="MRR" value={formatNaira(overview.week.mrrMinor)} />,
                ]}
              </Rows>
            ) : (
              <Card className="p-4 text-sm text-content-secondary">Couldn&apos;t work out this week&apos;s numbers.</Card>
            )}
          </section>
        </div>

        {/* First on phone (the only action on the page), right column on desktop. */}
        <div className="order-first flex flex-col gap-6 lg:order-none">
          <NeedsAMessage teams={overview.atRisk} />
          {attention.map((row) => (
            <LinkRow key={row.key} href={row.href} label={row.label} count={row.count} tone="alert" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The loading state: the same shapes, shimmering. */
export function AdminOverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the overview" className="mt-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-9 w-14" />
          </Card>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          {[3, 4].map((rows) => (
            <div key={rows}>
              <Skeleton className="mb-3 h-3 w-20" />
              <Card className="px-4">
                {Array.from({ length: rows }, (_, index) => (
                  <div key={index} className="flex items-center justify-between py-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
        <div className="order-first flex flex-col gap-6 lg:order-none">
          <div>
            <Skeleton className="mb-3 h-3 w-28" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
