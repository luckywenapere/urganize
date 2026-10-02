import type { CreditAccount } from './allowance';
import { isCreditsPurchasable } from './config';
import { EMBEDDED_ESTIMATE_CREDITS, EMBEDDED_HOLD_CREDITS, embeddedEstimateCredits } from './embedded';

/**
 * What a person reads about their credits. One module so the chat's refusal, the
 * banner and any later screen say the same thing, and so a test can hold every
 * line to the house rules (plain words, no em dashes, never the product word
 * for a team's space).
 *
 * Credits never expire and the balance never resets, so nothing here says credits
 * "come back" or "reset". A subscriber is told when the next monthly grant lands,
 * which is the one date that is true.
 */

/**
 * Whether anyone can BUY credits is isCreditsPurchasable() (config.ts), off until
 * the checkout is switched on. Every line that mentions buying is gated on it, and
 * takes it as an argument so both wordings are tested.
 */

/** "12 October", in UTC so the day matches the one the window turns over on. */
export function formatGrantDay(grantAtIso: string): string {
  const date = new Date(grantAtIso);
  if (Number.isNaN(date.getTime())) return 'your next billing day';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

type NoticeInput = {
  account: CreditAccount;
  /** When the next monthly grant lands. Null for an account that has no subscription. */
  nextGrantAt: string | null;
};

/** The sentence about what happens next, or '' when there is nothing true to say. */
function whatNext({ account, nextGrantAt }: NoticeInput, purchasable: boolean): string {
  const parts: string[] = [];
  if (account === 'subscriber' && nextGrantAt) {
    parts.push(`Your next monthly credits arrive on ${formatGrantDay(nextGrantAt)}.`);
  }
  if (purchasable) parts.push('You can buy more credits at any time.');
  return parts.join(' ');
}

/** Said in the chat when a team has no credits left. */
export function outOfCreditsNotice(input: NoticeInput, purchasable: boolean = isCreditsPurchasable()): string {
  const next = whatNext(input, purchasable);
  return `You are out of UrgAns credits. Quick commands still work.${next ? ` ${next}` : ''}`;
}

/**
 * Said BEFORE an embedded action runs: what it will cost, so nobody is surprised.
 * An action with its own estimate says "about N"; one without (the press-kit draft)
 * says "up to" the hold, which is the most it can cost.
 */
export function embeddedEstimateLine(actionId: string): string {
  const credits = embeddedEstimateCredits(actionId);
  return actionId in EMBEDDED_ESTIMATE_CREDITS
    ? `This uses about ${credits} UrgAns credits.`
    : `This uses up to ${EMBEDDED_HOLD_CREDITS} UrgAns credits.`;
}

/**
 * The estimate plus what the team has, said together BEFORE an action runs
 * (founder spec, 2026-10-01: the balance shows on every credit-spending
 * action). `balance` is null when it is not known yet or cannot be read; then
 * only the estimate is said, because a wrong balance is worse than none.
 */
export function embeddedCostLine(actionId: string, balance: number | null): string {
  const estimate = embeddedEstimateLine(actionId);
  if (balance === null || !Number.isFinite(balance)) return estimate;
  const left = Math.max(0, Math.floor(balance));
  return `${estimate} You have ${left} ${left === 1 ? 'credit' : 'credits'}.`;
}

/** Said when an embedded action (the planner, a press-kit draft) cannot start: the hold is more than the balance. */
export function embeddedRefusalNotice(
  input: NoticeInput & { needed: number; left: number },
  purchasable: boolean = isCreditsPurchasable()
): string {
  const left = Math.max(0, Math.floor(input.left));
  const next = whatNext(input, purchasable);
  return `This needs up to ${input.needed} UrgAns credits and you have ${left}.${next ? ` ${next}` : ''}`;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The banner's first line. `left` is whole credits and never below zero. */
export function creditsLeftLine(left: number): string {
  const safe = Math.max(0, Math.floor(left));
  if (safe === 0) return 'You have used all your UrgAns credits.';
  return `UrgAns: ${plural(safe, 'credit', 'credits')} left.`;
}

/** The banner's second line; '' when there is nothing true to add. */
export function creditsNextLine(
  left: number,
  input: NoticeInput,
  purchasable: boolean = isCreditsPurchasable()
): string {
  const next = whatNext(input, purchasable);
  if (Math.floor(left) > 0) return next;
  return `Quick commands still work.${next ? ` ${next}` : ''}`;
}

/** The balance below which the banner shows (founder spec, 2026-10-01): the same 50 for everyone. */
export const LOW_CREDITS_THRESHOLD = 50;

/** Whether the banner should show: when what is left is below 50 credits. */
export function isLowOnCredits(total: number): boolean {
  return total < LOW_CREDITS_THRESHOLD;
}
