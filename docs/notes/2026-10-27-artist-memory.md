# UrgAns remembers each artist (2026-10-27, v1.194.0)

A small structured memory, not a memory of everything. One fact per row, about one artist: the topic, what it says, where it came from (said in chat or set by hand), who said it and when. Mocks: `docs/mocks/artist-memory/mock.html`. Oyin said "work on it" on 27 Oct after seeing them, and asked that it use the app's existing UI and connect to the rest of the app.

## Why

Teams leave between releases. A manager states a decision once ("Kemi doesn't want playlist pitching") and expects it to hold weeks later, in a new chat and in the next plan. Saved chats (`urgans_conversations`) did not do that: nothing structured was kept.

## How it works

- **Table `artist_facts`** (`supabase/migrations/20261027180000_artist_facts.sql`, applied 27 Oct, new table only): `workspace_id`, `artist_id` (cascade on artist delete), `topic`, `value` (1 to 200 chars), `source` (`chat` | `manual`), `said_by`, timestamps. RLS select for the team's active members and owner; writes only through service-role routes. Explicit grants.
- **Topics**: `playlist_pitching`, `preferred_channel`, `budget`, `contact`, `other`. One fact per topic per artist (partial unique index), except `other`, which holds up to 10. A new decision on a topic replaces the old one.
- **Rules and copy** are pure, in `apps/web/lib/artist-facts.ts` (tested in `artist-facts.test.ts`): validation (refuses over 200 chars rather than cutting), `planFactSave` (insert, replace, unchanged, full, missing, taken), the prompt block, the planner line, the card copy and the "You said it in chat · Oct 27" line.
- **Database side**: `lib/artist-facts-server.ts`. `resolveFactArtist` is the one access check: the artist must be on one of the caller's teams, and an artist-scoped member only sees their own artist. Routes and tools both pass the same scope.
- **UrgAns tools** (`lib/chappi/tool-families/artist-facts.ts`): `list_artist_facts` (read), `save_artist_fact` and `forget_artist_fact` (level `confirm`, confirmation-gated, never on MCP). UrgAns proposes; the existing confirmation card shows "Remember this about Kemi?" (Save) or "Change what UrgAns remembers about Kemi? Was / Now" (Update). Forget uses a neutral card, not the red delete one. ROLE tells UrgAns when to propose (a lasting decision about one artist, not a one-off ask, a passing remark or anything private) and to follow saved facts.
- **Context**: `portable-context.ts` puts the facts block after the team brief and before the live snapshot (`composePortableText`, tested). So UrgAns in chat and a customer's own LLM over MCP read the same facts.
- **Planner v2**: `previewPlanV2` loads the rollout's artist's facts and adds one line to the prompt (`PlanV2Context.artistFacts`), so a plan for Kemi leaves pitching out.
- **Artist page**: `components/artists/ArtistFactsCard.tsx`, "What UrgAns remembers", above Rollouts. Tap a line to change or remove it; Add writes one by hand. Reuses the catalogue card's `Modal`. Routes: `GET/POST /api/workspace/artists/[artistId]/facts`, `PATCH/DELETE .../facts/[factId]`.
- **Action log**: tool saves and forgets are logged by the dispatcher like every confirm-level tool; `factId` now resolves to object type `artist_fact` with a before/after snapshot from `artist_facts`. A save without a factId logs against the artist, with the fact in the summary. Hand edits on the page log too (`source: 'memory'`, `trigger: 'artist_page'`, tools `memory.save_fact` / `memory.forget_fact`) through `facts/log.ts`.

## Not built (on purpose)

- The "Using what you saved about Kemi" line under an answer (mock screen 3). UrgAns says it in the reply instead ("No playlist pitching, as you asked."). A marker would need the reply to carry which facts were in context, like the hidden team brief marker.
- Facts about anything but artists, and any automatic saving.

## Verified

- Measured: `vitest` green on the new and touched tests; live table has 9 columns, RLS on, 1 policy, 3 indexes, grants for `authenticated`, the updated_at trigger.
- Not verified: a real model turn proposing a save, and the artist page in the browser on production.
