// Single source of truth for links from the marketing site INTO the product
// app, mirroring the lib/community.ts pattern so the header, the /login and
// /signup pages, and anything added later can't drift apart.
//
// The split between login and signup is not cosmetic: apps/web's /auth is
// LOGIN-ONLY (see apps/web/app/auth/AuthPageClient.tsx — the old in-page
// mode toggle was removed and ?mode=signup now bounces). Organic signup
// starts at /onboarding. Pointing a "Sign up" CTA at /auth would land people
// on a form that has no way to create an account.

const APP_ORIGIN = "https://app.urganize.app";

/** Existing customers signing in. */
export const APP_LOGIN_URL = `${APP_ORIGIN}/auth`;

/** New accounts. NOT /auth — see the note above. */
export const APP_SIGNUP_URL = `${APP_ORIGIN}/onboarding`;

/** Password reset, linked from /login so users don't bounce off the app. */
export const APP_PASSWORD_RESET_URL = `${APP_ORIGIN}/auth/forgot-password`;
