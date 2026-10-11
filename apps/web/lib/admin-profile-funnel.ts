/**
 * The profile growth funnel for /admin/profile-funnel (2026-10-11).
 *
 * Credits submitted, unclaimed profiles made, claim emails sent, claimed,
 * published, page views, CTA taps, sign-ups. Last 30 days. PURE: the route
 * reads rows and hands them here, so the rules are tested once.
 *
 * Rules worth not re-deciding:
 *  - NOT A COHORT. Each step counts what happened in the window on its own
 *    (a claim this week may come from a credit last month), so a step can be
 *    bigger than the one before it. The page says so, and the ratio under a
 *    step reads "x per 100" style only below 100%, else "N times".
 *  - OUR OWN ACCOUNTS ARE LEFT OUT the way every admin page does it
 *    (internalAccountEmails in app/api/admin/_shared.ts): credits on our
 *    rollouts, profiles made by our teams, invites we sent, profiles we
 *    claimed, views and taps on pages we own, and our own sign-ups.
 *  - "Not tracked" is null, never zero. The three steps that live in
 *    profile_growth_events read null until that table exists.
 *  - Claim emails come from person_claim_invites (channel 'email', sent_at in
 *    the window): what the owner pressed "Email" on. Links shared by hand are
 *    counted beside it, because a WhatsApp link is how most claims start.
 */

export const PROFILE_FUNNEL_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ProfileFunnelInput = {
  now: number;
  internalUserIds: ReadonlySet<string>;
  /** workspace id → owner user id, for profiles a team made. */
  workspaceOwners: ReadonlyMap<string, string>;
  /** person id → user id (claimed pages), for views and taps. */
  personOwners: ReadonlyMap<string, string>;
  credits: Array<{ owner_user_id: string | null; created_at: string | null }>;
  unclaimedProfiles: Array<{ created_at: string | null; created_by_workspace_id: string | null }>;
  invites: Array<{ channel: string | null; sent_at: string | null; created_at: string | null; created_by: string | null }>;
  claimedProfiles: Array<{ user_id: string | null; claimed_at: string | null; visibility: string | null }>;
  /** Null when profile_growth_events cannot be read (not applied yet). */
  growthEvents: Array<{ kind: string; person_id: string | null; user_id: string | null; created_at: string | null }> | null;
};

export type ProfileFunnelStep = {
  key:
    | 'credits_submitted'
    | 'unclaimed_profiles'
    | 'claim_emails_sent'
    | 'claimed'
    | 'published'
    | 'profile_views'
    | 'cta_clicks'
    | 'signups';
  label: string;
  /** Null = not tracked. */
  count: number | null;
  /** A second number shown small under the step, when it has one. */
  aside?: { label: string; count: number };
};

export type ProfileFunnel = {
  windowDays: number;
  since: string;
  steps: ProfileFunnelStep[];
};

function inWindow(value: string | null | undefined, since: number, now: number): boolean {
  if (!value) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && at >= since && at <= now;
}

export function buildProfileFunnel(input: ProfileFunnelInput): ProfileFunnel {
  const { now, internalUserIds: internal } = input;
  const since = now - PROFILE_FUNNEL_WINDOW_DAYS * DAY_MS;
  const isInternal = (userId: string | null | undefined) => Boolean(userId && internal.has(userId));

  const credits = input.credits.filter(
    (row) => inWindow(row.created_at, since, now) && !isInternal(row.owner_user_id)
  ).length;

  const unclaimed = input.unclaimedProfiles.filter((row) => {
    if (!inWindow(row.created_at, since, now)) return false;
    const owner = row.created_by_workspace_id ? input.workspaceOwners.get(row.created_by_workspace_id) : undefined;
    return !isInternal(owner);
  }).length;

  const externalInvites = input.invites.filter((row) => !isInternal(row.created_by));
  const emailsSent = externalInvites.filter((row) => row.channel === 'email' && inWindow(row.sent_at, since, now)).length;
  const linksMade = externalInvites.filter((row) => row.channel === 'link' && inWindow(row.created_at, since, now)).length;

  const claimedRows = input.claimedProfiles.filter(
    (row) => inWindow(row.claimed_at, since, now) && !isInternal(row.user_id)
  );
  const published = claimedRows.filter((row) => row.visibility === 'public' || row.visibility === 'directory').length;

  let views: number | null = null;
  let taps: number | null = null;
  let signups: number | null = null;
  if (input.growthEvents) {
    const events = input.growthEvents.filter((row) => inWindow(row.created_at, since, now));
    const onExternalPage = (row: { person_id: string | null }) =>
      !isInternal(row.person_id ? input.personOwners.get(row.person_id) : undefined);
    views = events.filter((row) => row.kind === 'profile_view' && onExternalPage(row)).length;
    taps = events.filter((row) => row.kind === 'cta_click' && onExternalPage(row)).length;
    signups = events.filter((row) => row.kind === 'signup' && !isInternal(row.user_id)).length;
  }

  return {
    windowDays: PROFILE_FUNNEL_WINDOW_DAYS,
    since: new Date(since).toISOString(),
    steps: [
      { key: 'credits_submitted', label: 'Credits submitted', count: credits },
      { key: 'unclaimed_profiles', label: 'Unclaimed profiles made', count: unclaimed },
      {
        key: 'claim_emails_sent',
        label: 'Claim emails sent',
        count: emailsSent,
        aside: { label: 'Claim links shared by hand', count: linksMade },
      },
      { key: 'claimed', label: 'Claimed', count: claimedRows.length },
      { key: 'published', label: 'Published', count: published },
      { key: 'profile_views', label: 'Profile views', count: views },
      { key: 'cta_clicks', label: 'CTA taps', count: taps },
      { key: 'signups', label: 'Sign-ups from a profile or claim', count: signups },
    ],
  };
}

/** How a step compares with the one before it. Null when either is unknown or the one before is 0. */
export function stepRatioLabel(previous: number | null, current: number | null): string | null {
  if (previous === null || current === null || previous <= 0) return null;
  const ratio = current / previous;
  if (ratio < 1) return `${Math.round(ratio * 100)}% of the step before`;
  return `${(Math.round(ratio * 10) / 10).toFixed(1)} times the step before`;
}
