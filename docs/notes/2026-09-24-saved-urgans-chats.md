# Saved UrgAns chats (2026-09-24, LIVE as v1.44.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: *"we need to start saving conversations and storing chat history
both on the front end and the back end."* UrgAns conversations were ephemeral
(the transcript lived only in the in-memory `useChappiStore`, and a reload or a
second device started fresh), and "cross-session persistence" had sat on the
Chappi "Still deferred" list since the assistant shipped. So this **completes an
already-sanctioned surface rather than expanding scope**: nothing moves off the
out-of-scope list, and it hangs off the assistant, whose every tool is about a
release.

Behind `NEXT_PUBLIC_FEATURE_URGANS_HISTORY` (default off, only meaningful with
`NEXT_PUBLIC_FEATURE_CHAPPI`), read through `isChappiHistoryEnabled()` in
`lib/chappi/conversation-history.ts` so the two env names are typed once.
Migration `20260924100000_urgans_conversations.sql`, **not applied anywhere
yet**.

**Four founder decisions, asked before building:**
1. **Resume if recent.** Reopening UrgAns (reload, next sign-in, another
   device) brings back the last chat if it was used in the past six hours;
   otherwise the usual greeting, with older chats one tap away.
2. **A full chats list,** titled from the first thing the user said (the Apple
   Notes model, like Notes itself), with open and delete. On the UrgAns page and
   from the side rail.
3. **Kept until the user deletes them.** In the account data export
   (`urgans_chats`), removed with the account by the `auth.users` cascade.
4. **An answer that arrives after you leave its chat is saved to that chat.**
   Its suggestions, approval card and page jump are skipped, because they
   belong to a screen nobody is looking at.

Default taken without asking, on the Notes precedent: **chats are private to
their owner.** No teammate read path, no share link.

### The design in one paragraph

One row per chat, holding the transcript as a JSON array (the
`release_plan_drafts` "document read and written whole" precedent), written by
a **revision-checked "replace the tail" save**: "you were at revision R; keep
your first K messages; put these after them". **The browser is the only
writer** — history is exactly what the user saw, and `/api/urgans` stays
stateless. One row per MESSAGE was rejected because the side rail mounts the
conversation on every page, so two tabs on one chat is a normal path rather
than an edge case, and insertion-ordered rows silently interleave two tabs'
turns where a revision check notices. The decisions are pure and live in
`lib/chappi/conversation-history.ts`; the rest is thin IO around them:
`lib/chappi/conversations-server.ts` (the table), `app/api/urgans/conversations/**`
(the routes), `lib/chappi/conversation-cache.ts` (the browser copy),
`stores/useChappiHistoryStore.ts` (the sync engine and the list), and
`components/chappi/ChappiHistoryBridge.tsx` (starts it for the signed-in user).

### An unflagged privacy fix that ships with it

**Sign-out never reset the UrgAns store.** It is a module-level store that a
client-side navigation to `/auth` does not tear down, so signing out and then in
as another account in the same tab showed the previous account's whole
transcript. `useChappiStore.resetForSignOut()` is now called from the
`SIGNED_OUT` branch of `lib/auth-store.ts`, and clears the scope picker too. The
store also carries an **epoch**, bumped whenever the transcript is replaced
rather than added to ("New chat", sign-out, opening a saved chat), and every
async reply in `ChappiConversation` captures it when its turn starts. A reply
whose epoch changed is never shown under a different conversation or account:
with history off it is dropped, with it on it is saved to its own chat.
**Behaviour change worth knowing:** "New chat" during a reply used to drop that
reply into the new chat; it no longer does. `isThinking` is derived from the
epoch too, so a switch never leaves the composer locked for up to a minute.

### Ten things worth knowing before editing this

1. **This tab only ever claims to know the server copy from something it SAW.**
   `serverIds` is set from a save that landed, a chat loaded onto the screen, or
   a conflict whose server side is a prefix of ours. When another tab is AHEAD,
   its state is adopted only by LOADING it; if the load fails the entry is left
   stale on purpose, so the next save is refused again and settled against
   what is on screen then. The obvious shortcut — adopt the conflict's ids and
   reload — lets a later save "replace the tail" and silently drop the other
   tab's message. `conversation-sync.test.ts` pins it; the mutation that
   reintroduces the shortcut fails exactly that test.
