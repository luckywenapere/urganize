# The next record (2026-10-27, mocks approved, step 1 built as v1.197.0)

Mocks: `docs/mocks/next-record/mock.html`, approved as drawn by Oyin on 27 Oct 2026. Steps 1 to 3 are built; steps 4 and 5 are not.

## Why

Teams leave between releases. Managers told Oyin that between releases they are making the next record, and they track it in Notes, Google Docs or their head. So the record lives in Urganize, filling it in has to be quicker than a line in Notes, and Urganize checks in.

## Settled questions

1. Song stages: Idea, Recording, Mixing, Done. Done means mastered.
2. Check-ins go to the manager only.
3. No messages to people outside the team in v1. UrgAns asks the manager for the new day.

## Data: new tables, not `releases`

A record in the making looks like a release to the user, but it is **not a `releases` row** until "Plan the rollout". Rollout counts, plan limits (Solo: 1 rollout), the Home "plan a rollout" card and the scoreboard all count `releases`, so a record in the making would make them lie. That's the same reasoning as `artist_catalogue_releases` (20261026150000).

The old `songs` table (Shows, 30 Aug) is not reused. It is scoped to one owner (`owner_user_id`, policy "Owners manage songs"), and this needs the whole team. Its rows stay untouched.

One migration, team-scoped like `artist_catalogue_releases`. RLS on, team members read, service-role writes, explicit grants:

- `next_records`: workspace, artist, title (default "Untitled"), kind (single, ep, album, or unknown), idea text, `status` (`making`, `planned`, `dropped`), `release_id` (set when it becomes a rollout), `snooze_until` (for "ask me in 2 weeks").
- `record_songs`: record, title, stage (`idea`, `recording`, `mixing`, `done`), position.
- `record_sessions`: record, `session_date` (nullable) plus `date_hint` text ("next week" stays words until a day is said), `status` (`planned`, `happened`, `moved`, `cancelled`), note.
- `record_session_people`: session, `person_profile_id` (Relationships), role text.
- `record_session_songs`: session, song.

## Build order

Each step is useful on its own. No flags (founder rule). Live at deploy.

1. **The record in Catalogue.** "In the making" on the artist page above released music, the record page (songs, sessions, people), and add or edit by hand. Mock screens 2 and 3.
2. **One line in, filed.** A new UrgAns tool, `add_to_record`, that reads a message and returns the adds as a preview card. Nothing is saved until the user taps Add, through the existing confirmation gate. People match Relationships first (dedupe rules from Phase 2: email, phone, exact name plus role, never name alone), else a new unclaimed profile. Dates are never invented. Mock screen 4.
3. **Home asks.** Seven days after a release counts as live (`lib/recap-eligibility.ts` rule), Home's top slot asks "What's next for <artist>?". "Ask me in 2 weeks" sets `snooze_until`. The day after a planned session, Home asks whether it happened, which is the in-app check-in that works before WhatsApp. Mock screen 1.
4. **Plan the rollout.** When every song is Done, the record offers "Plan the rollout". That creates the `releases` row through the planner v2 path, seeded with the idea, kind and songs, sets `next_records.release_id` and status `planned`, and carries session people as credits. Mock screen 6.
5. **WhatsApp check-in.** This rides on WhatsApp chasing (`lib/whatsapp/`), same opt-in, quiet hours and one message per person per day. It needs the chasing migration applied, Twilio connected, and a new Meta template for the session question. Mock screen 5.

## Blockers and costs (need Oyin)

- UrgAns must be running (the RodiumAi wallet was empty from 17 Oct). Step 2 depends on it. Steps 1, 3 and 4 work without AI.
- Step 5 needs a Twilio account and Meta template approval. That is a spend and an outside account, so it needs his yes.
- Linear refuses new issues (free limit), so commits go without a URG number.

## Measure

Weekly active teams with no rollout in progress (the "between releases" number on `/admin/metrics`), before and after step 3, internal accounts excluded. With about 12 weekly actives, read it as a signal, not proof.

