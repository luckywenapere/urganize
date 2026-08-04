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
export const HOME_PATH =
  process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true' ? '/dashboard/urgans' : '/dashboard';
