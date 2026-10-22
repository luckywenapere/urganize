# The Distribute step (2026-10-02, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

First piece of distribution ordering (strategy row 11). Behind `NEXT_PUBLIC_FEATURE_DISTRIBUTION` (default off). No migration. Not a scope expansion: the strategy doc commits distribution through Therealmusicdistro (TRM), agreement signed.

**AMENDED 2026-10-09: the flag is deleted and the step is always on.** It had already been switched on in production (found by probing), and the founder said not to ship it behind a flag. The checklist this section describes was replaced the same day by the check before distribution (see "The check before distribution" at the end of this file); the rest of this section (the hand-off, the partner, the billing event) still describes what is built. The "Activation" line at the end of this section is history.

**What it is, and what it is not.** A "Distribute" row in the rollout menu, after Metadata, opens a scene (`?scene=distribute`) with TRM as the default distributor, a button that opens TRM's own sign-up (`https://therealmusicdistro.com/urganize/`, which logs the account on their side), a link to their terms, and a readiness checklist: date, song, cover art, genre, language and explicit flag are required; credits and label name are recommended. **It is not an order form and takes no payment.** The agreement's Option A (we collect through Paystack and pay TRM the partner price monthly) needs TRM's API, which they have not delivered. Until it arrives people sign up and pay on TRM's site. Switching to Option A is the next phase: Paystack checkout, accept TRM's terms before the first order (the contract requires showing them), status tracking.

**Things worth knowing:**

1. The rules and copy are `lib/distribution.ts` (pure, 17 tests); the reads and the one write are `lib/distribution-server.ts`; the route is `/api/releases/[releaseId]/distribution` (GET read access, POST write access, flag 404 first, enlisted in `release-access-guard.test.ts`).
2. A hand-off is a `distribution_handoff` row in `billing_events` (free-text type, no migration), one per tap, stamped with the release owner. The scene shows "Someone on your team opened their sign-up on ...".
3. **TRM's prices are not in the app.** The contract is confidential and the album price does not exist on their site. Free ISRC and UPC come with their sign-up, and the scene says so.
4. The release-date warning uses a 14 working day delivery window (the contract's) and a 21 calendar day safe lead.
5. `distribute` is out of the scene cache (it fetches fresh so a fix shows on return) and is gated in `resolveActiveScene`.
6. Fix links go to the Metadata, Song and Cover art scenes only where those are switched on.

**Verified:** 6,056 tests pass, `tsc` clean apart from the documented errors, lint at the 3-error baseline with one new warning (the fetch-on-mount effect, the accepted React 19 pattern), `next build` green with the flag on and `/auth`, `/dashboard`, `/locked`, `/onboarding`, `/settings` still static. The scene was looked at in a browser through a throwaway page (removed). **Not verified:** nothing has run with a real session or against TRM; the hand-off row has never been written for real.

**Activation:** set `NEXT_PUBLIC_FEATURE_DISTRIBUTION=true` (and turn `NEXT_PUBLIC_FEATURE_METADATA` back on, so the fix links have somewhere to go) in Vercel `Web` with a commit that rebuilds `apps/web`. Changelog entry and version bump at the flip, not at merge.
