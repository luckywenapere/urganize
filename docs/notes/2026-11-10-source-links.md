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
| /ow | oyin_wenapere | social |
| /cn | chidera_nnamani | social |
| /sws | soundwavespotlight | partner |
| /trm | therealmusicdistro | partner |
| /stmz | stmz | partner |
| /tt | tiktok | social |
| /tr | threads | social |
| /sc | snapchat | social |
| /wa | whatsapp | social |
| /u | urganization | social |

The founder gave the names for ow, cn, tr, sc and u on 11 Nov 2026 (#1196); before that they reported as typed, so older PostHog events carry the short form in `source` (the `slug` never changed, so break down by `slug`). ig, fb, yt, tt, wa, sws and trm are assumed from the short forms. stmz is not named yet and reports as typed. Changing a name is one word in the JSON; the slug in the link stays the same.

To add a link, add one line to `lib/source-links.json`. `lib/source-links.test.ts` fails if a slug is the name of a real page or redirect.

## Where to read the numbers

- **The admin page: `/admin/source-links` ("Short links"), since 27 Nov 2026 (#1409).** One row per link: taps and sign-ups this week, last week and in all, sign-ups for every 100 taps, and how many of the sign-ups made a rollout or pay today. Below it, the newest sign-ups by name. Weeks run Monday to Sunday, Lagos time; our own accounts are left out of sign-ups.
- Taps: PostHog event `source_link_clicked`, broken down by `slug`.
- Sign-ups: PostHog event `signup_from_source_link`, broken down by `slug`.
- Site visits: the utm tags show in Google Analytics and Vercel Analytics on urganize.app.

## What is saved (27 Nov 2026, #1409)

Each counted tap and each sign-up is also one row in `public.source_link_events` (migration `20261127120000_source_link_events.sql`), written after the reply by `lib/source-links-server.ts`. A tap row is the link and the time, nothing about the person. A sign-up row adds the new account, once per account. The admin page counts taps in the database (`source_link_tap_counts`), because the API returns 1,000 rows at most. The rules for the page are in `lib/admin-source-links.ts`.

The page counts from the day the table started filling. Taps from 10 Nov to that day are in PostHog only, unless they are copied in.

The name the page shows for a link is `label` in `lib/source-links.json`. It never leaves the app.

## Traps and limits

- Last link wins. Someone who taps /x then /ig is counted as ig at sign-up.
- A sign-up is tied to a link only in the same browser, within 30 days. An in-app browser (Instagram, X) that hands off to Chrome or Safari for sign-up loses it.
- Only the "make a team" path reports. Someone who joins a team by invite is not counted, on purpose.
- /sws does not carry the Sound Wave Spotlight referral code. Commission is the referral system's job (`?ref=CODE`, flag off); this only counts visits and sign-ups.
- Until 27 Nov 2026 nothing was stored in our database and PostHog held it all. See "What is saved" above.
- A tap has no person, so our own taps while testing a link are in the tap numbers.

## Verified

Run locally with `next dev`: each slug answers 307 with the right tags and cookie; a WhatsApp user agent gets the redirect with no cookie; an unknown slug under /api/go goes to the site untagged; `/zzz` is still a 404; the sign-up route answers 401 with no token. Unit tests in `lib/source-links.test.ts`.

## Not verified

Not run on production: the go.urganize.app 308 keeping the path, the cookie crossing from team.urganize.app to a sign-up, and the two events arriving in PostHog. Check after the first deploy by opening go.urganize.app/x on a phone.
