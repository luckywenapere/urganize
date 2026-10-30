# Brief board: build plan (2026-10-30, #897, mock approved)

The brief becomes a board: the rollout's home for the creative team and the people doing the work. Mock approved by Oyin on 30 Oct 2026: `docs/mocks/visual-brief/mock.html` (desktop board, Present, phone, shared link). Decisions from the same day are on #897.

Nothing here is built yet. This is the plan.

## What exists today (read before building)

- Page: `components/releases/ReleaseBriefScene.tsx` (1,360 lines), behind `BriefIdeaGate` while an ideas round is open. Scene key `brief`, second in `lib/release-menu.ts`.
- Pure half `lib/release-brief.ts`, database half `lib/release-brief-server.ts` (`loadBriefPayload`, `loadPublicBrief`).
- Tables: `release_briefs` (idea, share token, round and approval columns), `release_brief_references` (link or image link), `release_brief_decisions`, `release_brief_revisions`. RLS on with no policies; every route checks `ensureReleaseTeamReadAccess` / `WriteAccess`.
- Dates and Who's on what are derived from tasks on every read. Keep it that way.
- Approve locks the idea, decisions and references (`brief/round`); New version unlocks.
- UrgAns action `release.brief_from_ideas` writes the brief from the ideas round.
- View link `/brief/[token]`: anonymous, always dark, shows idea, references, dates.
- Guests (`workspace_members.role = 'guest'`) can read but never write (`decideReleaseAccess`). Members can already be limited to chosen rollouts.

## The data

One migration (back up `release_briefs` and `release_brief_references` first):

1. **`release_brief_cards`**: `id`, `release_id`, `kind`, `x`, `y`, `w`, `h` (whole grid cells, 12 columns), `payload jsonb`, `created_by`, `created_at`, `updated_at`. `kind` is one of: `cover`, `idea`, `countdown`, `feels`, `palette`, `look`, `sound`, `decisions`, `moments`, `pieces`, `people`, `note`. A board with no rows uses the default layout from the mock, built in code; the first move writes the rows. Only `note` can appear more than once.
2. **`release_briefs`** gets `headline` (the short idea line, 120 chars), `feels_like text[]`, `not_this text[]`, `palette text[]` (5 hex values).
3. **`release_brief_references`** gets `storage_path` (uploaded image), `caption` (60 chars) and `section` (`look` or `sound`). Image links and uploads show in Look, other links in Sound. Existing rows read as before.
4. **`release_brief_views`**: `release_id`, `user_id`, `seen_at`, for "Seen the brief: 3 of 3".

Every new table: RLS on, explicit grants to `authenticated, service_role` in the same migration.

Images go in the existing private `release-assets` bucket under `brief/<release_id>/`, not the `assets` table, so the Files cut stays as it is. Resize in the browser to 2000px long edge before upload, 10 MB cap, signed links on read.

## Who can do what

| | Owner, team admin | Member | Guest |
|---|---|---|---|
| Read the board | yes | yes | yes, limited to their rollouts |
| Add a note, image, link | yes | yes | no (see decision 1) |
| Edit or delete their own card | yes | yes | no |
| Move, resize, delete any card | yes | no | no |
| Edit idea, feels, palette, decisions | yes | yes, until approved | no |
| After approve | everything | notes only | no |

Leads is the existing `canManageBriefShare` rule. Last write wins per card, so two people moving different cards never clash. No live cursors in V1; the board refetches when the tab gets focus.

## Phases (one PR each, live at merge, no flag)

Each phase keeps everything the brief does today, so nothing goes backwards between merges.

**1. The board, read and edit.** Migration. Pure layout module `lib/brief-board.ts`, tests first: the default layout, phone order (y then x), which cards a rollout shows. Board component in the fixed default layout with every card from the mock reading today's data: cover (the release cover art, or an initials tile when there is none), idea with headline, countdown ("Pick a day" when there is no release date), feels like, palette (typed hex for now), look and sound from references, decisions, key moments (from `deriveBriefDates`), who's on what (from `deriveBriefPeople`). The add bar, history, share, approve and the ideas round work as today. Brief moves to the first tab and becomes the scene a rollout opens on (check it against the phone-upright and plan-landed paths in `WorkspaceView`). Phone: one column, + button. Update the brief skeleton in the same PR.

