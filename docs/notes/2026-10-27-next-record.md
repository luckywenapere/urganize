# The next record (2026-10-27, mocks approved, step 1 built as v1.197.0)

Mocks: `docs/mocks/next-record/mock.html`, approved as drawn by Oyin on 27 Oct 2026. Step 1 is built; steps 2 to 5 are not.

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
