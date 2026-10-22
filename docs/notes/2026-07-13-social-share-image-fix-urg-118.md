# Social share image fix — URG-118 (2026-07-13)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Sharing any urganize.app URL on X (and other social crawlers) showed no preview card. Two root causes:

1. **Nested pages had no share image at all.** The homepage got its image from the `app/opengraph-image.png` file convention, but that image is **not inherited by nested route segments** — every page built by `lib/seo.ts:buildPageMetadata` (`/features`, `/pricing`, `/team`, `/press`, `/changelog`, `/privacy`, `/terms`, `/subprocessors`) rendered only `twitter:card` with no `og:image` / `twitter:image`.
2. **The file-convention image URL resolved against the runtime host.** In production that host was an SSO-gated `*.vercel.app` preview URL (the apex was answering from a branch preview, not the pinned production deploy), so the image 302'd to `vercel.com/sso-api` — crawlers hit a login wall and rendered no card.

**Fix (code):** moved the branded card to `apps/homepage/public/opengraph-image.png` (stable public asset, no per-deploy hash) and wired it **explicitly** via `openGraph.images` + `twitter.images` in `buildPageMetadata`, using the absolute canonical URL `https://urganize.app/opengraph-image.png`. Every page now emits a single canonical `og:image` + `twitter:image` that never depends on host resolution. The old `app/opengraph-image.png` file convention was removed to avoid a duplicate/conflicting tag on the homepage.

**Still needs doing (infra, not code):** pin the `urganize.app` apex to the **production** deployment in Vercel (`the-urganization` project → Domains). Until then the apex may answer from a preview deploy. ~~Also: `www.urganize.app` currently 308-redirects to the bare apex — the reverse of the "bare → www" note in the Deploy Configuration section; reconcile that doc when convenient.~~ Doc reconciled 2026-08-13 (the redirect direction is confirmed `www` → apex; the Deploy Configuration line now says so).

After deploy, re-scrape the URL in the X Card Validator / relevant debuggers to bust their caches — social platforms cache the old (broken) result aggressively.
