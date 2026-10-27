# Posting plan (2026-10-27, v1.195.0, live at merge)

The content calendar, back in a lighter form. A short list of posts per ARTIST, so a team keeps the artist visible between releases. Founder asked for it on 27 Oct after managers said that between releases they are busy with the next record and with content and socials. Mocks approved the same day: `docs/mocks/content-calendar-artist/mock.html`.

## Why the old calendar failed, and what changed

Measured on 27 Oct in production: 4 calendars, 5 posts, 3 accounts, none ever marked posted, last post added 18 Aug. It was switched off on 3 Sep and hidden in the 16 Oct cuts. Our reading (not measured): it lived inside a release, so it vanished between releases; you set up a calendar per platform before the first post; each post had 8 fields; nothing reminded anyone on the day.

This version:

- **Lives on the artist** (`artist_posts.artist_id`). A post may name a release (`release_id`, optional); nothing in the UI sets it yet.
- **Four fields**: what, day, where (optional), who posts. No calendars, no month grid, no caption, format, pillar, status choice or link.
- **Statuses**: planned, done, skipped.
- **UrgAns fills it** from one message (`plan_posts`, confirmation card, can repeat weekly up to 8 weeks).
- **Home shows today's post** with Done / Skip, plus "This week 1 of 3 posted" and the next one.
- **WhatsApp nudge on the day** for the person posting, through the chasing pipeline.

The old calendar is untouched: its flag stays forced off in `lib/cut-features.json`, its tables (`content_calendars`, `content_posts`) and its tools (`CUT_CHAPPI_TOOLS`) stay as they were.

## Files

- `supabase/migrations/20261027180000_artist_posting_plan.sql`: `artist_posts`; `whatsapp_settings.remind_posts` (default true); `whatsapp_contacts.last_post_id`; `whatsapp_messages.post_id` plus a unique index (post, day). RLS on, no policies, service role only. **Applied 27 Oct**; backups `whatsapp_settings_backup_20261027`, `whatsapp_contacts_backup_20261027`, `whatsapp_messages_backup_20261027` (all 0 rows).
- `apps/web/lib/posting-plan.ts` (pure: weeks run Monday to Sunday in Lagos days, buckets, week summary, next post, input checks, weekly expansion, nudge text) with `posting-plan.test.ts`.
- `apps/web/lib/posting-plan-server.ts`, `lib/posting-plan-client.ts`.
- Routes: `app/api/workspace/artists/[artistId]/posts` (GET, POST single or `{ posts: [] }` up to 60), `.../posts/[postId]` (PATCH, DELETE), `app/api/workspace/posts/today` (Home). Behind the artist page flags (`NEXT_PUBLIC_FEATURE_ARTIST_PAGE` and `_WORKSPACE`, both on), so no new flag. The artist routes accept the internal actor for UrgAns.
- UI: `components/artists/PostingPlanCard.tsx` (on the artist page, under Rollouts), `components/home/TodayPostCard.tsx` (Home, after the rollout offer, draws nothing without posts this week or next).
- UrgAns: `lib/chappi/tool-families/posting-plan.ts` (`list_artist_posts`, `plan_posts`), one line in the system prompt.
- WhatsApp: `lib/whatsapp/server.ts` (`nudgeOnePost`, `actOnPostReply`), `reply-intent.ts` (Skip), the settings switch "Remind people to post, on the day".

## Traps

- **One WhatsApp message per person per day, tasks first.** The sweep chases a due task if there is one; only a day with no task to chase carries the post nudge. Between releases there are usually no tasks, which is the case this is for. Mid-release, a post nudge may not go out; Home still shows it.
- **Done after a post nudge means the post.** `last_post_id` is set by the nudge and cleared by the next task chase, so "Done" goes to whichever came last.
- **Who posts** must be a joined team member (has a user id). Anyone else, or nobody named, falls back to whoever added the post. The artist gets nudged only if they are on the team with a number and said YES.
- **Template**: outside the 24-hour window the nudge needs an approved template, `WHATSAPP_POST_CONTENT_SID`, 3 variables: `Morning {{1}}. Post "{{2}}" for {{3}} today? Reply Done or Skip.` ({{3}} is the artist plus "on instagram" when set). Quick-reply buttons Done / Skip.
- **Not live on WhatsApp**: chasing is still not connected to Twilio (see the WhatsApp chasing note), so nothing sends yet. The artist page and Home carry it until then.
- **Not verified in a browser** at the time of writing: logic tested, routes and UI type-checked.
