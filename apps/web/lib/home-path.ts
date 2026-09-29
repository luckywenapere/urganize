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
// this became unconditional for a while — no longer reading the assistant's
// flag, so a signed-in user landed on their releases whether or not UrgAns
// was enabled.
//
// 2026-09-09 (founder decision): the assistant is the front door again, and
// the flag-conditional form is restored with it. This is the FOURTH flip of
// this value (07-15 assistant, 07-23 catalog, 07-31 assistant, 08-12 catalog,
// now assistant) — the reason this constant exists is that every entry point
// moves together, so each reversal is this one line.
//
// Home tab (NEXT_PUBLIC_FEATURE_HOME, built flag-off): when on, Home is the
// front door and takes precedence over the assistant — UrgAns stays one tap
// away (the topbar icon, the side menu row), the same relationship the
// assistant itself has always had with the catalog. Checked FIRST, before
// the Chappi flag, so a deployment that has both on lands on Home rather
// than UrgAns.
//
// THE FLAG READS ARE NOT OPTIONAL. HomePageClient bounces to '/dashboard'
// when NEXT_PUBLIC_FEATURE_HOME is off (mirroring ChappiPageClient's own
// bounce for its flag), so an unconditional '/dashboard/home' would send
// every flag-off deployment through a bounce on every sign-in. Falling
// through to the Chappi check — and finally to '/dashboard' — matches those
// bounces exactly, so there is no round trip in any flag combination.
//
// It is inlined at build time like every other NEXT_PUBLIC_* read, so a flag
// flip needs a deploy that actually rebuilds apps/web before this moves.
export const HOME_PATH =
  process.env.NEXT_PUBLIC_FEATURE_HOME === 'true'
    ? '/dashboard/home'
    : process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true'
      ? '/dashboard/urgans'
      : '/dashboard';

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
