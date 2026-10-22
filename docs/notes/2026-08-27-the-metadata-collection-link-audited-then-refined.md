# The metadata collection link, audited then refined (2026-08-27, v1.3.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder spec, two-phase: audit the credit-collection flow first, then close the
gaps. **The feature already existed** — collaborator credit capture, built
2026-07-31 (URG-108) and live behind `NEXT_PUBLIC_FEATURE_METADATA`. The audit
found the whole spine working (one link per release, public no-login form,
submissions attached to the release and listed for the owner, split totals shown
plainly without blocking) and six real gaps. **No new flag**, and no scope
expansion: this is the same surface, corrected.

**Switched off in production (2026-09-03, founder call).** `NEXT_PUBLIC_FEATURE_METADATA`
is off again — the Metadata scene, its entry points, both `/credits/[token]`
routes and the collaborator credit API all 404/bounce until it is flipped back.
No code removed and no data touched: every existing `release_metadata` row,
`release_credit_links` row and submitted credit stays exactly as it was.
Turning it back on is the one-line env flip this feature has always been.

Founder decisions taken before building: **skip** the expected-contributor count
("N answers" stands), **keep the 11 detailed roles** rather than collapsing to
the spec's 5 (a superset, and collapsing would migrate real rows and lose
precision distributors use), **no tier gating**. A contributor still only ever
enters their own splits, which the spec preferred and the code already did.

**One migration, `20260827100000_credits_link_close_and_email_upsert.sql`,
deliberately covering all three schema changes in one file** — the feature is
live and the code reads all three, so a partial hand-application leaves the app
selecting columns that do not exist. **⚠️ Its section 2 DELETES duplicate rows**
(keeping the newest per release+email) because the unique index cannot build
otherwise.

**Six things worth knowing before editing any of this:**

1. **Closing a link is not revoking it, and that distinction is the feature.**
   `release_credit_links.closed_at` (timestamptz, NULL = open, so every existing
   row stays open with no backfill and reopen is just `= null`). The token still
   resolves: `loadPublicCreditForm` now returns a discriminated union
   (`ok` / `closed` / `missing`) and the public page renders "This request is
   closed" with the release still named, rather than a 404. Everything else still
   collapses to `missing` — a rotated-away token must never be distinguishable
   from one that never existed. **Regenerate clears `closed_at`** on purpose: a
   regenerated-but-still-closed link is a trap state nothing in the UI explains,
   so Regenerate means "fresh live link" and Close means "pause the one I have".
2. **The public POST refuses a closed link BEFORE reading the body**, at 403.
   Someone who loaded the form while it was open and submits after must be told
   the link closed, not nitpicked about a field.
