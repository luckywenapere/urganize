# Song upload (2026-08-16)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: users should be able to upload the song for their releases,
"even from the AI".

**Not a scope expansion, and this is the one place it needs saying.** v1 scope
item 4 names *masters* outright ("artwork, **masters**, contracts, split
sheets"), so attaching the audio to a release has always been in the hard list.
The out-of-scope line it sits nearest — "Track / song library as separate
entities (assets cover this for v1)" — is honored literally rather than argued
around: **a song is an `assets` row with `category: 'audio'`**, no new table, no
new object, **no migration**. The bucket, the RLS, the size and MIME rules, and
the per-release cleanup on release/account deletion already cover it. What did
not exist was a surface for it: `NEXT_PUBLIC_FEATURE_FILES` has been off since
URG-182, and the assistant had no way to start an upload at all.

- **Flag:** `NEXT_PUBLIC_FEATURE_SONG_UPLOAD`, default `false`. Registered in
  `turbo.json` + `.env.example`. Gates the pill, the `?scene=song` URL param (in
  both `TasksPanel` and `WorkspaceView`, which mirror each other), the scene
  prefetch list, all four `/song` routes, both UrgAns tools and the chat card.

**Six things worth knowing before editing this feature:**

1. **The flag is deliberately NOT `NEXT_PUBLIC_FEATURE_FILES`, even though they
   share one storage model.** The founder switched the file cabinet off; "attach
   the master to this release" is a different ask from "bring the file manager
   back", and one flag would mean they can only ever be on together. Verified by
   probe rather than asserted: with song on and files off, all four `/song`
   routes 401 unauthenticated while `/assets` still 404s.
2. **No tool can ever be handed a file, and that is permanent.** A model turn is
   text. CLAUDE.md recorded file upload as deferred for exactly this reason, and
   the transport has not changed — what changed is the realisation that the
   upload does not need to travel *through* the model, only to *start* from the
   conversation. So `upload_song` resolves the release, says what is already
   attached, and returns a `clientAction` that drops a real file picker into the
   transcript; the browser then runs the same three-step signed-URL flow the
   scene uses. **A second browser rule makes the card the mechanism rather than a
   consolation prize: `input.click()` only opens a dialog inside a user gesture,
   and a tool result arrives from a network response.** Nothing here could pop a
   dialog by itself even if it wanted to.
3. **`open_song_upload` is the first client action that waits for the user.**
   Every other one is a fire-and-forget side effect executed in a loop. It is
   also held in component state rather than the store and, unlike
   `pendingConfirmation`, it deliberately SURVIVES later turns — a permission
   card must never outlive the reply that proposed it, but this one is not
   destructive, and clearing it when somebody types "what formats do you take?"
   would take the picker away mid-question. "New chat" does clear it.
4. **Recording a song never replaces one.** A release legitimately carries a
   radio edit beside the master; the newest is what every other surface means by
   "the song", and anything superseded stays listed with its own Remove control.
   The alternative — deleting the previous audio row on each upload — destroys a
   file nobody asked us to touch, silently, and it would be invisible with the
   files flag off. DELETE therefore takes an explicit `?songId=`, scoped to the
   release AND to the audio category, so this endpoint can never be turned into
   a way to delete a contract or the cover art.
5. **Both tools are excluded from MCP, for the two different reasons that list
   already carries** — `upload_song` returns a clientAction for a browser an MCP
   client does not have (`navigate`'s reason), and `get_song` reaches a REST
   route that does not accept the internal-actor bearer, so it would 401. The
   count in `protocol.test.ts` stays 11, which is the tripwire working as
   intended rather than an oversight.
6. **The deterministic router covers this too, and that is not decoration:**
   production runs with no model configured for long stretches, so typed
   "upload the song" and an "Upload the song" chip both reach the picker with
   the model off. The keyword branch had to be inserted BEFORE the release
   branch, which already claims 'song' and 'track' for "start a new release",
   and AFTER the task branch, so "add a task to upload the master" stays an
   activity.

- **One implementation of the upload, two entry points.** `lib/song.ts` holds
  the flow and the validation; `useSongUpload` holds the picker/uploading/retry
  state; `SongSection` (scene) and `ChappiSongUploadCard` (chat) are both thin.
  The numbers are never redefined — the ceiling and the MIME allowlist come from
  `asset-constants.ts`, which is what the SERVER validates against, so the two
  cannot drift into a client that accepts what the API rejects. Only the COPY is
  local: the shared validator names the enum value and reads like a stack trace.
- **The scene is memory-cached and never persisted**, the `files` precedent for
  the same reason one step more visible: the payload carries a 1h signed URL an
  `<audio>` element is pointed at, so a stale paint is a play button that 403s.
- **Verified:** the full vitest suite (673 passing, 24 env-gated skips, of which
  22 are new song cases), `eslint .` (0 errors, 59 warnings = unchanged
  baseline), and `next build` green in **both** flag states with `/auth` and
  `/settings` still `○ Static`. Runtime probes in both states as described in
  point 1. **Note `pnpm test` and `pnpm build` cannot run in a sandboxed
  session** — turbo's package-manager shim fetches corepack over HTTPS and fails
  TLS; run `./node_modules/.bin/vitest` and `./node_modules/.bin/next` directly.
- **Not verified:** nothing has run against a real database or a real Supabase
  Storage bucket, and the owner UI needs an authenticated session this
  environment cannot mint — so uploading a real file, playing it back, removing
  it, and the assistant's card end to end have never executed. The card's copy
  and the tools' wiring are confirmed present in the flag-on client and server
  bundles, which is not the same as exercised.
- **Activation checklist:** (1) nothing to migrate — set
  `NEXT_PUBLIC_FEATURE_SONG_UPLOAD=true` in Vercel `Web` → Production **and make
  sure the deploy actually rebuilds `apps/web`** (the EP/album flip records
  `turbo-ignore` skipping a web build whose commit touched only `package.json`
  files); (2) changelog entry + minor version bump across all 10 `package.json`
  files (the EPK precedent: the ledger entry lands at flag-flip, not at merge);
  (3) verify end to end with a real release — upload an MP3 from the Song pill,
  play it back, then ask UrgAns to "upload the song" for another release and
  confirm the card in the conversation does the same thing; (4) watch for
  rejected MP3s. The allowlist is `audio/wav`, `audio/x-wav`, `audio/mpeg` and
  `audio/flac`; a browser reporting `audio/x-flac` or `audio/mp3` would be
  refused, and the fix is one line in `asset-constants.ts` rather than anything
  in this feature.
