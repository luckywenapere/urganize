// The app's post-authentication front door — the ONE place that decides
// where a signed-in user lands. Every post-auth entry point (login, OAuth
// callback, root /, onboarding completion, invite accept, paywall unlock,
// promo redemption, post-checkout) imports this instead of hardcoding
// '/dashboard', so the landing surface can't drift between entries.
//
// 2026-07-23 (founder decision): the releases view at /dashboard is the
// landing surface again — signing in drops you on your releases, not on
// Chappi. Chappi keeps its page (/dashboard/chappi), topbar icon, and
// floating dock when its flag is on; it's just no longer the front door.
export const HOME_PATH = '/dashboard';
