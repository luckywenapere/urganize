# Short links that say where people come from (2026-11-10, #1185, no flag)

Founder ask, 10 Nov 2026: go.urganize.app/x, /ig, /fb, /yt, /ow, /cn, /sws, /trm, /stmz, for bios and posts, so we can tell which channel brings people.

## How it works

1. Vercel answers go.urganize.app with a 308 to the same path on team.urganize.app (see the two front doors note).
2. `apps/web/next.config.js` rewrites `/<slug>` to `/api/go/<slug>` for every slug in `apps/web/lib/source-links.json`.
3. `GET /api/go/[slug]` sends a `source_link_clicked` event to PostHog (anonymous, no person profile), sets the cookie `urg_src=<slug>` for 30 days on `.urganize.app`, and 307s to `https://urganize.app/?utm_source=…&utm_medium=…&utm_campaign=go_link`. Link previews, bots and prefetches are redirected but not counted and get no cookie. An unknown slug goes to the site with no tags.
4. When a new account's team is made, onboarding calls `POST /api/source-link/signup`. It reads the cookie, sends `signup_from_source_link` against the new account (accounts under 7 days old only), and clears the cookie.

The cookie is httpOnly and holds only the slug. The slug is always looked up in the list, never passed on.

## The list

| Link | utm_source | utm_medium |
|---|---|---|
| /x | x | social |
| /ig | instagram | social |
| /fb | facebook | social |
| /yt | youtube | social |
| /ow | ow | social |
| /cn | cn | social |
| /sws | soundwavespotlight | partner |
| /trm | therealmusicdistro | partner |
| /stmz | stmz | partner |

The names for ig, fb, yt, sws and trm are assumed from the short forms. ow, cn and stmz were not spelled out, so they report as typed. Changing a name is one word in the JSON; the slug in the link stays the same.

To add a link, add one line to `lib/source-links.json`. `lib/source-links.test.ts` fails if a slug is the name of a real page or redirect.

## Where to read the numbers

- Taps: PostHog event `source_link_clicked`, broken down by `slug`.
- Sign-ups: PostHog event `signup_from_source_link`, broken down by `slug`.
- Site visits: the utm tags show in Google Analytics and Vercel Analytics on urganize.app.

## Traps and limits

- Last link wins. Someone who taps /x then /ig is counted as ig at sign-up.
- A sign-up is tied to a link only in the same browser, within 30 days. An in-app browser (Instagram, X) that hands off to Chrome or Safari for sign-up loses it.
- Only the "make a team" path reports. Someone who joins a team by invite is not counted, on purpose.
- /sws does not carry the Sound Wave Spotlight referral code. Commission is the referral system's job (`?ref=CODE`, flag off); this only counts visits and sign-ups.
- Nothing is stored in our database, so there is no admin screen. PostHog holds it.

## Verified

Run locally with `next dev`: each slug answers 307 with the right tags and cookie; a WhatsApp user agent gets the redirect with no cookie; an unknown slug under /api/go goes to the site untagged; `/zzz` is still a 404; the sign-up route answers 401 with no token. Unit tests in `lib/source-links.test.ts`.

## Not verified

Not run on production: the go.urganize.app 308 keeping the path, the cookie crossing from team.urganize.app to a sign-up, and the two events arriving in PostHog. Check after the first deploy by opening go.urganize.app/x on a phone.
