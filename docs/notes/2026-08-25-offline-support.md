# Offline support (2026-08-25)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: Urganize should work offline for the parts that can — never a
blank browser page when the connection drops, the user can keep navigating the
app, and offline-capable writes (activity creation, cover art, notes) queue and
sync when the connection returns. **This consciously reverses the "no offline
shell" trade-off** the Capacitor audit accepted and CLAUDE.md recorded (see the
corrected bullets in "Native mobile app" above) — not a scope expansion (nothing
on the out-of-scope list is touched; this changes WHERE existing v1 features run,
not what exists), but a real reversal of a prior documented decision, flagged per
this file's own doc-drift rule rather than silently overwritten.

**What was actually happening before this, confirmed by reading the code rather
than assumed:** the service worker (`public/sw.js`) was push-notification-only —
its own header said so — with no fetch handler and no caching anywhere in the
repo. A dropped connection meant a cold load showed the browser's own offline
page; `checkAuth` treated ANY `supabase.auth.getUser()` network failure as "not
authenticated" and visibly signed the user out, even with a perfectly valid
persisted session; `loadCommandCenter`'s fetch had no try/catch at all, so
offline turned into an unhandled promise rejection at every `void
loadCommandCenter(...)` call site (a permanent skeleton on a cache miss, a stuck
"refreshing" spinner on a cache hit); and cached cover-art thumbnails (signed
URLs, 1h TTL) had no `onError`, so a cache-first paint after the TTL showed a
broken image. None of that was offline-specific work — those were bugs today,
just bugs a stable connection usually hides.

**All three phases are built.** Phase 1 is unflagged and live; phases 2 and 3 sit
behind `NEXT_PUBLIC_FEATURE_OFFLINE`, **which is ON in production (corrected
2026-10-15, URG-314: this line long said the flag had never been flipped, but
production registers `sw-offline.js`; the perf pass found it live).** Since
v1.147.7 the worker is versioned per deployment and serves static signed-in
pages stale-while-revalidate; see PERFORMANCE.md before changing it. (This
line said "phase 3 pending" until 2026-09-07, contradicting the table and the
Phase 3 heading directly below it; corrected in place.)

### Phase 1 — unflagged correctness fixes (live immediately, no flag)

