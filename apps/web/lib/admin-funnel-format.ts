import type { AdminFunnel, FunnelStep, FunnelStepKey, WaitlistStep } from './admin-funnel';

// How the cockpit's sign-up funnel reads as words. Client-safe: types only from
// ./admin-funnel, so the counting rules (and the billing helpers behind the
// Scoreboard) stay out of the browser bundle.

const number = new Intl.NumberFormat('en');

export const FUNNEL_STEP_COPY: Record<FunnelStepKey, { label: string; info: string }> = {
  account: {
    label: 'Accounts',
    info: 'New teams whose owner signed up in the window and has had their first 3 days. A teammate who was invited into someone else\'s team is not a new account.',
  },
  first_rollout: {
    label: 'First rollout',
    info: 'Of those teams, the ones that have made a real rollout by now. Test rollouts are left out.',
  },
  activated: {
    label: 'Activated',
    info: 'Made a rollout AND invited a teammate, both within 3 days of signing up. The same rule as Activation on the Scoreboard.',
  },
  trial_over: {
    label: 'Trial over',
    info: 'Every new team gets the 3-day trial on its own, so this counts the teams whose trial has ended, or that paid during it: the ones that have had to decide whether to pay. Comped and allowlisted teams are left out.',
  },
  paid: {
    label: 'Paid',
    info: 'The owner paid for a plan after the trial started (any plan, Solo included). A team that paid and later stopped still counts here. Comped and allowlisted teams are left out.',
  },
};

export const WAITLIST_INFO =
  'People who joined the waitlist on the marketing site in the window, and the share whose email now owns a team in Urganize. The waitlist is a separate database, so it is matched by email.';

/** "42%", rounded to a whole percent. Null reads as an em dash. */
export function formatShare(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** The line between two steps: "3 of 8 (38%)", or "No one at the step before". */
export function formatConversion(step: FunnelStep, previousCount: number): string {
  if (step.fromPrevious === null || previousCount === 0) return 'No one at the step before';
  return `${number.format(step.carried)} of ${number.format(previousCount)} (${formatShare(step.fromPrevious)})`;
}

/** The waitlist line: "5 joined, 2 have an account (40%)", "No one joined", or "Not tracked". */
export function formatWaitlist(waitlist: WaitlistStep | null): string {
  if (!waitlist) return 'Not tracked';
  if (waitlist.joined === 0) return 'No one joined in this window';
  const verb = waitlist.withAccount === 1 ? 'has' : 'have';
  return `${number.format(waitlist.joined)} joined, ${number.format(waitlist.withAccount)} ${verb} an account (${formatShare(waitlist.rate)})`;
}

/** The fact under the strip about the newest sign-ups that are not counted yet. */
export function formatTooNew(funnel: AdminFunnel): string | null {
  if (funnel.tooNew === 0) return null;
  return funnel.tooNew === 1
    ? '1 newer sign-up is still in its first 3 days and joins the count after that.'
    : `${number.format(funnel.tooNew)} newer sign-ups are still in their first 3 days and join the count after that.`;
}
