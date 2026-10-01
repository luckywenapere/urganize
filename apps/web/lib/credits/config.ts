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
export function isCreditsEnabled(
  // A direct `process.env.NEXT_PUBLIC_X` read is what Next replaces at build time;
  // handing over `process.env` as a whole is an empty object in the browser, so the
  // default names the variable. (The estimate lines in the planner and the press-kit
  // draft are shown by the browser and have to see the same switch as the server.)
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_FEATURE_URGANS_CREDITS: process.env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS,
  }
): boolean {
  return String(env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS ?? '').trim().toLowerCase() === 'true';
}