3. **Same-email resubmission updates instead of duplicating, and `.upsert()`
   cannot do it.** supabase-js hands `onConflict` to PostgREST as a plain COLUMN
   LIST, so it cannot target the partial expression index this needs
   (`(release_id, lower(email)) where email is not null`). So the route
   selects-then-updates-or-inserts, retrying an insert that fails `23505` as an
   update. Matching happens in JS, never through `.ilike()` — `_` is a wildcard
   and underscores are common in email local parts, so `john_doe@x.com` would
   match `johnXdoe@x.com`. `created_at` is never touched (their place in the
   owner's list is when they FIRST answered); the 100-submission cap applies to
   the insert path only, since a correction adds no row.
4. **The split rules live once, in `lib/credit-submissions.ts`, and are run by
   both the form and the route** so the two cannot disagree — the
   `asset-constants.ts` pattern. Required for writers (songwriter / composer /
   lyricist) and producers; credit-only roles (engineer, vocalist, musician,
   featured artist) are asked for nothing, because they are usually credited
   without holding a share and demanding a number teaches people to invent one.
   A second decimal place is **rejected, not rounded** — silently turning 33.33
   into 33.3 changes a number a publisher gave them.
5. **`SCENE_REVALIDATE_ON_LOAD` in `lib/scene-cache.ts` is why a submission is
   never hidden.** The 30s freshness window meant a submission landing in that
   window was invisible even after a full page reload (the disk-adoption path
   returns a still-fresh persisted copy with zero requests). Metadata now always
   revalidates in the background on a real open: it still paints from cache, so
   nothing flickers, but the fetch always runs. **Prefetch passes are exempt** or
   the idle prefetch would re-fetch seconds after a real load. In-flight dedup
   stays first and unconditional. `capture` has the identical bug (fans post
   leads to a public page) and is deliberately **not** included — a one-line
   addition when someone wants it.
6. **`patchScene` in `MetadataSection.tsx` reads the store at call time**, not
   the render closure, precisely because of item 5: a background fetch can now
   land between a render and a mutation resolving, and merging onto the older
   copy would re-stamp superseded submissions as fresh.

**Also fixed, each a real defect rather than polish:** every input on the public
form was `text-sm`, which is **13px in this repo's preset** (it shifts the whole
scale down — `text-base` is 14px, only `text-lg` clears iOS Safari's 16px
zoom threshold), so the form zoomed the page on every field tap on the one device
most collaborators open it on. `country` and `publisherIpi` were collected from
day one and rendered **nowhere**, so an owner doing a distributor handoff could
not tell they had them. **ISWC did not exist anywhere in the repo** — added to
`release_metadata` and Step 1 (now 9 fields), release-level and owner-entered
because ISRC identifies the recording, UPC the release and ISWC the song, so it
is never asked of a collaborator. It also had to join `METADATA_FIELDS` in
`lib/chappi/tool-families/metadata.ts` or an assistant metadata update would
have nulled it, which is exactly the full-replace trap that file's header warns
about. Em dashes removed from the user-facing copy on both public share pages.

**Tests: the feature had ZERO and now has 67** across
`lib/credit-submissions.test.ts`, `lib/credits-server.test.ts` and the
scene-cache additions. **Mutation-tested rather than merely asserted:** making
`requiredSplits` ignore writer roles, and dropping metadata from
`SCENE_REVALIDATE_ON_LOAD`, each fail exactly the tests written to catch them.

**Verified:** 1454 tests pass, `eslint .` at **byte-identical baseline**
(3 errors / 68 warnings, all pre-existing in `WorkspaceView.tsx`, confirmed by
linting a stashed tree), `next build` green **by exit code** in both flag states
with `/auth`, `/onboarding`, `/settings` still `○ Static`. Runtime probes:
flag off, every credits route (the new PATCH included) **404**s while the ungated
`/api/releases` still **401**s — that discrimination is what proves the gate
rather than a routing accident; flag on, the owner routes **401**. Note
`/credits/<bad token>` answers the 404 body with HTTP **200**, the pre-existing
`force-dynamic` quirk this file already records for epk/capture/credits.

**NOT verified, and it is the whole risk surface:** nothing has run against a
real database. The migration is unapplied here, so no link has been closed, no
resubmission has replaced anything, no `23505` retry has fired, and the closed
page has never rendered. The owner UI needs an authenticated session this
environment cannot mint, and there is no network route to app.urganize.app. All
of it rests on unit tests plus traced call paths.

**Phase 2 is complete as of 2026-08-27** — owner notification, the CSV export and
the prefill, all three in the sections below.

### The owner notification (2026-08-27)

Founder request, Phase 2 item 1. **Push AND email, both, every time, fired inline
from the public credits POST.** No migration, no new feature flag, no changelog
entry yet (see the trigger at the end).

Founder calls: both channels every time; off switch on the admin presets page
rather than a per-user column; **new people only** (a correction stays quiet);
one notification per submission, each naming the person.

