import type { CreditAccount } from './allowance';
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
 * Whether anyone can BUY credits yet. They cannot: pack sizes are undecided and
 * there is no checkout, so no line may tell a person to buy until this is true.
 * Every line that mentions buying is gated on it (and takes it as an argument so
 * both wordings are tested). Flip it in the same change that ships the checkout.
 */
export const CREDITS_PURCHASABLE = false;

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
export function outOfCreditsNotice(input: NoticeInput, purchasable: boolean = CREDITS_PURCHASABLE): string {
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

/** Said when an embedded action (the planner, a press-kit draft) cannot start: the hold is more than the balance. */
export function embeddedRefusalNotice(
  input: NoticeInput & { needed: number; left: number },
  purchasable: boolean = CREDITS_PURCHASABLE
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
  purchasable: boolean = CREDITS_PURCHASABLE
): string {
  const next = whatNext(input, purchasable);
  if (Math.floor(left) > 0) return next;
  return `Quick commands still work.${next ? ` ${next}` : ''}`;
}

/**
 * Whether the banner should show: once what is left is a fifth of a month's
 * credits, or ten, whichever is more. `referenceCredits` is the plan's monthly
 * allowance, or the trial grant for an account that has none.
 */
export function isLowOnCredits(total: number, referenceCredits: number): boolean {
  const threshold = Math.max(10, Math.ceil(referenceCredits * 0.2));
  return total <= threshold;
}