**1b. Arrange.** Drag and resize with pointer events for leads, tests first: snap to cells, a dropped card pushes the cards below it down (no overlaps), clamp to 12 columns. A move saves the whole layout in one request, because pushing one card down moves others. Phone: long-press to reorder.

**2. Images and notes.** Upload from the add bar or drop onto the board, captions on images, sticky notes. Palette read from the cover art in the browser (pick 5 colours from a downscaled canvas), editable. Check first that signed storage links allow the canvas read (CORS); if not, pick the colours on the server at upload. Tests: colour picking, caption limits, who may delete.

**3. What we're making.** A task is a piece when its template step or planner v2 task is a deliverable. A fixed list of template step keys (cover art, visualiser, teasers, lyric cards, press photo, release day post, and their EP and album twins) plus a `deliverable` field the planner v2 prompt fills. The Piece button adds a task to the plan with owner, due date and a one-line spec; a toggle in the task drawer shows any task on the brief. Status, owner and due always come from the task. Tests: which steps are pieces, ordering, late counts.

**4. Present and seen.** Present mode: full screen, five screens (Idea, Look, Sound, Making, Dates), arrow keys and clickers, Esc to leave. Record a view when someone opens the brief; show "Seen the brief: n of m".

**5. UrgAns builds the first board.** Extend `release.brief_from_ideas` (and the Draft with UrgAns action) to return the headline, idea, 4 feels-like words, 3 not-this words and decisions as JSON. Images stay empty slots that say what to drop in; the palette comes from the cover. Metered as today. Tests on the parser with bad model output.

**6. Share with a person.** "Share with a person" picks the pieces, takes a name and email or phone, and makes a guest invite limited to this rollout. Their link shows the brief and "Your part" (those pieces and due dates). When they join, the pieces are assigned to them. The view link follows the device's light or dark setting. Needs decisions 1 and 2.

## Staff review of this plan

- **Designer:** every card needs an empty state that says what to add, and the board must look finished with no photos (initials tile for a missing cover, no gradient placeholders). Motion only when a card really moves.
- **PM:** phase 1 was too big to review in one PR, so arranging is split out as 1b. Phases 1 to 4 are what a label demo needs; 5 and 6 come after.
- **Engineer:** save the layout as one request, not one row per card, or a push-down leaves half-moved boards. Derived cards never store task data, so the plan stays the only place a date is typed.
- **VP:** the two guest decisions below change pricing and access, so they wait for Oyin and do not block phases 1 to 5.

## Decisions for Oyin (before phase 6)

1. **Guests can't tick anything today.** A guest is read-only. The mock has a guest marking their own part done. Recommended: a guest may change the status of a task assigned to them, and nothing else.
2. **Guests take a seat today.** The mock says "Free for guests"; that is not true yet, and Solo has one seat. Recommended: guests invited from a brief do not count toward seats, capped at 5 per rollout. This is a pricing call.

## Measure

Opens of Brief vs Work the plan, Present opens, share link opens, guest joins from a link, and the week after: do guests come back. No usage data exists yet, so every claim about how people will use this is a prediction until these are in PostHog.

## Not in V1

Free drawing, an infinite canvas, live cursors, audio uploads, a budget card, comments on cards.

## Phase 1: delivered (v1.217.0, 2026-10-30)

