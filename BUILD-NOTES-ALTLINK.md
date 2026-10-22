# Altlink pre-save / smart link: build notes

Pilot: Altlink Partner API v2, 90 days from Oct 21, 2026. Five sign-offs, in order.

## 1. PM

**The job, in one line:** every rollout gets one link fans can save before release day and stream from after it, made by itself the moment the code exists, so a manager has something to share (and a number to check) every day before the drop.

### What already exists (read, not rebuilt)

- The rollout workspace: `/dashboard?release=<id>`, `WorkspaceView`, `TasksPanel`, `ReleaseScenePanel`. Scenes are `?scene=<name>`.
- The menu: `lib/release-menu.ts` (order and groups) and `lib/rollout-menu.ts` (rows). Fan capture is scene `capture`, row "Collect fan emails", Promote group.
- Fan capture: `CaptureSection`, routes under `/api/releases/[id]/capture`, public page `/capture/[token]`, tables `release_capture_pages` and `release_capture_leads`. **Cut on Oct 16, 2026** (`NEXT_PUBLIC_FEATURE_CAPTURE` forced off in `lib/cut-features.json`). Production holds **0 capture pages and 0 captured emails** (checked Oct 22, 2026), so the merge risks no fan data.
- Codes: `release_metadata.upc` / `.isrc` (typed on Metadata, `PATCH /api/releases/[id]/metadata`) and `distribution_submissions.upc` / `.isrc` (written by the TRM webhook).
- The TRM webhook (`/api/webhooks/trm`, `lib/trm/webhook.ts`) is the model for the new one.
- `release_events.type` is free text, so `smart_link_created` / `smart_link_converted` need no migration.

### Requirements

1. **Auto-create.** A rollout gets an Altlink link, with no tap, once it has: a UPC (12 or 13 digits) or an ISRC (12 letters and digits) from Metadata or from TRM; a title that is not "Untitled rollout"; an artist name; a release date. Not for test or archived rollouts.
   - Release date in the future: created as a pre-save (`release_date` sent).
   - Release date today or past: created as a plain smart link (no `release_date` sent).
2. **Idempotent.** `external_release_id` = our release id. Our own table holds one row per release (unique `release_id`), claimed before the call, so a double save never makes two links.
3. **Triggers:** the Metadata save; the TRM webhook delivering codes; the cover art changing (patch); opening the view (catches anything missed); and a one-off admin backfill for existing rollouts, throttled under 120 requests a minute.
4. **Silent PATCH** when an ISRC is added after the link exists, or the cover art changes.
5. **`creator_email`:** the artist's email from the TRM submission (`distribution_submissions.artist_email`) when we hold one, else the email of the rollout owner (`profiles.email` for `releases.owner_user_id`).
6. **Webhook** `POST /api/webhooks/altlink`: signature `t=<ts>,v1=<hex>`, HMAC-SHA256 of `"<t>." + raw body`, timing-safe, 5-minute window, dedupe on `event_id`. Handles `link.created`, `link.platforms_updated`, `link.converted`, `presave.signup`.
7. **Stats:** fetched when the view opens, cached 10 minutes per link, never polled from lists.
8. **One Promote entry** with fan capture (see section 2). Old `/capture/[token]` links send fans to the Altlink link once it exists. Captured emails and capture tables are never touched.
9. **Attribution:** "Powered by Altlink" at the foot of every state that touches Altlink.
10. **Feature flag** `NEXT_PUBLIC_FEATURE_ALTLINK`, on unless set to exactly `false` (house rule: ships on). Set `true` in Vercel too.

### Acceptance

- Typing a UPC on Metadata for a named, dated rollout makes one link; saving again makes none.
- A code arriving from TRM does the same.
- A past release date makes a smart link, not a pre-save.
- A 422 `missing_identifier` leaves the rollout in "not ready", never an error.
- Webhook: a tampered or stale delivery is refused (401); a replayed `event_id` changes nothing.
- The view shows the right one of five states (no code, creating, pre-save live, released, error) at 375, 390 and 1440px.

### Out of scope

Per-track album pre-saves (singles first, as with TRM), editing slugs, city or referrer analytics, a claim button or any `claim_url` UI (it is still stored), pasting store URLs, Home or notification cards.

