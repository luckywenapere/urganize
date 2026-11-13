import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import { InfoTip } from '@/components/shared/HelpTip';
import { Badge, Card, CardContent, CardHeader, CardTitle, Separator, SectionLabel, Skeleton, buttonVariants, cn } from '@/components/admin/ui';
import { needsYouCards, visitsAllTimeLabel, type AdminOverview, type NeedsYouCard } from '@/lib/admin-overview';
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
//
// Since 2026-11-12 (#1241, approved mock docs/mocks/admin-desktop): what needs
// you comes first, as four cards that always sit in the same place (Reports,
// Applications, Pitch payments, Needs a message, red when something waits),
// then the six counters, then Today and This week side by side. Labels are
// sentence case and "MRR" reads "Monthly revenue". With more than one team to
// message, the full list sits under the two columns.

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
        <span className="text-base font-semibold tabular-nums text-content-primary">{value}</span>
        {note ? <span className="text-xs text-content-tertiary">{note}</span> : null}
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

/** Draft email for one team: the admin compose page filled in, else a mailto. */
function DraftEmail({ team, look = 'button' }: { team: AtRiskTeam; look?: 'button' | 'link' }) {
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
  const linkLook = 'motion-focus rounded font-semibold text-brand underline underline-offset-2';
  if (compose) {
    return (
      <Link href={compose} className={look === 'link' ? linkLook : buttonVariants({ size: 'sm' })}>
        Draft email
      </Link>
    );
  }
  if (mailto) {
    return (
      <a href={mailto} className={look === 'link' ? linkLook : buttonVariants({ size: 'sm' })}>
        Draft email
      </a>
    );
  }
  return <span className="shrink-0 text-xs text-content-tertiary">No email</span>;
}

/** One "needs you" card: a big number, red only when something waits. */
function NeedsYouTile({ card, children }: { card: NeedsYouCard; children?: ReactNode }) {
  const body = (
    <Card
      className={cn(
        'flex h-full flex-col p-4',
        card.waiting && 'border-status-error/30',
        card.href && 'transition-colors group-hover:bg-bg-hover'
      )}
    >
      <p
        className={cn(
          'font-display text-3xl font-semibold tabular-nums leading-9',
          card.waiting ? 'text-status-error' : 'text-content-primary'
        )}
      >
        {fmt(card.count)}
      </p>
      <p className="mt-1 text-sm font-semibold text-content-primary">{card.label}</p>
      <div className="mt-0.5 text-sm text-content-secondary">{children ?? card.note}</div>
    </Card>
  );
  return card.href ? (
    <Link
      href={card.href}
      className="motion-focus group block rounded-2xl"
      aria-label={`${card.label}: ${fmt(card.count)}. ${card.note}. Open ${card.label}.`}
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function NeedsYou({ overview }: { overview: AdminOverview }) {
  const cards = needsYouCards(overview);
  const teams = overview.atRisk ?? [];
  const first = teams[0];
  return (
    <section aria-labelledby="overview-needs-you">
      <h2 id="overview-needs-you" className="sr-only">
        Needs you
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) =>
          card.key === 'needs-message' && first ? (
            <NeedsYouTile key={card.key} card={card}>
              <span>
                {first.name || 'Unnamed team'}: {reasonLine(first).toLowerCase()}.{' '}
                <DraftEmail team={first} look="link" />
              </span>
              {teams.length > 1 ? (
                <span className="mt-1 block text-xs text-content-tertiary">{teams.length - 1} more below</span>
              ) : null}
            </NeedsYouTile>
          ) : (
            <NeedsYouTile key={card.key} card={card} />
          )
        )}
      </div>
    </section>
  );
}

/** Every team that needs a message, when there is more than the one on the card. */
function NeedsAMessage({ teams }: { teams: AtRiskTeam[] }) {
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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {teams.map((team) => (
          <Card key={team.workspaceId} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-medium text-content-primary">
                <span className="truncate">{team.name || 'Unnamed team'}</span>
                {team.paying ? <Badge>Paying</Badge> : null}
              </p>
              <p className="mt-0.5 truncate text-sm text-content-secondary">{reasonLine(team)}</p>
            </div>
            <DraftEmail team={team} />
          </Card>
        ))}
      </div>
    </section>
  );
}

export function AdminOverviewView({ overview }: { overview: AdminOverview }) {
  const tracking = overview.online !== null;
  const ticked = overview.today.ticked;
  const teams = overview.atRisk ?? [];

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* What needs you comes first, on phone and computer alike. */}
      <div className="order-first">
        <NeedsYou overview={overview} />
      </div>

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
          label="People"
          value={fmt(overview.totalUsers)}
          fact={`+${fmt(overview.newUsers7d)} this week`}
          href="/admin/metrics#metrics-accounts"
          opens="accounts"
        />
        <Tile label="Visits today" value={fmt(overview.visitsToday)} />
        <Tile label={visitsAllTimeLabel(overview.visitsSince)} value={fmt(overview.visitsAllTime)} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="overview-today">
          <SectionLabel
            id="overview-today"
            info={
              <InfoTip
                label="Today"
                text={`Lagos calendar day; "this week" is the last 7 days. Our own accounts are left out. Rollouts leave out test rollouts. Activities ticked uses the time an activity was ticked, recorded since 18 Oct 2026; older ticks are dated by their last edit${ticked.datedByEdit7d > 0 ? ` (${fmt(ticked.datedByEdit7d)} of this week's)` : ''}. Visits are app opens, one per session.`}
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
                text={`The last 7 days, by the Scoreboard's rules. North Star: teams on a paid plan where 2 or more people did something. Weekly active people: anyone who did something, opened the app or signed in. Active teams: any team where 2 or more people did something. Monthly revenue counts yearly plans as a twelfth. Past weeks use today's paying status and members.${overview.partial.length > 0 ? ` Not fully read: ${overview.partial.join(', ')}.` : ''}`}
              />
            }
            action={<HeaderLink href="/admin/scoreboard" label="Scoreboard" />}
          >
            This week
          </SectionLabel>
          {overview.week ? (
            <Rows>
              {[
                <Row key="n" label="North Star: active paying teams" value={fmt(overview.week.northStar)} />,
                <Row key="p" label="Weekly active people" value={fmt(overview.week.weeklyActivePeople)} />,
                <Row key="a" label="Active teams with 2 or more people" value={fmt(overview.week.activeTeams)} />,
                <Row key="m" label="Monthly revenue" value={formatNaira(overview.week.mrrMinor)} />,
              ]}
            </Rows>
          ) : (
            <Card className="p-4 text-sm text-content-secondary">Couldn&apos;t work out this week&apos;s numbers.</Card>
          )}
        </section>
      </div>

      {teams.length > 1 ? <NeedsAMessage teams={teams} /> : null}
    </div>
  );
}

/** The loading state: the same shapes, shimmering. */
export function AdminOverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the overview" className="mt-6 flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-9 w-12" />
            <Skeleton className="mt-2 h-4 w-24" />
            <Skeleton className="mt-2 h-4 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-9 w-14" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {[3, 4].map((rows) => (
          <div key={rows}>
            <Skeleton className="mb-3 h-4 w-20" />
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
    </div>
  );
}
