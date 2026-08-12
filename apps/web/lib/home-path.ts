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
// The assistant is still one tap away from the topbar, the mobile nav bar
// and the identity panel, and the side rail still opens beside every page.
// This is the THIRD flip of this value (07-15 assistant, 07-23 catalog,
// 07-31 assistant, now catalog) — the reason this constant exists is that
// every entry point moves together, so a future reversal is this line.
export const HOME_PATH = '/dashboard';

/** Where a curator lands. Their surface has no team chrome at all. */
export const CURATOR_HOME_PATH = '/curator';

/**
 * The post-auth destination for a given account.
 *
 * Curators (the playlist-pitching account type) have no team and cannot open
 * any dashboard route, so sending them to HOME_PATH would bounce them straight
 * back out. Every other role resolves to HOME_PATH exactly as before.
 *
 * Use this at any entry point a curator can actually arrive through: login, the
 * OAuth callback, and the root redirect. The remaining HOME_PATH importers
 * (onboarding completion, invite acceptance, paywall unlock, promo redemption,
 * post-checkout) are team-only flows a curator never reaches.
 */
export function resolveHomePath(role?: string | null): string {
  return String(role || '').trim().toLowerCase() === 'curator' ? CURATOR_HOME_PATH : HOME_PATH;
}