- **Data:** `20261030180000_brief_board_look_and_feel.sql`, applied to production 2026-10-30 (backup `release_briefs_backup_20261030`, 6 rows). `release_briefs` gained `headline`, `feels_like`, `not_this`, `palette`; revisions gained block `feel` ("Look and feel" in History). No cards table yet: phase 1 places cards by rule, phase 1b stores positions.
- **Rules:** `lib/brief-board.ts` (tested): `parseBriefFeel`, `briefCountdown`, `briefProgress` (cancelled out, late = open and due before Lagos today), `momentsTrack` (evenly spaced, Today between past and future), `boardPlacements` (12 columns, absent cards close up), `boardPhoneOrder`.
- **Payload:** `GET /brief` adds `board` (title, artist, signed cover link, release day, today, progress, feel). `PATCH /brief` without `idea` saves the look and feel; the approve lock applies to it too.
- **UI:** `components/releases/BriefBoard.tsx`. The scene keeps loading, autosave, the ideas round and the sheets, and hands the idea field, decisions, to settle, ideas or notes, and New version in as slots. Wide board (860px and up) uses the grid; narrower stacks. The old References block is gone: image links show in Look, other links in Sound and links. Shared call and avatar: `components/releases/brief-shared.tsx`.
- **Landing:** `resolvePanelBody(raw, dateless, landsOnBrief)`. A rollout lands on the brief when it has a plan and a release day (`useLandsOnBrief`); with no plan or no date it keeps its old landing, because those views hold the only doors to building the plan and setting the day. WorkspaceView, TasksPanel and the rollout menu all pass the same answer. The workspace skeleton cannot know about the plan, so it still reserves the plan shape for a moment.
- **Menu:** Read the brief leads `RELEASE_MENU_ORDER` and the rollout menu.
- **Not yet:** drag and resize (1b), uploads and notes (2), What we're making (3), Present and Seen (4), UrgAns first board (5), share with a person (6).

## Phase 1b: delivered (v1.219.0, 2026-10-30)