## Step 1, as built (v1.197.0, 27 Oct 2026)

- **Migration** `20261027120000_next_records.sql`, applied to production on 27 Oct through the Management API. Only new tables, so nothing needed backing up. Verified: five tables, RLS on, one read policy each, grants to authenticated and service_role.
- **Pure rules** `lib/next-records.ts`: parsers, stages, `pickNextSession` (exactly one "Next"), `orderSessions`, `lagosToday`. **Server** `lib/next-records-server.ts`: every query filters on the team. **Client** `lib/next-records-client.ts`.
- **Routes:** `GET/POST /api/workspace/artists/[artistId]/records`, `GET/PATCH /api/records/[recordId]`, `POST .../songs`, `PATCH/DELETE .../songs/[songId]`, `POST .../sessions`, `PUT/DELETE .../sessions/[sessionId]`. One gate, `app/api/records/_shared.ts` (`resolveRecordsContext`): the team comes from the user, a teammate scoped to one artist sees only that artist (others read as 404), guests are read-only. Every write answers with the whole record. No flag.
- **People:** a typed name goes through Relationships' own `seedRelationship`, so the dedupe rules stay in one place. A personId is kept only if it is already one of the team's contacts. If contacts are off or the teammate is scoped, names stay plain names.
- **UI:** `components/artists/ArtistRecordsCard.tsx` ("In the making", above Rollouts on the artist page) and `app/dashboard/artists/[artistId]/records/[recordId]` (idea, kind, songs with a stage picker, sessions with day or words, people, songs worked on, what happened, note, Drop). The artist page itself still needs `NEXT_PUBLIC_FEATURE_ARTIST_PAGE`.
- **Analytics:** `record_started`, `record_edited` (ids, counts and stage keys only).
- **Tests:** `lib/next-records.test.ts`, `lib/next-records-guard.test.ts` (every route goes through the gate once per handler, writes say `write: true`, every server query filters on the team).
- **Checked:** both screens at phone width in a throwaway page with a faked API (deleted): add song, change stage, add a session from contacts, one "Next". **Not checked live:** no signed-in local session, so the real routes against the real database were not exercised in a browser.
- **Traps:** phones get form fields at 16px, so stage pickers read in normal case at a fixed width. Fields use `border-stroke-control` (field-border guard).
- **Pre-existing test failures, not from this change** (they fail the same on untouched main): links-server, directory-invites-guard, programmes-seed, just-planned-cuts-guard, rollout-offer, section-content-top-guard, urgans-voice-realtime-guard.

## Step 2, as built (27 Oct 2026): one line in, filed

