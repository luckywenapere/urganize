// The admin Overview at /admin, one screen (2026-10-18, URG-369; founder
// approved the mock: "Perfect").
//
// Pure: it only picks and names numbers that the Metrics and Scoreboard rules
// already work out (lib/usage-metrics.ts, lib/founder-cockpit.ts), so the
// Overview can never disagree with the page a tile taps through to. The route
// (app/api/admin/overview/route.ts) does the reads.
//
// What each number is:
//  - Online now: people whose "last seen" ping is under five minutes old.
//    `online` is null until the ping has recorded anyone (the
//    user_presence_days table was only applied in production on 2026-10-18),
//    and the screen says "Not tracking yet" instead of a zero.
//  - Active today / yesterday: the Metrics page's wide "active" (did something,
//    opened the app, signed in, or had it on screen), Lagos calendar days.
//  - Total users: every account but ours, and how many joined in 7 days.
//  - Visits: app opens, one per session (the login-ping), since the first one
//    was recorded (2026-07-24 in production).
//  - Today: sign-ups, real rollouts made, activities ticked, each with its
//    last-7-days count.
//  - This week: the North Star (weekly active paying teams), weekly active
//    people (last 7 days), active teams with 2 or more people, and MRR.
//  - Needs a message: the cockpit's at-risk teams.
//  - Attention: open reports and pitch payments waiting on a person. Each
//    shows on the Overview only when it is above zero.

import type { AtRiskTeam, FounderCockpit } from './founder-cockpit';
import type { UsageMetrics } from './usage-metrics';

export type AdminAttention = {
  /** User reports not yet in Linear (pending or failed); null when unread. */
  reports: number | null;
  /** Pitch payments, payouts or refunds that need a person; null when unread. */
  pitchPayments: number | null;
  /** Playlist owners' applications still waiting for an answer; null or unset when unread. */
  curatorApplications?: number | null;
};

export type AdminOverview = {
  generatedAt: string;
  online: number | null;
  activeToday: number;
  activeYesterday: number;
  totalUsers: number;
  newUsers7d: number;
  visitsToday: number;
  visitsAllTime: number | null;
  visitsSince: string | null;
  today: {
    signups: { today: number; week: number };
    rollouts: { today: number; week: number };
    ticked: { today: number; week: number; datedByEdit7d: number };
  };
  /** Null when the Scoreboard read failed: the This week block shows its error. */
  week: {
    northStar: number;
    weeklyActivePeople: number;
    activeTeams: number;
    mrrMinor: number;
    payingTeams: number;
  } | null;
  atRisk: AtRiskTeam[] | null;
  attention: AdminAttention;
  /** Tables that could not be fully read, for the info icon. */
  partial: string[];
};

export function buildAdminOverview(input: {
  metrics: UsageMetrics;
  cockpit: FounderCockpit | null;
  attention: AdminAttention;
  partial?: string[];
}): AdminOverview {
  const { metrics, cockpit } = input;
  return {
    generatedAt: metrics.generatedAt,
    online: metrics.presenceSince ? metrics.online.length : null,
    activeToday: metrics.active.today,
    activeYesterday: metrics.today.activeYesterday,
    totalUsers: metrics.accounts.total,
    newUsers7d: metrics.accounts.new7d,
    visitsToday: metrics.today.visits,
    visitsAllTime: metrics.visits.allTime,
    visitsSince: metrics.visits.since,
    today: {
      signups: { today: metrics.today.signups, week: metrics.accounts.new7d },
      rollouts: { today: metrics.today.rollouts, week: metrics.rollouts.last7d },
      ticked: {
        today: metrics.today.ticked,
        week: metrics.work.activitiesDone7d,
        datedByEdit7d: metrics.today.tickedByUpdatedAt7d,
      },
    },
    week: cockpit
      ? {
          northStar: cockpit.northStar.current,
          weeklyActivePeople: metrics.active.last7d,
          activeTeams: cockpit.activeTeams.current,
          mrrMinor: cockpit.mrrMinor,
          payingTeams: cockpit.payingTeams,
        }
      : null,
    atRisk: cockpit ? cockpit.atRisk : null,
    attention: input.attention,
    partial: input.partial ?? [],
  };
}

/** The attention rows the Overview shows: only those that need someone now. */
export function attentionRows(attention: AdminAttention): Array<{ key: string; label: string; href: string; count: number }> {
  const rows: Array<{ key: string; label: string; href: string; count: number }> = [];
  if (attention.reports && attention.reports > 0) {
    rows.push({ key: 'issue-reports', label: 'Reports', href: '/admin/issue-reports', count: attention.reports });
  }
  if (attention.pitchPayments && attention.pitchPayments > 0) {
    rows.push({
      key: 'pitch-payments',
      label: 'Pitch payments',
      href: '/admin/pitch-payments',
      count: attention.pitchPayments,
    });
  }
  if (attention.curatorApplications && attention.curatorApplications > 0) {
    rows.push({
      key: 'curator-applications',
      label: 'Applications',
      href: '/admin/curator-applications',
      count: attention.curatorApplications,
    });
  }
  return rows;
}

/** "Updated 40s ago" / "2m ago" for the header; "just now" under 5 seconds. */
export function updatedAgo(iso: string | null, now: Date): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - at) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-24" -> "since 24 Jul". */
export function sinceLabel(day: string | null): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  return `since ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`.trim();
}

/**
 * The "needs you" row at the top of the Overview on a computer (2026-11-12,
 * #1241, approved mock). Always the same four cards in the same place, so the
 * eye learns where to look: red when something waits, quiet at zero, and a
 * dash when the count could not be read (never a made-up zero).
 */
export type NeedsYouCard = {
  key: 'issue-reports' | 'curator-applications' | 'pitch-payments' | 'needs-message';
  label: string;
  /** Null when the count could not be read. */
  count: number | null;
  href: string | null;
  /** One short line under the number. */
  note: string;
  waiting: boolean;
};

export function needsYouCards(overview: Pick<AdminOverview, 'attention' | 'atRisk'>): NeedsYouCard[] {
  const { attention } = overview;
  const card = (
    key: NeedsYouCard['key'],
    label: string,
    count: number | null | undefined,
    href: string | null,
    waitingNote: string
  ): NeedsYouCard => {
    const value = typeof count === 'number' ? count : null;
    const waiting = value !== null && value > 0;
    return {
      key,
      label,
      count: value,
      href,
      note: value === null ? "Couldn't read" : waiting ? waitingNote : 'Nothing waiting',
      waiting,
    };
  };
  return [
    card('issue-reports', 'Reports', attention.reports, '/admin/issue-reports', 'Not in Linear yet'),
    card(
      'curator-applications',
      'Applications',
      attention.curatorApplications,
      '/admin/curator-applications',
      'Playlist owners waiting for an answer'
    ),
    card('pitch-payments', 'Pitch payments', attention.pitchPayments, '/admin/pitch-payments', 'Payouts, quotes or refunds to check'),
    card('needs-message', 'Needs a message', overview.atRisk ? overview.atRisk.length : null, null, 'Teams that went quiet'),
  ];
}

/** The last counter's label: "Visits since 24 Jul", or "Visits all time" with no date. */
export function visitsAllTimeLabel(since: string | null): string {
  const label = sinceLabel(since);
  return label ? `Visits ${label}` : 'Visits all time';
}
