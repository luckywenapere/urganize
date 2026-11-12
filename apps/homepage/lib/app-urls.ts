// Single source of truth for links from the marketing site INTO the product
// app, mirroring the lib/community.ts pattern so the header, the /login
// redirect (next.config.ts), the /signup page and anything added later can't
// drift apart.
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

/**
 * Is sign-up open? Mirrors apps/web's SIGNUP_OPEN (lib/access-gate.ts), open
 * since 2026-11-08 (#1140). The site followed on 2026-11-10 (#1177). Urganize
 * is a public beta (founder, 2026-11-10) with no Free plan (#1158): anyone can
 * create an account, and plans rollouts once the team picks a plan. Every primary button, the hero and
 * final forms, and the "how do I get in" lines read PRIMARY_CTA, so closing
 * sign-up again is this one line (and the app's).
 */
export const SIGNUP_OPEN = true;

export const PRIMARY_CTA = SIGNUP_OPEN
  ? {
      href: APP_SIGNUP_URL,
      label: "Create your account",
      /** The line under a button. "Cancel or change your plan any time" is
       *  true of the app: Settings > Billing has a self-serve cancel flow and
       *  plan changes (#1217). The bare "PUBLIC BETA" left people guessing
       *  what beta meant for them. */
      note: "Public beta. Pick a plan to start your first rollout. Cancel or change your plan any time.",
      /** The small caps line under the hero button. */
      hint: "PUBLIC BETA · CANCEL ANY TIME",
    }
  : {
      href: WAITLIST_URL,
      label: "Join waitlist",
      note: "We are letting people in from the waitlist.",
      hint: "PRIVATE BETA · INVITES GO OUT WEEKLY",
    };

/** Curator application form, the target of the urganize.app/curator short link. */
export const APP_CURATOR_APPLY_URL = `${APP_ORIGIN}/curator/apply`;