- **Tool** `add_to_record` in `lib/chappi/tool-families/records.ts`, level `confirm`, so it is never on MCP and nothing saves until the card's Add. The model passes sessions (`when` in the user's words, people, song titles, `""` for "the new one", `happened`) and song stages; `recordId`/`artistId` are optional.
- **Rules, pure** in `lib/next-records-capture.ts`: `resolveWhen` dates only plain words ("friday", "tomorrow", "31 oct", in Lagos time); "next week", "next friday" and the weekday of today stay words in `date_hint`. `matchContact` matches the team's contacts by whole name, else a one-word first name; a tie the role cannot settle goes back to the manager as a question; no match is a new contact, filed by `saveSession` → `seedRelationship`. An unknown song is a new song at Idea, even if a stage was said, and the card says "New song at Idea". `planCapture` and `describeCaptureCard` build the plan and the card; confirm and execute both re-run the same read-only `prepare`, so the card and the Add agree.
- **Which record:** the only one in the making; with several and none named, the tool asks which (it hands the model each title and id). `artistId` with no record starts an "Untitled" one, shown as "New record" on the card.
- **Scope:** reads `listRecordsInMaking` (the caller's teams, artist-scoped teammates see only their artist), `isReadOnlyOnTeam` (guests and missing memberships refused), contacts only when Relationships is on and the teammate is not scoped. Writes only `createRecord`, `addSong`, `updateSong`, `saveSession`.
- **Action log:** `recordId` resolves to object type `next_record` (snapshot table `next_records`); the activity list reads "Added to the next record".
- **Card:** the confirmation card now keeps line breaks in `detail` (`whitespace-pre-line`), so the adds read one per line like the mock. No "Fix something" button: Cancel, then say what to change.
- **Tests:** `lib/next-records-capture.test.ts` (pure), `lib/chappi/tool-families/records.test.ts` (the real runner and tool, server layer mocked: the mock screen 4 message makes a card and writes nothing; the Add writes through the server functions only; several records ask; guests refused; scoped names stay plain).
- **Checked in production, read-only:** UrgAns answered on 27 Oct (credit spends with real gpt-4o-mini token counts), so the RodiumAi wallet was not empty that day. **Not checked live:** the tool against a real model and database.

## Step 3, as built (Home asks, 27 Oct 2026)

- **Where it shows:** Home's One Thing, never a card of its own on top. With a rollout in flight the ask is one slide of the One Thing, after late work and before the plan's next moves and today's work (`buildOneThing`'s `ask`). With nothing in flight it takes the place of "Start the next one early", which asks the same question. So the top slot still holds one card, and the 19 Oct rule stands. Brand-new teams (no releases) never see it.
- **Who:** check-ins go to the manager only (settled question 2), read as owners and admins of the primary team. Members and guests are never asked. A teammate scoped to one artist is only asked about that artist.
- **Rules** in `lib/home/record-ask.ts` (pure, tested in `record-ask.test.ts`): one ask at a time, a session check before "What's next" because it is once and dated.
  - **What's next for <artist>?** From 7 to 90 days after the artist's latest release went live. "Went live" is `releaseLiveAt` in `lib/scoreboard.ts`, which is the `lib/recap-eligibility.ts` rule answering WHEN (date passed, else all tasks done, else released or archived). No third definition. Not asked when the artist has a record with status `making`, or a release dated ahead (the next one is already planned), or a snooze that has not ended. The most recently live artist goes first. Copy says "out a week", "2 weeks", "a month".
  - **Did it happen?** A planned session with a real date before today (Lagos), up to 14 days back, most recent first. Words-only sessions are never asked. Answering changes its status or its day, so each session is asked once.
- **Answers, all through the routes that already exist:**
  - The line starts a record (`POST /api/workspace/artists/[artistId]/records` with `idea`) and opens the record page.
  - Happened and Didn't happen are a `PUT .../sessions/[sessionId]` with the whole session sent back (the PUT replaces people and songs too) and only the status changed.
  - **Moved keeps the session `planned` on its new day or words**, rather than setting status `moved`. Why: a `moved` session drops out of "Next" and is never asked about again, so the session would be lost. One PUT, no second write that could half-fail. The cost: the record page does not show that it moved.
- **Snooze: a column on `artists`, `next_record_snooze_until`** (migration `20261027200000_artist_record_ask_snooze.sql`). Why not `next_records.snooze_until`: the ask comes before any record row exists, and making a placeholder row would put a fake record in the making on the artist page. The snooze is per artist, for the whole team. Written only by `POST /api/workspace/artists/[artistId]/records/snooze`, behind the same records gate. `next_records.snooze_until` stays unused.
- **Data:** the ask rides in `/api/home` as `recordAsk` (`loadHomeRecordAsk` in `lib/next-records-server.ts`, a separate section at the end). It never fails Home: any read error means no ask.
- **Analytics:** `record_started` with `source: 'home_ask'`, and `record_ask_answered` (kind and answer only).
- **Migration applied** to production on 27 Oct through the Management API: backup `artists_backup_20261027` (67 rows, RLS on, no grants to anon or authenticated), column verified as nullable `timestamptz`.
- **Checked:** both cards at phone width in a throwaway page with faked calls (deleted). **Not checked live:** no signed-in local session, so the real Home against the real database was not exercised in a browser.
