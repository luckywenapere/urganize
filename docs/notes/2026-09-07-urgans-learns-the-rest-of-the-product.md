# UrgAns learns the rest of the product (2026-09-07)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: *"Update the AI UrgAns about all the new features in Urganize and it
should be able to do agentic actions on all of them."*

**Not a scope expansion, no migration, no new flag, and nothing that reaches a
user until the surface it serves is itself switched on.** Every new tool
inherits its feature's existing flag through `isFlagGateOff`, so a switched-off
surface stays politely unavailable. Revert is `git revert`.

The registry goes **48 → 91 tools**, and the capability list in `ROLE` finally
names all of them.

### The root cause is a hand-maintained list nothing checked

`ROLE` in `lib/chappi/system-prompt.ts` is a prose list of every tool, grouped
into labelled families. **The model's entire idea of what this product can do
comes from that block** — a tool absent from it is never reached for even
though its schema is still sent on every turn. Nothing generated it and nothing
verified it, so it fell three months behind: shows, press kits, the roster, the
directory, cover art, capture and credits were all invisible. Ask UrgAns "what
is Dorian's set for Friday" and it had no concept of a show.

**`system-prompt.test.ts` now asserts both directions** — every registered tool
name appears in `ROLE`, and `ROLE` names no tool that is not registered. That
is the house's registry-invariant pattern, and it ends the drift class rather
than this instance of it: the next family cannot be added without the model
being told. Mutation-tested by deleting one name from the prose.

### Six new families, and one bug the guard found

`shows.ts` (14), `press-kits.ts` (7), `artists.ts` (5), `files.ts` (3),
`capture.ts` (4), `directory.ts` (6), plus four into existing families
(`archive_release`, and the three credits tools) and an `isTest` parameter on
`create_release`.

**Verb-shaped, not one per endpoint.** Sixteen event routes became fourteen
tools because `get_show` answers the whole question in one read: the show, its
run of show, every setlist with its running total against the slot, and who
has the pack. A tool per route would have made the model chain four calls to
answer "is Friday's set going to overrun".

**A second guard checks the flag-off contract**, and its first honest run found
a real pre-existing bug: `generate_status_update` was reporting an ownership
404 as "that feature isn't enabled", so a manager asking about someone else's
release was told the status generator was switched off. It also surfaced that
**thirteen routes across five surfaces spell the flag-gate body without a
period** (`'Not found'`), so `isFlagGateOff` now accepts both spellings —
fixed in the one place that reads the contract rather than in thirteen routes.

### Seven things worth knowing before adding to this

1. **`remove_setlist_item`, not `delete_setlist_item`, and the name is the
   point.** `tool-registry.test.ts` requires every `delete_*` tool to be
   confirmation-gated. Taking one song out of a list is trivially reversible
   and does not deserve a card, so the honest name keeps the rule intact
   instead of carving an exception into it. Same reasoning for
   `remove_artist`, which is additionally ungated because the server refuses
   any removal that would lose something (releases, scoped teammates, the last
   artist), so what can reach it removes an artist with nothing attached.
2. **Nothing was added to the MCP allow-list, and that is inaction rather than
   an omission.** Every new tool proxies a route whose handler does not accept
   the internal actor, so allow-listing one would 401 for every MCP client —
   which `tool-registry.test.ts` asserts structurally. `protocol.test.ts`'s
   count stays **14**. Widening MCP needs route-level auth changes first.
3. **The read-then-merge trap applies to two of the new PATCHes.**
   `PATCH /api/events/[eventId]` is genuinely sparse and `update_show` sends
   only what changed. But the press kit's section PATCH **replaces** that
   section's `content` object, and the capture page's runs every field through
   `normalizeCaptureDraft`, so a sparse update there would blank the
   destination link and unpause a paused page. Both read first.
   `update_capture_page` additionally refuses to unpause a page with no
   working destination, because taking an email and returning nothing is the
   one outcome that feature must never produce.