**Why not the in-app bell, and this is the load-bearing decision.**
`notifications.task_id` is `not null references public.tasks(id)` and all seven
`notification_type` values are task-scoped, so a credits event has no legal row
there. Making it fit needs an enum add, dropping NOT NULL on the app's hottest
realtime table (it is in `supabase_realtime` with `replica identity full`), a new
`release_id` column, and ~8 code sites — `NotificationRow`/`TaskNotification`
both hard-type `taskId: string`, `listNotifications` would push `null` into an
`.in()`, the unread dedupe is keyed on `task_id`, `buildTaskPushPayload` would
emit `tag: task-undefined-…`, and `NotificationsBell.handleSelect` calls
`openTask(taskId)` unconditionally while its `sameScope` short-circuit ignores
`scene`, so an owner already scoped to that release would get NO navigation at
all. The bell is also `hidden lg:block`, i.e. **desktop only**, so an
in-app-only notification would never reach a phone.
`lib/billing-alerts-server.ts:9-14` is the recorded precedent for choosing email
at this exact fork, and CLAUDE.md's own out-of-scope line names transactional
email as fine while deferring the inbox to v2. **`scheduled_notifications` is
also ruled out**: its only flusher is a DAILY cron on the Hobby plan, shortened
only by some unrelated user logging in — up to ~24h, wrong for "someone just
submitted".

**Five things worth knowing before editing this:**

1. **The push `tag` is keyed on the SUBMISSION, never the release.** A shared tag
   makes the push service REPLACE the previous notification rather than stack it,
   so two collaborators answering minutes apart would leave the owner seeing only
   the second — silently defeating the founder's "one each, naming the person".
   Mutation-tested.
2. **Insert path only is a security property, not a preference.** The UPDATE path
   carries no submission cap by design (a correction adds no row), so notifying
   on updates would let anyone holding the share link send the owner unlimited
   pushes and emails. This is also **the first place in the app where an
   unauthenticated request can trigger a push at all** — every other
   `sendPushToUsers` caller is a cron, an admin route, or authenticated.
3. **The email is the half that carries the detail**, and that is the whole
   reason both channels exist rather than one: name, stage name, roles, both
   splits, PRO, IPI, publisher, so a manager can check a number or forward the
   thing to a distributor without opening the app. If it is ever trimmed to "you
   have a new submission", it stops being worth sending. `buildCreditDetailRows`
   drops blank fields entirely — a wall of "not given" is worse than a short list.
4. **It never throws and never fails the submission.** A collaborator on weak
   mobile data has already done the work by then. Push and email run in
   `Promise.all` so the worst case is `max()` not `sum()`; the honest ceiling is
   the email module's own 10s abort, typical is ~300ms. If that ever bites, the
   follow-up is a `send_at = now()` queue row, which trades latency back.
5. **`fillCreditPlaceholders` leaves an UNKNOWN `{placeholder}` alone** rather
   than blanking it: a silently-emptied word reads as a broken product to whoever
   receives the notification. Also mutation-tested.

Files: `lib/credit-notifications.ts` (pure copy + the tag/url decisions),
`lib/credit-notifications-server.ts` (the leaf sender, the
`release-reminders-server.ts` shape), `buildCreditSubmissionEmail` in
`lib/email-templates.ts`, a fourth `creditSubmissions` category in
`lib/notification-presets.ts` (JSON in `app_settings`, so the normalizer keeps
pre-2026-08-27 rows working with no migration), the admin section in
`app/admin/notifications/NotificationsPageClient.tsx` plus its "Send test to me"
branch, and one `await notifyCreditSubmission(...)` on the insert path of
`app/api/credits/[token]/route.ts`.

**Verified:** 1491 tests (37 new), `eslint .` at byte-identical baseline (3
errors / 68 warnings, all pre-existing in `WorkspaceView.tsx`), `next build`
green by exit code in both flag states with `/auth`, `/onboarding`, `/settings`
still `○ Static`. Flag off, the credits POST 404s while the ungated control
401s.

**NOT verified, and it is the whole risk surface: no notification has ever been
delivered.** No real database, no Resend key, no push subscription here. The
500s a local probe returns are the placeholder Supabase URL failing upstream of
this code (`"Could not resolve this link."`), not the notifier.

**Changelog entry: shipped as v1.4.0** (2026-08-27), covering this and the
spreadsheet export below. It was deliberately held at merge — the flag-flip
precedent applied to a feature with no flag, since both channels no-op until
`RESEND_API_KEY` + `EMAIL_FROM` or the VAPID pair are set — and then released
the same day when the founder confirmed those env vars have been set in Vercel
for a long time. **That confirmation is the only evidence they are set: this
sandbox cannot reach either urganize domain (the agent proxy answers 403 to
CONNECT), so no probe backs it up.** If a notification never arrives, check
those four env vars on the `Web` project before looking at this code. The admin
section is internal-only and never earns an entry.