### Linear

Could not file: Linear answered "You've exceeded the free issue limit for this workspace" (Oct 22, 2026). Commits say "Altlink pilot" instead of an issue id.

**PM sign-off.** Scope above. Next: design.

## 2. Designer

Built from the mocks Oyin approved (Owambe Weather set), with the three changes he asked for. Reference HTML: `docs/mocks/altlink/mock.html`; phone screenshots beside it.

### The merge with fan capture

- **One Promote row.** It reuses the old fan-capture scene key (`?scene=capture`), so every old link to it still lands here. The row reads **"Pre-save link"** until release day and **"Smart link"** from release day on. The separate "Collect fan emails" row is gone.
- **Inside the view, the link leads and fan capture follows.** Once an Altlink link exists, the page is the link (hero, link row, Share link, numbers). The fan email page sits under one fold row at the bottom, "Fan email page", closed by default, so the screen keeps exactly one green button.
- **Before a code exists** the view is the quiet row ("Pre-save link · Unlocks with a UPC or ISRC", action **Add UPC**, outline, opens Metadata on the UPC field) and then the fan email page, open, whose own "Build the page" is the one green action.
- **Old `/capture/<token>` links** send fans straight to the Altlink link once it exists (a 307, so it can be undone). Altlink's own page asks fans for their email, and two email asks in a row lose fans. Nothing is deleted. (Production has no capture pages yet, checked Oct 22.)

### States (one hero sentence, one green action each)

| State | Chip | Hero | Meta | Green action |
|---|---|---|---|---|
| No code | none | quiet row only | Unlocks with a UPC or ISRC | the fan page's own, if any |
| Creating | none | Making your pre-save link. | From the rollout · nothing to type | none (it makes itself) |
| Pre-save live | LIVE (green dot) | Drops in N days. | FRI 6 NOV · MIDNIGHT LAGOS · THEN STREAMING | Share link |
| Released | OUT NOW | Out now. Same link. | Pre-savers emailed at midnight | Share link |
| Error | NOT CREATED (red dot) | Altlink didn’t answer. | Nothing was created · your details are safe | Try again |

- Creating and error also show the facts card from the mock (cover, title, artist · type, Drops row, UPC/ISRC row with its source, "From TRM" or "From details"), so the manager sees what will be sent.
- Numbers are rows in one rounded card: Visits, Clicks (CTR as mono meta), Pre-saves; "So far" on the left, "Updated 9:30" on the right; skeleton bars while loading. A block with nothing to show does not render.
- Released adds **Stores** (tick + name + mono URL + open icon; still-looking stores at 55% with LOOKING and a quiet ring; "5 of 8 found") and **Where fans click** (platform, clicks · %, thin bar).
- Desktop: link box and Share link side by side; released splits Stores | numbers into two columns at wide widths. Phone: Share link (or Try again) full width under the content.
- Foot of every Altlink state: boxed "A" + POWERED BY ALTLINK, Space Mono, 55%.
- Removed from the mocks: "View full analytics on Altlink", and the "Create pre-save link" tap.
- Nav untouched.

**Designer sign-off.** Build exactly this. Next: engineering.

## 3. Staff Engineer

What was built, all behind `NEXT_PUBLIC_FEATURE_ALTLINK` (ships on; only `false` switches it off):