- **`lib/offline/network-error.ts`** — the one classifier both the auth store and
  every guarded store fetch consult, so "the network is down" and "the server
  said no" can never be told apart differently in two places. Allowlist of known
  network-failure shapes (`AuthRetryableFetchError` by name, `Failed to fetch`,
  Safari's `Load failed`, etc.) rather than a denylist of auth-rejection shapes —
  a denylist would need to anticipate every real rejection reason instead of
  every way a request can simply never leave the device.
- **`checkAuth` (`lib/auth-store.ts`) no longer signs a user out over a network
  blip.** Both the `getUser()` error branch and the outer `catch` check
  `isNetworkFailure` first: a network failure with an already-persisted session
  now leaves that session alone (`isLoading: false`, nothing cleared); a real
  rejection (expired refresh token, revoked session, bad credentials) still signs
  out exactly as before. **Server-side auth is untouched** — every API route
  still validates the token independently; this only stops the CLIENT UI evicting
  itself over a dropped connection.
- **`loadCommandCenter` / `useNotesStore.load` / `useWorkspaceIdentityStore.load`
  all now catch a network failure and keep whatever is already painted**
  (cached or in-memory) instead of throwing an unhandled rejection out of a
  `void`'d call site. `loadCommandCenter` shows an honest "You're offline.
  Reconnect to load your releases." only when there is truly nothing on screen.
- **`WorkspaceReleaseCard` and `AppTopbar`'s cover-art thumbnails gained
  `onError` fallbacks** to the default mark, keyed on the failing URL (the
  `WorkspaceIdentityPanel` logo precedent) — a cache-first paint after the 1h
  signed-URL TTL now shows the mark instead of a broken image.

### Phase 2 — the offline shell (`NEXT_PUBLIC_FEATURE_OFFLINE`, default `false`)

**The analysis of what works offline, what queues, and what stays online-only —
the deliverable the founder actually asked for:**

| Works offline (existing caches) | Cannot work offline (by design) | Queues when offline (**shipped** — see Phase 3 below) | Still online-only (not queued yet, or by design) |
|---|---|---|---|
| Catalog + task buckets + scoped release view (`urganize.cache.command-center`) | Files downloads, song playback, cover-art image beyond its 45-min memory window (signed 1h URLs, deliberately never persisted) | **Activity (task) creation** | Sign-in/up |
| Metadata, Calendar (calendar list) and Pitch scenes — the three `true` entries in `SCENE_PERSISTED` | Capture leads (privacy exclusion — other people's emails never touch localStorage) | **Cover art upload** | Task complete / reopen — not queued yet, unchanged inline error on a network failure |
| Timeline + the activity buckets, free: both are laid out from activities the workspace already holds, so neither has a payload to cache | Plan editor (an autosaved document, deliberately excluded from the cache) | **Song upload** | Note create / edit — not queued yet (see Phase 3's `useNotesStore.create` note below) |
| Notes (newest 50, full bodies); press kits tab (its own `urganize.cache.press-kits`, not the scene cache) | Calendar POSTS (never cached), activity feed (excluded from the command-center cache on purpose) | — | Release creation, UrgAns + all AI, Metadata editing (its PATCH behaves like a PUT — replaying a stale whole-doc offline would wipe fields someone else edited) |
| Settings: artist, teammates, chrome; curator inbox/profile/playlists, identity card; with `NEXT_PUBLIC_FEATURE_URGANS_HISTORY` on, the UrgAns chat on screen and the first page of the chats list (read only — sending needs the model; turns written offline save on reconnect) | — | — | Calendar post CRUD, capture/credits link minting, press-kit publishing, pitching sends, payments/billing, invites/team logins, recap generation, data export, admin, genre prediction, push toggles |

**Corrected 2026-09-07, and the first one mattered:** column 1 named a **"Press
kit" SCENE, which no longer exists** — the release-scoped EPK scene was deleted
2026-09-05 when the standing per-artist kit replaced it, so that row claimed
offline support for a surface that had been removed. `SCENE_PERSISTED` in
`lib/scene-cache.ts` is the authority on this column and lists exactly three
`true` entries. The standing press-kits tab does work offline, through its own
cache key rather than the scene cache. Also: "Song upload" was listed twice in
column 3, and `timeline` / `activities` are scenes that did not exist when the
table was written.

- **The service worker is split in three, all in `public/`:** `sw-push.js` holds
  the push + notificationclick handlers verbatim (unchanged from before this
  work); `sw.js` (registered when the flag is off) `importScripts` it and adds
  nothing else, except one thing — its `activate` handler deletes any
  `urganize-offline-*` caches, which is the **kill switch**: flipping the flag
  back off and letting the next load re-register `sw.js` actively removes the
  offline layer's state, not just stops adding to it. `sw-offline.js`
  (registered when the flag is on) also `importScripts`'s the push handlers and
  adds the actual caching layer.
- **Both worker scripts register at the SAME scope (`/`)**, so `lib/push.ts`'s
  existing `getRegistration('/sw.js')` lookups (used by `getPushStatus`,
  `enablePush`, `disablePush`) keep resolving correctly no matter which script
  is currently registered there — that argument matches by scope, not by script
  URL, so push functionality needed zero changes.
- **`sw-offline.js` never touches `/api/*` or any non-GET request, and never
  touches a cross-origin request** (Supabase Storage, PostHog) — those pass
  straight through to the browser's default handling. Data belongs to the
  store/localStorage layer above; a service-worker cache of an API response
  would fight that layer's own auth and staleness rules for no benefit.
  `/_next/static/*` is cache-first (content-hashed, immutable — synergizes with
  `deploymentId` skew protection, since a cached page requests its own
  deployment's assets). `/images/*` and the manifest are stale-while-revalidate.
  Navigations are network-first with a ~5s timeout, falling back to an exact
  cached copy of that page, then — for signed-in app-chrome paths
  (`/dashboard*`, `/settings*`, `/admin*`, `/`) only — the cached dashboard
  shell, then a small inline offline HTML page that needs no precaching to
  exist. **Public token pages (`/epk/`, `/credits/`, `/capture/`, `/curator*`,
  `/auth*`, `/join`, `/invite`) NEVER fall back to the app shell** — a press
  contact, a fan, or a collaborator submitting credits must never be shown
  someone's dashboard chrome; those paths get only the generic offline page.
  **Three public paths built after this list are deliberately absent from it and
  are NOT bugs** (added here 2026-09-07): the standing press kit `/k/`, a
  person's directory page `/p/`, and a DJ pack `/pack/`. That list only matters
  for paths that would otherwise match `APP_CHROME_PREFIXES` — anything in
  neither already falls through to the same generic offline page, which is the
  correct outcome. The reasoning was recorded in the directory section rather
  than here, which is why it reads like an omission.
  Covered by `lib/offline/sw-offline.test.ts` (10 cases), which loads the
  script's source into a `new Function` body — the file has no exports to
  import, since it is a plain script meant to run in the service-worker global
  scope, not a module — with `self`/`caches`/`importScripts`/`fetch` stubbed on
  `globalThis` beforehand.
- **`lib/offline/register.ts`'s `registerAppServiceWorker()` replaces
  `registerPushServiceWorker()` as AppShell's mount-time registration call.**
  Deliberately does NOT require `PushManager`/a VAPID key like the push
  registration does — today's registration silently never happens at all in any
  environment without a VAPID key configured (dev, most previews), which meant
  the offline shell would never register there either if it piggybacked on the
  push gate. Offline registration needs only `'serviceWorker' in navigator`.
- **`lib/offline/status.ts`** — `useOnlineStatus()` (the `useIsDesktopViewport`
  `useSyncExternalStore` precedent) plus a non-hook `isBrowserOnline()` for call
  sites outside a component. `navigator.onLine` is treated as a HINT, not
  authority: `offline` is trusted as definite, `online` only as probable — real
  mutations still trust an actual fetch failure over this value, never the other
  way around.
- **`components/app/OfflineBanner.tsx`** — the `TeamTrialStrip` contract
  verbatim: above the topbar (not in it — the topbar's right cluster already has
  a documented width budget that overflows a 375px phone), calm, and **NOT
  dismissible** (dismissing it would hide the one thing that stops "why did my
  activity disappear" from being a surprise). Shows "You're offline. You can keep
  working — changes will sync when you're back online." while offline, then
  "Back online." for a few seconds on reconnect. Tracks the online/offline
  transition via the raw window events rather than a reactive effect over the
  hook's current value on purpose — setState belongs in the EVENT CALLBACK, not
  synchronously in the effect body, or React flags a cascading render
  (`react-hooks/set-state-in-effect`, one of the two rules this repo runs at
  warn rather than error during the React 19 migration — still fixed properly
  here rather than left to add to that count). **Renders nothing with the flag
  off.** Phase 3 extends the reconnect message to name how many queued changes
  are syncing.
- **Reconnect refresh:** AppShell listens for the `online` event and force-
  refreshes the command center — `loadCommandCenter`'s own in-flight dedup and
  recency-window guards make this cheap even when there's nothing to do.
- **A tight, explicit online-only sweep, not an app-wide one:**
  `CreateReleaseModal`'s submit and the status-update generator both check
  `isBrowserOnline()` first and show plain copy ("You're offline — this needs a
  connection.") instead of firing a request that can only fail after the fact.
  The UrgAns composer was deliberately LEFT ALONE: `submitPrompt`'s existing
  `catch` already falls back to the local deterministic intent-router on any
  failure, network failures included — sending an offline user straight to the
  no-AI command bar is the CORRECT degrade already built in, not a gap.

### Phase 3 — the mutation queue (`NEXT_PUBLIC_FEATURE_OFFLINE`, same flag)

- **`lib/offline/idb.ts`** — the repo's first use of IndexedDB, and the reason is
  narrow: a cover-art/song `File` (up to 25 MiB) cannot live in localStorage's
  quota-limited envelope the way every other cache in this codebase does. Hand-
  rolled promise wrapper around one object store (`urganize-offline` /
  `queue`) — four operations (`idbPut`/`idbGetAll`/`idbDelete`/`idbClear`), no
  dependency (`idb`, `localforage`), the same "boring stack" call already made
  for the MCP JSON-RPC layer and the FCM sender. All four resolve to a safe
  no-op when IndexedDB is unavailable (old browsers, some locked-down
  webviews, private-browsing modes that disable it) — a queue that can't
  queue just means mutations run online-only, exactly as before this feature.
  Tested against a hand-rolled fake IndexedDB (this repo's vitest environment
  is plain Node, which — unlike `fetch`/`Request`/`Response` — has no
  IndexedDB global at all; adding `fake-indexeddb` purely to test four narrow
  operations was judged not worth a new dependency).
- **`lib/offline/queue.ts`** — generic FIFO storage plus the flush DECISION
  logic, deliberately split from the actual replay: this file knows nothing
  about tasks, notes, or uploads, only `{kind, payload, blob?}` records and a
  caller-supplied `replay` function per flush. `decideFlushOutcome` (pure,
  fully unit-tested independent of IndexedDB) is the whole policy: success →
  dequeue; a network failure → **stop the entire flush run** (every later item
  would fail identically, so don't burn attempts on them); a 4xx → drop
  immediately, no retry fixes a rejected request; a 5xx → requeue, up to
  `MAX_SERVER_ERROR_ATTEMPTS` (3) attempts total across separate flushes
  before giving up — the same retry-classification philosophy
  `lib/ai/provider.ts` already applies server-side. Every queued item carries
  the `userId` it was created under, and `flush()` only ever replays the
  CURRENTLY signed-in user's own items — a shared device or an account switch
  must never sync one person's queued work under another's session.
- **`lib/offline/sync.ts`** — the orchestrator: maps each `QueuedMutationKind`
  to its real replay (a raw `POST /api/tasks` for `task_create`; the EXISTING
  `uploadCoverArt`/`uploadSong` flows, called verbatim, for the two upload
  kinds) and applies a successful replay back into the live stores — swapping
  a task's local placeholder id for the server's real row, or running the
  same `setScene` + `loadCommandCenter({force:true})` write-through the
  interactive cover-art upload already runs on success. `flushOfflineQueue()`
  coalesces concurrent calls into one in-flight run (an `online` event and an
  app-boot call can both fire close together without racing IndexedDB).
  **`note_create` exists in the type union but is deliberately NOT wired in
  yet** — `useNotesStore.create`'s own comment explains why: "No optimistic
  phantom row: the editor needs a real id to autosave into, and a note the
  server has never seen has nowhere to save to." Queuing a note create means
  the autosave loop has to target a temporary id instead of PATCHing a real
  one, and the virgin-note reaper's assumptions need re-checking against
  that — real, separate work, left for a follow-up rather than forced in here.
  **The unwired arm is not a hole, and the way it fails is the point:**
  `replay`'s `note_create` case returns a permanent `client_error` (501), so a
  stray queued item — there should never be one, since nothing enqueues that
  kind — is dropped rather than retried forever. A network-shaped failure there
  would stop the whole flush run by design (see `decideFlushOutcome`), which
  would block the three kinds that DO work behind an item that can never
  succeed.
- **What actually queues today: activity (task) creation, cover-art uploads,
  song uploads.** Task completion/reopen, and notes, do NOT queue yet — a
  network failure there still shows the ordinary inline error, unchanged from
  before this feature.
- **`TaskUIProvider.createQuickTask`** — on a network failure (or a known-
  offline attempt) with the flag on, builds a local task row with
  `id: 'offline-task-...'` and the new `Task.pendingSync: true` field
  (`types/tasks.ts`), inserts it into `useTaskStore` immediately, and enqueues
  the create. `TaskRow` shows a "Waiting to sync" pill next to the title
  (comfortable density) and `TaskCompletionCheckbox` renders its `disabled`
  variant (a plain, non-interactive muted circle, not a `<button>`) for such
  a row — **no chained operations on a placeholder id**, which is what keeps
  replay free of id-remapping logic. Once the queue replays the create, the
  row is swapped in place for the server's real one; nothing about its
  position in the list changes.
- **`useCoverArtUpload` / `useSongUpload`** gained a `queued` field alongside
  the existing `error`/`retryFile`. A pick made while genuinely offline (or a
  retryable failure that happens to land while the connection has already
  dropped mid-upload) skips the Retry-button path entirely and enqueues the
  file instead, since a signed upload URL from before the drop may itself be
  what's stale by the time connectivity returns — replay re-runs the whole
  3-step flow from scratch with a fresh token. All four consumers
  (`CoverArtSection`, `SongSection`, `CoverArtPromptSheet`,
  `ChappiSongUploadCard`) surface it — the two with an `onToast` prop get the
  message as a toast, the two without render it inline next to where the
  error message would otherwise go.
- **`OfflineBanner`'s reconnect message names how many changes are syncing**
  ("Back online — syncing 2 changes…") and counts down LIVE as
  `flushOfflineQueue` actually dequeues each one (via
  `subscribeQueueChanges`), rather than freezing at whatever the count was
  the instant the connection returned — a `useRef` mirrors the "currently
  showing the reconnect message" state for the queue-subscription callback to
  read, since that callback is created once on mount and a bare read of the
  `showReconnected` STATE variable there would always see its stale initial
  value. AppShell's reconnect effect now flushes the queue before refreshing
  the catalog, and also runs once on mount — a page reload can leave items
  queued from before the reload, and they shouldn't have to wait for a fresh
  online/offline transition to sync.
- **Verified:** the full vitest suite (1328 passing, 33 new across
  `idb.test.ts`, `queue.test.ts`, `sync.test.ts`), `eslint .` at the exact
  3-error/66-warning baseline, and `tsc --noEmit` clean on every file this
  touched (the 8 pre-existing errors in `confirmed-action.test.ts` are
  unrelated and present on a clean checkout, confirmed by stashing this
  work and re-running). **Not verified:** nothing has run in a real browser —
  no real IndexedDB, no real service worker, no real offline transition. The
  queue's decision logic and the orchestrator's replay-and-apply behavior are
  covered by unit tests with hand-rolled fakes standing in for IndexedDB and
  the upload/task-creation calls; that is not the same as a phone going into
  airplane mode mid-upload. Worth one manual pass on a preview deploy before
  calling this done: create an activity offline, pick a cover art offline,
  reconnect, and confirm both land.

### Activation

`NEXT_PUBLIC_FEATURE_OFFLINE` is registered in `turbo.json` and documented in
`apps/web/.env.example`. Flip in Vercel `Web` → Production with a commit that
actually rebuilds `apps/web` (the documented `turbo-ignore` trap — a
version-bump-only commit does rebuild it, since `apps/web/package.json` is part
of the `@urganize/web` package; a same-commit Redeploy or an env-only change
with no new commit does not). Changelog entry + version bump at the flip, not at
merge (the EPK precedent). Worth the manual preview-deploy pass named at the end
of Phase 3 above before flipping — nothing in phases 2–3 has run in a real
browser yet.

**Still not flipped as of 2026-09-07**, and the two things to re-check before
anyone does, both because the app grew around this layer while it sat dark: the
`SCENE_PERSISTED` column of the table above (which had already gone stale once —
see the correction under it), and whether any surface added since 2026-08-25
belongs in the queue. Nothing has been added to `QueuedMutationKind` since, so
the queue still covers exactly activity creation, cover art and song upload.