2. **Conflicts settle four ways** (`resolveConflict`): adopt (both agree),
   resend (the server holds a prefix of ours), reload (we hold a prefix of
   theirs), fork (they differ, so this tab's transcript becomes a new chat and
   neither side's words are lost). A reload that finds the user typed something
   meanwhile forks too.
3. **Forks can never loop.** A fork always saves from revision 0, and a 404 on
   a revision-0 save — or the flag-gate body `'Not found.'`, distinct from
   `'Chat not found.'` — marks the chat blocked instead of forking again. Without
   that, a server with the feature switched off turns one chat into an endless
   stream of new ones; the mutation removing the guard hangs its test until the
   timeout, which is the loop.
4. **Late answers follow their chat.** `appendToChat` appends to the live
   transcript if that chat is back on screen, else to its detached copy (every
   chat switched away from is kept in memory for the session), and saves. A
   forked chat's old id maps to its new one (`renamed`), so an answer still
   addressed to the old id lands in the right place; a chat deleted here is
   tombstoned, and an answer for it is dropped. Upload and recap cards that
   finish after their chat left report into it the same way.
5. **Retry is only offered on a reply added THIS session.** `restoredCount` on
   the transcript store marks how many messages were loaded rather than added;
   regenerating yesterday's reply would re-run its tools and bill an action. The
   same count is why the first-release prompt, the catalog tour and the usage
   strip now read `selectLiveTurnCount` instead of `messages.length` — a
   restored chat is not a conversation in progress. Both are identical to the
   old behaviour with history off, where `restoredCount` is always 0.
6. **The browser copy is whole or nothing** (`urganize.cache.urgans-chats`, the
   account's user id inside the payload). A transcript that does not fit the
   storage budget is dropped WHOLE, keeping its sync state: a partial prefix
   would make the next save truncate the server copy to match. Sign-out wipes
   it, and `resetChappiHistory()` runs BEFORE `resetForSignOut()` in
   `lib/auth-store.ts` — the other order reads the reset as "leaving a chat"
   and saves it again under the account signing out. The wipe is deliberately
   unconditional, so a copy left by a session when the flag was on still goes.
7. **Saving is never metered.** An UrgAns action is billed where the model runs
   (`/api/urgans`); saving what the user already saw costs them nothing. The
   routes use `requireActiveAuthenticatedUser`, so a curator is refused and a
   read-only team keeps its reads while its writes get the standard 403. Every
   background request carries `x-urganize-prefetch`, so a 402 never redirects
   anyone to `/locked`; a 402 or 403 stops saving for the session and says so
   above the composer, and nothing on screen is lost.
8. **Resume never moves someone who has started.** On arrival the browser copy
   restores a chat used in the last six hours (keeping its real last activity —
   reloading every few hours must not keep a chat "recent" forever); then the
   list loads, and a newer chat from another device opens only if the user has
   not sent, opened or started anything and nothing local is unsaved. An auto
   open that is still fetching gives up if the user does something meanwhile.
9. **With the flag on, message ids are uuids.** They are compared position by
   position across tabs and devices, so they must be unique everywhere; the old
   `<ms>-<counter>-<role>` form would collide between two tabs opened at once.
   History off keeps the old form. The request to `/api/urgans` also sends only
   the last `CHAPPI_HISTORY_LIMIT` messages now — the route already forwarded
   only those to the model, and a restored chat can be hundreds long.
10. **The bridge starts from the persisted identity**, not from auth resolving,
    so a recent chat is restored while the UrgAns page still shows its skeleton
    — never a flash of the greeting and then the chat. A persisted session that
    turns out to be dead signs out, and the sign-out wipe removes what was
    restored. The skeleton reserves a transcript when the browser copy says one
    is coming (`useKnownResumableChat`).

### Where it shows

At **xl+** the UrgAns page gains a 256px chats column beside the conversation —
xl rather than lg because the side menu already holds the left column at lg.
Below xl a "Chats" toggle in the page's header row (which now shows at every
width, since it carries the phone's only way in) swaps the region between the
list and the conversation. The side rail gets a history button in its header
that does the same. In both, **the conversation is hidden, never unmounted**,
while the list shows: its upload and recap cards and any reply still on its way
live in it. The in-conversation "New chat" row steps aside at xl where the
column carries its own. The dock is untouched; production runs the mobile nav,
where it renders nothing. When saving has stopped, one quiet line sits above
the composer ("Not saved yet. We'll keep trying." from the second failed
attempt, so a two-second blip does not flash; "This chat can't be saved right
now."; "This chat is too long to save. Start a new chat.").

### Tests

127 new, all in `lib/` because vitest collects only `lib/**` and `app/**`:
`conversation-history.test.ts` (68, the pure decisions), `conversations-server.test.ts`
(18, the table against a recording fake), `conversation-cache.test.ts` (10), a
full-loop `conversation-sync.test.ts` (17) that drives the REAL store against an
in-memory server answering with the same `applySync` rules the route uses, and
`conversation-history-guard.test.ts` (14): every query on the table is scoped to
its owner, the routes are never metered and check the flag before auth, the
stores cannot form an import cycle with the auth store, and the table has row
level security and cascades from its owner. The new UI and server files joined
the press-kit copy guard as a new surface born under the house rules;
`ChappiConversation` deliberately did not, since it predates them. **Mutation-
tested:** adopting another tab's ids before reloading, removing the fork-loop
guard, ignoring renames, dropping the owner check from the delete, and moving
auth above the flag each fail exactly the test written for them.

### Verified

3327 tests passing (3200 before), `eslint .` at 3 errors / 79 warnings against
a measured 3/78 — the one new warning is `useKnownResumableChat`'s mount-effect
read, the same shape as the three hooks beside it in `known-counts.ts` (a second
one, the delete dialog's portal mount guard, was removed rather than accepted:
that dialog only ever opens from a click on a client-rendered list). `tsc
--noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors. `next build` green **by exit code** in both
flag states with `/auth`, `/onboarding`, `/settings`, `/dashboard` and
`/dashboard/urgans` all still `○ Static` in each. Runtime probes on
`next start`, rebuilding between states: flag off, all four chat handlers answer
404 `{"error":"Not found."}` while `/api/releases` answers 401; flag on, all four
answer 401. The delete button's hover reveal was confirmed in the compiled CSS
(the `@media (hover:hover)` block, the group-hover variant, and `focus-visible`
for keyboard users).

### Not verified

**Nothing has run against a real database or in a browser.** The migration is
unapplied, this sandbox cannot mint a session, and there is no route to
app.urganize.app — so no chat has been saved for real, no list has rendered, no
two-tab conflict has happened outside the fake server, and resume has never
restored a real chat.

### Activation checklist

1. ~~Apply `20260924100000_urgans_conversations.sql`~~ — done by the founder
   2026-09-24, confirmed independently rather than taken on trust: an
   unauthenticated PostgREST `GET` against `urgans_conversations` returned
   **200** with `[]` (RLS hiding every row from an anon caller, not a
   missing-relation error), and an anon `POST` was refused with **42501** —
   proof the table and its owner-scoped policies are both real.
2. ~~Set `NEXT_PUBLIC_FEATURE_URGANS_HISTORY=true`~~ — done 2026-09-24 via
   the Vercel dashboard on the `Web` project's Production environment
   (Config, non-sensitive, matching every other flag there), with an
   explicit no-build-cache redeploy of the then-current production commit.
   Confirmed against production itself rather than the dashboard alone:
   `/api/urgans/conversations` flipped from 404 to 401, and `/api/version`
   reported the fresh `builtAt`.
3. ~~Changelog entry + minor version bump~~ — done, this commit, **v1.44.0**.
4. **STILL OPEN:** the privacy page (`apps/homepage/app/privacy/page.tsx`)
   should say UrgAns chats are kept until deleted and removed with the
   account; bump its `LAST_UPDATED`.
5. ~~Manual pass~~ — **PARTIAL**, in the founder's own real account (he
   signed the browser session in himself). Confirmed: a real message
   round-tripped through a genuine `PUT`, survived a full page reload (not
   client-side routing), and appeared in the history list with the right
   title and timestamp; delete was confirmed through the real `DELETE`
   route and the list correctly returned to "No saved chats yet" after —
   the UI button's hover-reveal itself did not register a click across
   several attempts from this sandbox's browser automation, with nothing in
   the network log suggesting the button is actually broken, so a real click
   is still worth doing. **NOT exercised:** the two-tab conflict path,
   switching chats mid-reply, signing out and in as a different account,
   offline queuing, a read-only team's notice, the export including chats,
   and a rigorous pass across all three responsive layouts against the
   skeleton (only the narrow and xl layouts were seen, in passing).

### Known limits, stated plainly

- A chat switched away from and not yet saved is lost if the tab closes within
  a round trip; the chat on screen is protected by the browser copy, and a
  hidden page flushes with `keepalive` where the body fits.
- No rename, no search, no pinning, no live cross-tab refresh beyond conflict
  handling, no MCP access to chats, no auto-purge, no admin view. All out of
  scope on purpose.
- The router fallback (no model configured) answering after a chat switch is
  dropped rather than routed, since it acts on the screen it runs on.