- **`lib/altlink/`.** `rules.ts` (pure: code checks, when a link is made, Lagos dates, payload readers, view state), `signature.ts` (server only: `X-Altlink-Signature` check, kept apart so the browser never loads node crypto), `client.ts` (bearer key from env only, 10s timeout, backoff on 429 and 5xx with Retry-After, never logs the key), `server.ts` (the one `syncSmartLink`, the view, the webhook, the backfill).
- **One entry point makes or updates a link: `syncSmartLink`.** Called after the reply from the Metadata save, the TRM webhook when it brings a UPC or ISRC, a cover art upload, opening the view, and the admin backfill. A link is made when there is a UPC (12–13 digits) or ISRC, a title that is not "Untitled rollout", an artist and a release date; never for test or archived rollouts. A past date makes a normal smart link (no date sent).
- **Idempotent.** The unique `release_id` is claimed with a `pending` row before Altlink is called; a second save gets `busy`. Altlink also dedupes on `external_release_id`. A 422 `missing_identifier` deletes the claim and reads as "not ready". Any other error marks the row `failed` and is only retried by Try again or when the codes or cover change.
- **Silent PATCH** of the ISRC and the cover art after the link exists (`sent_isrc`, `sent_artwork_asset_id` record what Altlink has).
- **creator_email:** `distribution_submissions.artist_email` (the artist's TRM email) when we hold one, else `profiles.email` of `releases.owner_user_id` (the manager who owns the rollout).
- **Routes.** `GET/POST /api/releases/[id]/altlink` (team read / team write; GET fetches stats at most every 10 minutes per link, never on a list), `POST /api/webhooks/altlink` (raw body, HMAC, 5 minute window, `event_id` dedupe by primary key, handles `link.created`, `link.platforms_updated`, `link.converted`, `presave.signup`), `GET/POST /api/admin/altlink-backfill` (admin only, dry run by GET, about 100 calls a minute).
- **Old `/capture/<token>`** 307s to the Altlink link once it exists. Capture tables and emails untouched.
- **release_events:** `smart_link_created`, `smart_link_converted`.
- **Migration `20261022120000_altlink_smart_links.sql`** applied to production `jsueloedjwpfiyzfoutv` on Oct 22, 2026, 09:2x UTC. Additive only: two new tables. Before: a full column snapshot at 09:16:20 UTC (1,472 public columns, 134 tables). PITR is not enabled on this project and the backups list is empty, so there was no PITR timestamp to note. After: 1,495 columns (exactly the 23 new ones), RLS on both, `authenticated` can only SELECT `release_smart_links` (and an authenticated test select sees 0 rows it does not own), `anon` has nothing, `altlink_webhook_events` is service-role only.
- **Vercel Production** already had `NEXT_PUBLIC_FEATURE_ALTLINK=true`, `ALTLINK_API_KEY` and `ALTLINK_WEBHOOK_SECRET` (set Oct 21). The key itself cannot be read back (sensitive), so the first real create is what proves it.

**Engineer sign-off.** Built to the design. Next: QA.

## 4. QA

- Unit tests (new): `lib/altlink/rules.test.ts` (signature valid / tampered / wrong secret / stale / malformed, trigger conditions: no code, future date, past date, release day, untitled, test, archived), `client.test.ts` (bearer header never in the URL, 429 backoff with Retry-After, 5xx gives up after four, 422 not retried and read as not ready, 401 not retried), `server.test.ts` (one link from a ready rollout, TRM artist email preferred, two saves at once make one link, no code calls nothing, past date sends no date, 422 leaves no row, failed then Try again, silent ISRC patch, old fan page redirect only for a live link, webhook dedupe on event_id, platforms and converted once, unknown link). 40 tests, all pass.
- Full suite: 19 failures, the same 19 on a clean copy of the base commit (pre-existing, mostly line-ending guards on Windows, including the pricing "Unlimited releases" vocabulary one). None from this change.
- `tsc --noEmit` for apps/web clean (packages/changelog checked at release).
- Rendered with each state faked at 375 and 1440: pre-save live, released (stores, so far, where fans click), failed (facts + Try again), no code (quiet row + Add UPC + open fan page). One green button per screen, no sideways scroll at 375.
- Not done here: a signed webhook replay against a running server (no local secret); covered by the unit tests on the same functions.

**QA sign-off.** Ship.

## 5. Growth

- The reason to open Urganize before release day: the link is already made, with live Visits, Clicks and Pre-saves, and Share link is one tap to the phone's share sheet (falls back to copying). Copy is beside the link.
- "Powered by Altlink" is quiet: mono, 55%, at the foot.
- No admin metrics were added in this pass, so there is nothing to exclude internal accounts from yet. When smart links get a metrics row, read `release_smart_links` through `withoutInternalAccounts` (`lib/internal-accounts.ts`).
- Two follow-ups, not built: (1) a nudge on the rollout's Home card the day the link goes live ("Your pre-save link is ready. Share it."); (2) a weekly count of pre-saves per rollout in the Monday email.

**Growth sign-off.**
