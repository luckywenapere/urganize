// The app's post-authentication front door — the ONE place that decides
// where a signed-in user lands. Every post-auth entry point (login, OAuth
// callback, root /, onboarding completion, invite accept, paywall unlock,
// promo redemption, post-checkout) imports this instead of hardcoding
// '/dashboard', so the landing surface can't drift between entries.
//
// 2026-07-23: the releases view at /dashboard briefly became the landing
// surface again. 2026-07-31 (URG-205, founder decision): reversed —
// the assistant is the front door once more when its flag is on. With the
// flag off, this resolves to '/dashboard' and matches ChappiPageClient's
// own flag-off bounce, so there's no redirect loop either way.
//
// 2026-08-04 (URG-212): the assistant's page moved from /dashboard/chappi
// to /dashboard/urgans alongside its user-facing rename to UrgAns. The old
// path still 308-redirects (app/dashboard/chappi/page.tsx) for anyone
// mid-session or with an installed PWA pointed at it.
//
// 2026-08-12 (founder decision): the catalog is the front door again, and
// this is now unconditional. It no longer reads the assistant's flag: a
// signed-in user lands on their releases whether or not UrgAns is enabled.
//
// 2026-09-08 (founder decision): the assistant is the front door again, and
// this is the FOURTH flip (07-15 assistant, 07-23 catalog, 07-31 assistant,
// 08-12 catalog, now assistant). The 08-12 note above predicted that "a
// future reversal is this line", and it was — every entry point still
// imports this, so none of them had to move.
//
// IT IS FLAG-CONDITIONAL, AND THAT IS A REQUIREMENT RATHER THAN A
// PREFERENCE. ChappiPageClient bounces to '/dashboard' when the assistant's
// flag is off (its own `router.replace('/dashboard')`), so an unconditional
// '/dashboard/urgans' would send a flag-off deployment into a redirect the
// moment anyone signed in. Resolving to the catalog when the flag is off
// matches that bounce, so the two agree and there is no loop either way.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

export const HOME_PATH = CHAPPI_ENABLED ? '/dashboard/urgans' : '/dashboard';

/** Where a curator-only account lands. That surface has no team chrome at all. */
export const CURATOR_HOME_PATH = '/curator';

/**
 * The post-auth destination for a given account.
 *
 * role='curator' means the account is curator-ONLY: it has no team and cannot
 * open any dashboard route, so sending it to HOME_PATH would bounce it straight
 * back out. Every other role resolves to HOME_PATH exactly as before.
 *
 * A DUAL account — a playlist owner who also runs releases — carries a team role
 * and therefore lands on the workspace, which is the founder call: the team
 * product is the bigger surface, and its pitch inbox is one tap away from the
 * identity card. Do not switch this to a curator_profiles lookup; the capability
 * is not the question here, "does this account have a team yet" is.
 *
 * Use this at any entry point a curator can actually arrive through: login, the
 * OAuth callback, and the root redirect. The remaining HOME_PATH importers
 * (onboarding completion, invite acceptance, paywall unlock, promo redemption,
 * post-checkout) are team-only flows a curator-only account never reaches.
 */
export function resolveHomePath(role?: string | null): string {
  return String(role || '').trim().toLowerCase() === 'curator' ? CURATOR_HOME_PATH : HOME_PATH;
}
