# Altlink pre-save and smart links (2026-10-22, live, no new flag beyond NEXT_PUBLIC_FEATURE_ALTLINK which ships on)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Altlink Partner API v2 pilot. Full record in `BUILD-NOTES-ALTLINK.md` (PM, design, engineering, QA, growth sign-offs). The rollout menu's Promote row "Pre-save link" (from release day "Smart link") reuses the old fan-capture scene key `?scene=capture` and renders `SmartLinkSection`: the Altlink link leads, the fan email page (`CaptureSection embedded`) sits in a fold under it. Fan capture is re-enabled for this view only through `CAPTURE || ALTLINK !== 'false'` (cut-features.json still forces NEXT_PUBLIC_FEATURE_CAPTURE=false).

- **One entry point, `syncSmartLink` (`lib/altlink/server.ts`).** Every trigger calls it after the reply: Metadata save, TRM webhook bringing a UPC/ISRC, cover art upload, opening the view, admin backfill (`/api/admin/altlink-backfill`, GET dry run). The rule for when a link is made is `decideCreate` in `lib/altlink/rules.ts`: a UPC or ISRC, a real title, an artist, a release date; never test or archived. A past date makes a normal smart link.
- **Idempotent by a claim row**: `release_smart_links.release_id` is unique and a `pending` row is inserted before Altlink is called. 422 `missing_identifier` = not ready (claim deleted). Other errors = `failed`, retried only by Try again or new facts.
- **creator_email**: TRM `distribution_submissions.artist_email`, else the rollout owner's `profiles.email`.
- **Webhook** `POST /api/webhooks/altlink`: HMAC of `"<t>." + raw body` (`lib/altlink/signature.ts`, server only; never import it from a client file), 5 minute window, `altlink_webhook_events.event_id` dedupe. 404 while `ALTLINK_WEBHOOK_SECRET` is unset.
- **Old `/capture/<token>`** links 307 to the Altlink link once it exists. Capture tables and emails are never deleted.
- **Not shown on purpose:** claim_url (stored), "View full analytics on Altlink", any Create tap.
- Migration `20261022120000_altlink_smart_links.sql`, applied to production Oct 22, 2026 (additive; RLS team read; webhook table service-role only).
