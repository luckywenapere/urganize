// The app's post-authentication front door — the ONE place that decides
// where a signed-in user lands. Every post-auth entry point (login, OAuth
// callback, root /, onboarding completion, invite accept, paywall unlock,
// promo redemption, post-checkout) imports this instead of hardcoding
// '/dashboard', so the landing surface can't drift between entries.
//
// Chappi (when enabled) is the landing surface; the releases/tasks
// workspace stays at /dashboard, one click away via the topbar. Uses the
// SAME flag as ChappiPageClient's own guard (which bounces
// /dashboard/chappi → /dashboard when off), so a flag-off build can never
// land users on a route that immediately bounces them.
//
// NEXT_PUBLIC_ env is inlined at build time, so this is a plain constant.
export const HOME_PATH =
  process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true' ? '/dashboard/chappi' : '/dashboard';
