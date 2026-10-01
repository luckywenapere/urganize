/**
 * The credits system's one switch.
 *
 * NEXT_PUBLIC_FEATURE_URGANS_CREDITS, default off. With it off nothing about
 * UrgAns changes: the monthly action ceiling counts turns exactly as it did and
 * no credit is read, granted or charged. With it on, a turn is paid for in
 * credits INSTEAD of counting against that ceiling.
 *
 * `NEXT_PUBLIC_` because the usage strip in the browser reads it to decide
 * whether to ask the server for a credit balance; the server reads the same name,
 * so the two cannot disagree. Only the literal `true` turns it on.
 */
export function isCreditsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS ?? '').trim().toLowerCase() === 'true';
}