### The submissions spreadsheet (2026-08-27)

Phase 2 item 2. A "Download as spreadsheet" button in Step 3 of the Metadata
scene. **Entirely client-side — no route, no second fetch, no migration, no
flag** — because the scene already holds every submission in memory.

**Three decisions worth keeping:**

1. **Splits are RAW NUMBERS, never "50%". This is the whole point of the
   file.** The reason to export splits is to total the column and see whether it
   reaches 100, and neither Excel nor Sheets can sum a cell containing a percent
   sign — so `"50%"` would make the export useless for its one job. A quoted
   bare number is still coerced by both, so `lib/csv.ts`'s always-quote rule
   costs nothing. An unanswered split stays EMPTY rather than becoming 0, because
   a zero share is a real answer and conflating the two would silently change a
   total. Mutation-tested: adding the percent sign back fails three tests.
2. **Every column is printed even when blank**, the opposite of the notification
   email, which drops blanks. A spreadsheet is where completeness beats
   curation: a missing column breaks a formula, an empty cell does not.
3. **Roles are semicolon-separated**, not comma. Every field is quoted so a
   comma would be legal, but this is the column people split back apart by hand
   and a comma list inside a comma file is a foot-gun there.

It goes through `shareOrDownloadTextFile` (`lib/share-file.ts`) rather than a
plain anchor, because a webview cannot download: native gets the share sheet, an
old shell without the plugins gets a "use the web app" message instead of a
silent no-op, and web gets a real file. The `DataExportSection` precedent,
including its outcome copy. Escaping comes from `lib/csv.ts` per that module's
own instruction that new code comes there — this is the first consumer to take
it up, so the four private copies it complains about are unchanged and still
four.

Files: `lib/credit-submissions-csv.ts` (+ 16 tests), the button and handler in
`MetadataSection.tsx`, and one prop threaded through `ReleaseScenePanel.tsx` so
the filename can name the release (`midnight-ep-credits-2026-08-27.csv`) rather
than colliding when a manager exports three releases in a sitting.

**Changelog: shipped in v1.4.0** alongside the notification above rather than as
its own version, since splitting them would have announced half a feature.

### Prefill, on the contributor's own device (2026-08-27)

Phase 2 item 3, and the one where **the spec's literal wording was the wrong
thing to build.** It asked to prefill "if the same contributor (same email) has
submitted on a past release in the workspace" — which means the public form asks
the server what it knows about a typed email. That endpoint has no login, the
share token is its only gate, and links get forwarded freely, so it would hand
anyone holding a link a co-writer's legal name, IPI, PRO, publisher and phone
for the price of guessing an email. IPI numbers are what royalty claims are made
with. Put to the founder with three options; **he chose device-local**, so there
is no server lookup and nothing to harvest. The cost is that switching devices
means retyping, which is the right trade.

**The field list is the feature, and what is absent matters more than what is
there.** `lib/credit-prefill.ts` remembers identity, contact, publishing and
socials. It NEVER remembers:

- **Either split.** A 50% share on one song says nothing about the next, and a
  silently pre-filled ownership share is the most dangerous autofill this domain
  has — it could file a claim nobody typed. A hard line, not a trade-off.
- **Roles.** They change per song AND drive which splits are required, so a
  wrong prefill nobody notices files a wrong credit and demands the wrong
  number.
- **"What you did"**, which is about this song.
- **The accuracy tick**, an attestation about THIS submission. It has to be
  ticked again or it means nothing.

Mutation-tested: adding splits and roles to the list fails five tests across the
constant, the picker, the merge and the round trip.

**Three mechanisms worth knowing:**

1. **The notice is a mitigation, not polish.** Arriving at a PUBLIC form that
   already knows your legal name is unsettling with nothing explaining it, and
   on a shared studio or cafe machine the reader may not be the person it
   remembers. So the form says whose details it filled in and offers "Not you?
   Start fresh". The six-month age cap is the backstop for the machine nobody
   comes back to.
