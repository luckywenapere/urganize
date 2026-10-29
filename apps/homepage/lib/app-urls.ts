// Single source of truth for links from the marketing site INTO the product
// app, mirroring the lib/community.ts pattern so the header, the /login and
// /signup pages, and anything added later can't drift apart.
//
// The split between login and signup is not cosmetic: apps/web's /auth is
// LOGIN-ONLY (see apps/web/app/auth/AuthPageClient.tsx — the old in-page
// mode toggle was removed and ?mode=signup now bounces). Organic signup
// starts at /onboarding. Pointing a "Sign up" CTA at /auth would land people
// on a form that has no way to create an account.

export const APP_ORIGIN = "https://team.urganize.app";

/** Existing customers signing in. */
export const APP_LOGIN_URL = `${APP_ORIGIN}/auth`;

/** New accounts. NOT /auth — see the note above. */
export const APP_SIGNUP_URL = `${APP_ORIGIN}/onboarding`;

/**
 * Where every "Join waitlist" button goes (2026-10-07, founder call: the site is
 * a waitlist again). The inline form on the homepage, id="waitlist" in
 * FinalCTASection. A root-relative href so it works from any marketing page and
 * scrolls when already on the homepage. Sign-in stays on APP_LOGIN_URL.
 */
export const WAITLIST_URL = "/#waitlist";

/** Password reset, linked from /login so users don't bounce off the app. */
export const APP_PASSWORD_RESET_URL = `${APP_ORIGIN}/auth/forgot-password`;
