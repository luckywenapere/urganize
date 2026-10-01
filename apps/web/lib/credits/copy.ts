/**
 * What a person reads about their credits. One module so the chat's refusal, the
 * banner and any later screen say the same thing, and so a test can hold every
 * line to the house rules (plain words, no em dashes, never the product word
 * for a team's space, and no promise of something that is not built: there is no
 * way to buy credits yet, so nothing here tells anyone to).
 */

/** "12 October", in UTC so the day matches the one the window turns over on. */
export function formatResetDay(resetsAtIso: string): string {
  const date = new Date(resetsAtIso);
  if (Number.isNaN(date.getTime())) return 'your next billing day';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Said in the chat when a team has no credits left. */
export function outOfCreditsNotice(resetsAtIso: string): string {
  return `You are out of UrgAns credits. Quick commands still work. Your monthly credits come back on ${formatResetDay(resetsAtIso)}.`;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The banner's first line. `left` is whole credits and never below zero. */
export function creditsLeftLine(left: number): string {
  const safe = Math.max(0, Math.floor(left));
  if (safe === 0) return 'You have used all your UrgAns credits.';
  return `UrgAns: ${plural(safe, 'credit', 'credits')} left.`;
}

/** The banner's second line. */
export function creditsResetLine(left: number, resetsAtIso: string): string {
  return left > 0
    ? `Your monthly credits come back on ${formatResetDay(resetsAtIso)}.`
    : `Quick commands still work. Your monthly credits come back on ${formatResetDay(resetsAtIso)}.`;
}

/** Whether the banner should show: once what is left is a fifth of the monthly credits, or ten, whichever is more. */
export function isLowOnCredits(total: number, monthlyAllowance: number): boolean {
  const threshold = Math.max(10, Math.ceil(monthlyAllowance * 0.2));
  return total <= threshold;
}