2. **It reads in a PRE-PAINT layout effect** (`useIsomorphicLayoutEffect`, the
   `/onboarding` saved-draft precedent), not a plain `useEffect`: this page is
   server-rendered, so the empty form is already on screen and a post-paint read
   would show blank fields for a frame and then fill them. Reading during render
   instead would be a hydration mismatch, so a setState in an effect is
   unavoidable here. Note lint reports no finding only because the rule does not
   track the aliased hook — the pattern is still setState-in-effect.
3. **"Fill it in for someone else" clears the notice but does NOT forget the
   stored details.** A different person is about to type, so the form must go
   blank — but those are the first person's own details on their own device, and
   they may want them on the next release. Two different things that look like
   one.

Storage goes through `lib/persisted-state.ts`, whose reads are already guarded
(version, age, validator, try/catch) but whose **writes are not** — `setItem`
throws on a full quota and in Safari private mode. Wrapped, because remembering
details is a convenience that must never break a submission that already
succeeded. First public page in the app to touch localStorage at all.

**Changelog: shipped as v1.4.1** (2026-08-27). It landed after v1.4.0 had already
gone out, so it got its own patch entry rather than being folded backwards into
a released version — the ledger is a log, and rewriting a shipped entry would
falsify it.

**Not verified:** no real prefill has happened. The round trip is covered by 26
unit tests against a stubbed localStorage (vitest runs node-only here and jsdom
is not a dependency), but nothing has run in a browser.

**Not verified:** no real submission has been exported. The button needs an
authenticated session with real rows, which this environment cannot mint.

**The two adjacent findings this pass flagged were fixed the same day** (founder
request), and both are invisible in production because the flag is on — no
changelog entry or version bump, per the flag-off precedent:

1. **`GET/PATCH /api/releases/[releaseId]/metadata` is gated now.** It was the
   one handler on the metadata surface with no flag check, so a direct call could
   read and write a release's distribution fields while every UI entry point to
   them was dark. The reader is defined locally rather than imported from the
   credits group's `_shared.ts`, matching how `predict-genre/route.ts` owns its
   own — route groups read their flags themselves. **The body is exactly
   `'Not found.'` on purpose**, because `isFlagGateOff` matches that string to
   tell "feature off" apart from `ensureReleaseOwnership`'s `'Release not
   found.'`; the two Chappi metadata tools now translate it into a plain refusal
   instead of telling the user their release does not exist (the `create_note`
   precedent, three call sites — `update_release_metadata` needs it on both its
   read-then-merge GET and its PATCH).
2. **`'metadata'` is flag-conditional in `SCENE_PREFETCH_ORDER`.** Adding the
   gate above would have made the idle prefetch fire guaranteed 404s — but it was
   already broken before that: the metadata fetcher hits `/metadata` AND
   `/credits`, `/credits` has always 404'd with the flag off, and `readJson`
   **throws** on a non-ok response. So with the flag off that prefetch already
   spent two requests per scoped release and then threw. It now joins
   calendar/capture/song/coverart in being conditional, which is what the
   prefetch list's own comment says the pattern is for. Mutation-tested: making
   it unconditional again fails the prefetch test.
3. **The account data export now carries `credit_links` and
   `credit_submissions`.** These are the publishing details a manager most needs
   in hand for a distributor handoff (legal names, IPI and PRO numbers,
   publishers, both splits), and they were the one part of a release that
   deleting the account would destroy and the export did not hand back. Keyed on
   `release_id` like the other release-scoped tables. `share_token` is
   deliberately not redacted — `REDACTED_KEYS`' own comment already anticipated
   credits: it is the user's own link and the export is useless without it. The
   route's guard test still passes, so the open-route auth and the `select('*')`
   rule are intact.

**`predict-genre` was deliberately left alone.** It gates on its own
`NEXT_PUBLIC_FEATURE_GENRE_PREDICTION` (off by default), its comment already
records that it is "only meaningful alongside `NEXT_PUBLIC_FEATURE_METADATA`",
and there is no UI path to it when metadata is off. Worth one line if anyone ever
turns genre prediction on independently.