4. **`upload_cover_art` needed new UI, for the reason `upload_song` already
   records:** no tool can be handed a file. A model turn is text, and
   `input.click()` only opens a dialog inside a user gesture, while a tool
   result arrives from a network response. So the tool resolves the release and
   the BROWSER uploads, through a picker card in the transcript
   (`ChappiCoverArtUploadCard`, mirroring the song one). Choosing a file
   REPLACES the current artwork, which the tool description says out loud.
5. **`write_press_kit_section` writes what the model composed in
   conversation**, and only the three prose sections. For a bio, the model
   writing it is the point; numbers, press quotes and contacts are facts a
   manager enters and `ROLE` forbids filling them in. The embedded
   `press_kit.draft_section` action is the propose-then-apply version of the
   same thing and is untouched — the chat cannot render a review-and-apply
   card.
6. **`list_release_files` returns no download links**, deliberately. Asset
   URLs are signed and short-lived, so a link in a transcript is a link that
   403s by the time anyone taps it.
7. **The three outward actions are gated** (founder call): `send_dj_pack`
   reaches a real person's phone, `send_work_request` lands in a stranger's
   inbox, and `publish_press_kit` puts an artist's page on the public
   internet. None can be unsent, which is the whole gating rule.

### Deliberately given no tool, and `ROLE` says so

A new "not yours to do" paragraph extends the existing negative-capability
precedent, so UrgAns points at the right screen instead of denying a feature
exists. **Task outcomes lead it:** the app asks a person how an activity went
and that answer is theirs, so the assistant must never write one or offer to.
Then billing, data export, issue reports and MCP connections, and finally the
two things the product genuinely cannot do — send email to fans, or talk to a
DSP or distributor.

### The deterministic router

Production runs with no model configured for long stretches, and that router
IS the assistant then. Shows is live, so it gets one branch — and the
collision is the whole difficulty: **"show me my releases" contains "show".**
So the pattern matches `setlist`, `set list`, `gig`, `dj pack`, `run of
show`, `my shows`, `venue`, `soundcheck` and **never the bare word**, and it
sits before the planner and release branches, which claim `plan`, `song` and
`track` between them — every one a word a conversation about a set is full of.
A test asserts "show me my releases" still routes to releases. No new chip:
that row is lg-only and already up to six wide.

### The cost, measured rather than assumed

Tool schemas are sent on **every turn**. Measured: **~5,700 → ~10,100 tokens**
of schemas, with `ROLE` at ~2,600, so fixed per-turn overhead goes roughly
8,500 → 13,000 on `openai/gpt-4o-mini`. Money is negligible at this scale.
**Tool-selection accuracy is the real risk**, and the mitigation is the `ROLE`
grouping (which the model reads as a map) plus tight descriptions. The
tempting alternative — one `manage_setlist` tool with an `action` parameter —
is worse on both counts: a vaguer schema the model gets wrong more often, and
it defeats the confirmation gate, which is per-tool.

### Verified

2744 tests (46 new across `shows`, `shared`, `intent-router` and the two
guards), `eslint .` at the exact measured 3-error / 81-warning baseline with
zero new findings, `tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code** in
both flag states with `/auth`, `/onboarding`, `/settings` and `/dashboard`
still `○ Static` in each. Runtime probes, rebuilding between flag states:
flag on, a new surface's route 401s unauthenticated; flag off it 404s with the
body the contract requires while the ungated `/api/releases` still 401s.
**Three mutation passes**, each failing exactly its own test: a tool name
deleted from `ROLE`, `isFlagGateOff` dropped from a tool that needs it, and
`confirm` removed from `delete_show`.

**NOT verified, and it is the whole residual risk: no live model call.** This
sandbox has no route to either urganize domain and cannot mint a session, so
whether the model reaches for the right tool among 91 rests on the schemas and
on `ROLE`, not on anything observed. The manual pass is the real test: ask
"what shows has Dorian got coming up", "build me a 25-minute set from his
catalogue", "is the set going to overrun", "send the pack to Tunde the DJ"
(expect an approval card), "write Dorian's short bio for the press kit", "put
the press kit live" (expect a card), "add Victony to the roster", "archive
Midnight EP" — then ask about something switched off, "collect credits for
Ohema", and confirm it says that isn't switched on rather than inventing a way
round.