- **Data:** `20261030200000_brief_board_cards.sql`, applied to production 2026-10-30 (a new table, nothing backed up). `release_brief_cards` holds one row per placed card: `card_key` (the card's name now, `note:<id>` for phase 2 notes), `kind`, `x`, `y`, `w`, `h`, `payload`. Unique `(release_id, card_key)` is what the one-request upsert conflicts on. RLS on, no policies, explicit grants.
- **Rules:** `lib/brief-board-layout.ts` (tested): `clampPlacement` (whole cells, a narrowest width per card, at most 4 rows tall, inside 12 columns), `moveBoardCard` (the cards a drop lands on are pushed down, then everything falls up; moving down past a card puts it after that card), `nudgeBoardCard` (arrows move one cell, shift and arrows resize, down passes only the next card), `resolveBoardLayout` (stored places for the cards that are there, new cards added at the bottom, nothing stored means the default), `layoutPhoneOrder`, `parseBoardLayout`.
- **API:** `PUT /api/releases/[id]/brief/layout { cards }` saves the whole board; `DELETE` resets it. Rollout owner or team owner/admin only (`canUserManageBriefShare`), 403 otherwise. The approve lock does not apply: arranging changes how the brief looks, not what it says. `GET /brief` adds `board.layout` and `board.canArrange`.
- **UI:** Arrange (wide board, leads only) puts a dashed layer over each card that takes the pointer and the keys, so card buttons rest while arranging; a corner handle resizes. Saves 350 ms after the last change, so a run of arrow keys is one request; a failed save puts the board back and says why. Cards slide to their new place (Web Animations), skipped under reduced motion. A phone reads an arranged board top to bottom, then left to right.
- **Not done from the plan:** long-press to reorder on a phone. Arranging stays a computer task; a phone shows the order set there.

## Plan first, brief as a button (built 2026-10-30, v1.220.0, #902)

Oyin, after v1.217.0: the plan should lead and the brief should be a button inside Work the plan that opens the brief bigger, until you go back to the plan. This reverses the "Brief opens first" call from the morning of the same day, for rollouts that have a plan.

**The flow, end to end:**

| Where the rollout is | What it opens on | Where the brief is |
|---|---|---|
| 1. New, no idea yet | The idea screen ("What's the idea?") | Not yet: there is nothing to read |
| 2. Ideas round open | The ideas round | Not yet |
| 3. Round closed, UrgAns wrote the brief | **The brief**, once, so the owner reads and approves it. Approve builds the plan | It is the step |
| 4. Plan built (most of a rollout's life) | **Work the plan** | A Brief button in the plan's header (cover thumbnail plus the one-line idea), opening the brief in focus |
| 5. Released, recap | The recap, as today | Brief button stays in the plan header |
| A person opening a brief link, a guest (phase 6), Present (phase 4) | The brief, alone | It is the page |

**Focus view:** the brief takes the whole content area: the rollout's top menu and side rail tuck away, the board gets the full width, and a "Back to the plan" button sits top left (Esc and the browser's back button do the same). It is its own URL (`?view=brief`), so a link, a notification about a decision, or a refresh lands back in it. Present (phase 4) starts from here.

**Phone:** the Brief button sits in the plan header too and opens the brief full screen with a back arrow; swiping back returns to the plan.

**Menu:** "Read the brief" leaves the first slot (Work the plan leads again) and stays in the ... menu so it can still be found.

**Scope (one small PR, before phase 2):** landing back to the plan once a plan exists (step 4), the Brief button in the plan header, the focus view, the one-time brief at step 3, the menu order. No data changes. Needs a mock and Oyin's yes first.

**Measure:** taps on the Brief button, time in the focus view, Back taps vs other exits.

### What was built (v1.220.0)

- **Landing:** the v1.217.0 rule is gone (`useLandsOnBrief` deleted, `resolvePanelBody` back to two arguments), so a rollout opens on its plan again. Menu order is back to the plan views first (`RELEASE_MENU_ORDER`, `buildRolloutMenu`), with a dated comment.
- **Computer:** `BriefEntryButton` (`components/workspace/BriefEntry.tsx`) sits on the page bar line beside the done count, for any rollout with a plan (dated or not). It reads `GET /api/releases/[id]/brief/summary` (`loadBriefSummary`, `briefButtonLine`: the one-line idea, else the story's first sentence, cut to 80; "Write the brief" when empty). The tab row drops Read the brief; it moves to the ··· menu (`RolloutTabs`).
- **Focus:** `WorkspaceDesktopFocused` takes `briefOpen` and `onCloseBrief`: the crumb becomes Back to the plan (Back to the ideas before a plan), and the tabs, the plan's tools, the Menu pill, the banners and the no-date side column step aside. `useEscapeToPlan` closes it on Esc unless a field or dialog has focus, or the board's arrange mode took the key (`BriefBoard` now calls preventDefault on its Esc). Opening a scene pushes history, so the browser's back button also returns to the plan.
- **Phone:** `BriefEntryCard` under the title on the plan; with the brief open, the rollout header is replaced by a Plan back button and the title. The swipe from the left edge is the phone's own back gesture (history), not app code.
- **Not built from the mock:** the rollout does not keep opening on an unapproved brief before a plan exists. That needs the round state at landing, which is fetched, so the page would jump from the ideas to the brief. What already holds the step: closing the round opens the brief, the brief shows Approve and build the plan, and the ideas card shows Read the brief until then.
- **Verified locally** (1440 wide and 375): lands on the plan, the Brief button and phone card, open, Back to the plan, Esc, Esc in arrange mode stays, browser back, Read the brief from the ··· menu. After the restart the local app's offline service worker served a stale chunk (a deleted module); unregistering it fixed that, not a code issue.

## Phase 2: delivered (v1.221.0, 2026-10-30)

- **Data:** `20261030230000_brief_reference_uploads.sql`, applied to production 2026-10-30 (backup `release_brief_references_backup_20261030`, 0 rows). `release_brief_references.storage_path`: an uploaded photo is a kind 'image' row with an empty url and its file under `brief/<release_id>/` in the private release-assets bucket, signed for an hour on every read (`signUploads`), the view link too. No caption column: a photo's caption is its `title` (60 characters for new edits). Sticky notes are `release_brief_cards` rows of kind 'note', `card_key` 'note:<id>', `payload { text }`; no schema change.
- **Rules:** `lib/brief-media.ts` (tested): `parseCaption`, `parseNoteText` (280), `validateBriefImage` (JPEG, PNG, WebP, 10 MB after the browser shrinks to 2000px), `briefImagePath` / `isBriefImagePath` (only this rollout's folder, one file), `mayChangeBriefItem` (whoever added it, or a lead), `pickPalette` (16-level buckets, most used first, near colours skipped). `lib/brief-board-layout.ts` now takes note keys (`BoardKey`, `noteKey`, `isNoteKey`, 30 notes): new notes go under the board side by side; with no arranged fixed cards the fixed cards keep the default layout.
- **API:** `POST /brief/references/upload-url` then `POST /brief/references { storagePath, caption }`; `PATCH /brief/references/[id] { caption }`; deleting a photo also removes its file. `POST /brief/notes`, `PATCH`/`DELETE /brief/notes/[id]`. Photos and captions follow the approve lock; notes do not (the team keeps talking after approval). The layout save writes only places (never a note's text or author) and skips notes deleted meanwhile.
- **UI:** `components/releases/BriefBoardMedia.tsx`. Look has + Photo and + Link, and takes dropped photos (drop on Look or anywhere on a computer's board). Captions are edited in place on the photo. Note button in the board toolbar (Add a note at the end on a phone); notes are yellow in both themes, editable and removable by the writer or a lead. Colours: From the cover reads 5 colours from the cover in the browser into the editor, to check before saving.
- **Verified locally:** a 2400px photo stored at 2000px, signed and shown; caption saved; removing it removed the row and the file; a note added, moved by keyboard (text and author kept), removed; the canvas could read a stored image's pixels (so From the cover works on signed links). The test rollout has no cover, so From the cover itself was not clicked.
- **Not yet:** What we're making (3), Present and Seen (4), UrgAns first board (5), share with a person (6).

## Phase 3: delivered (v1.222.0, 2026-10-30)

- **Rule:** `lib/brief-pieces.ts` (tested). A task is a piece when a person said so (`metadata.brief.show`, from + Piece or the activity's On the brief switch; false takes a playbook piece off), else when its playbook step is in `PIECE_STEP_IDS` (the step where the thing is finished or goes out: cover art approved, teasers, snippet, press release, release day posts, countdown, and their EP and album twins), else when it carries the `deliverable` tag. A guard test holds every listed step and planner move to ones that exist.
- **Planner v2:** tasks from moves that make something (`DELIVERABLE_MOVES`: own content, DJ pack, YouTube premiere, merch drop) get the `deliverable` tag in `lib/planner-v2/server.ts`. The prompt was not changed: the AI is not asked to judge what a deliverable is.
- **Data:** no migration. The flag lives in the task's metadata; a piece's one-line spec is the first line of the task's description.
- **Payload:** `board.pieces` (`briefPieces`): open pieces by due date, undated after, done last, cancelled out; done, total and late counts; who has each. Tasks carry `onBrief` (`lib/tasks-server.ts`).
- **API:** `PATCH /api/releases/[id]/brief/pieces/[taskId] { show }`, team write access, not held by the approve lock. + Piece creates the activity through the task store (`POST /api/tasks`, the same door as New activity), then marks it.
- **UI:** `components/releases/BriefPiecesCard.tsx`, a full-width card between To settle and Key moments (after Decided on a phone); `components/tasks/BriefToggleRow.tsx`, the On the brief switch in an activity's details. The switch keeps its own saved value, because the detail panel holds a copy of the task.
- **Verified locally:** the empty state; + Piece made an activity with its spec and showed it; the switch put an activity on and took it off (saved each time); the card ordered a dated piece before an undated one.
- **Not yet:** Present and Seen (4), UrgAns first board (5), share with a person (6).
