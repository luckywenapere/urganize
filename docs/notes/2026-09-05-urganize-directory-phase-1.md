# Urganize Directory — Phase 1 (2026-09-05, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The nineteenth sanctioned expansion (see the 2026-09-05 note in "v1 scope"). An
in-app record of the people who do the work on a release. Phase 1 only: schema,
the role map, the backfill. **No UI, no profile screen, no search.** Behind
`NEXT_PUBLIC_FEATURE_DIRECTORY`, default `false`; migration
`20260905200000_person_directory.sql` **not applied anywhere yet.**

Founder brief answered four blocking questions before any code: listing is free
on every tier and SEARCH is Manager and above; there is **no verified
threshold** (the count is the badge); person slugs get their own namespace at
`/p/{slug}`; and delivery records **survive leaving a team**.

**Four things the brief assumed that the code did not, all measured:**

1. **The verification rule as written verified nobody, ever.** It asked for a
   release whose status is `released`, and nothing in this product has ever
   written that value — `GET /api/releases/[id]` additionally overwrites the
   stored status with a computed one that cannot be it. The backfill would have
   returned zero rows. Founder call: reuse `lib/recap-eligibility.ts`, which is
   already the product's honest answer to "has this happened" (date passed, or
   every task done). One definition, two features.
2. **The role vocabulary had almost no source data.** The brief lists sixteen
   roles; tasks carry six ARCHETYPES, distributed across single_v0.3's 62 tasks
   as manager 34, marketing_lead 22, artist 6, team 1, designer 1,
   distributor_contact 0. An archetype-driven directory would say almost
   everyone is a manager and eleven roles could never hold a record. The map is
   keyed on TASK IDS instead (`lib/directory-roles.ts`), the
   `lib/cover-art-tasks.ts` pattern, asserted against the live playbooks.
3. **Five roles reach the honest bar, not sixteen**, and that is the finding
   rather than a shortfall. The playbooks are written from the MANAGER'S point
   of view: "Brief designer on cover art" is the manager writing a brief, not a
   designer delivering. Only steps where work ARRIVES can credit their
   assignee — graphic designer, master engineer, videographer, PR, digital
   marketer. The other eleven stay claimable and unverifiable, and the UI has to
   say so rather than hide it. `*_content_shoot` is deliberately unmapped: it is
   a photographer or a videographer depending on the release and nothing in the
   row says which, so crediting both would inflate two records off one job.
4. **Backfilling from `assigned_to_user_id` would have manufactured
   credentials.** Template instantiation assigns EVERY task to the release
   owner, so a naive backfill hands one person all 60-plus tasks of every
   release they own — the invented credential the brief's own section 4 forbids,
   reached by a different route than self-typing. The filter is
   `lib/task-owners-server.ts`'s: only a task assigned to someone OTHER than the
   owner is evidence of anything.

**Five things worth knowing before editing this:**

- **`delivery_records` has no write policy for any role.** Not an oversight, the
  entire asset. `lib/directory-schema-guard.test.ts` asserts the table's only
  policy is a SELECT, mutation-tested, so adding one is a build failure.
- **One row per person per role per RELEASE**, enforced by two partial unique
  indexes rather than by whoever writes next (a null never equals a null, so one
  index over both scope columns would let duplicates through). A designer who
  delivered a draft and then the final artwork delivered one release's artwork.
- **Second cross-tenant read in the schema.** `person_profiles` carries two
  SELECT policies: your own row whatever its visibility, and anybody else's only
  once they have opted in. `delivery_records` has NO policy for other people on
  purpose — section 10's rule (a release title is visible only where that
  release is public) depends on state RLS cannot see, so serving somebody else's
  records is a service-role read behind a route that applies the rule once.
- **Records outlive membership**, so there is no `workspace_id` on the table and
  nothing cascades from `workspace_members`. They die with the user's own
  account or with the release, and nothing else. Verified against real rows.
- **The backfill is DRY RUN by default.** `GET /api/admin/directory-backfill`
  reports counts per role and writes nothing; POST writes. The report's SHAPE is
  the check: if one role holds every record or one person holds dozens, the
  not-the-owner filter has regressed and it must not write. Deliberately not
  flag-gated (the `/api/admin/teams` precedent) so the founder can see what it
  would do before the feature is switched on.

**Verified:** 2582 tests (22 new across `directory-roles.test.ts`,
`delivery-records.test.ts`, plus 5 in the schema guard), `eslint .` at the exact
3-error / 79-warning baseline, `next build` green by exit code in both flag
states with `/auth`, `/onboarding` and `/settings` still `○ Static`. **Seven
mutations, each killing exactly its own test:** crediting the release owner,
dropping the delivered check, one row per task instead of per release, ignoring
task status, crediting a briefing step, a typo'd task id, and a hand-written
verifiable-role set. The migration was applied to a scratch Postgres 16 and
every documented rule exercised with real rows — the private default, both
uniqueness rules, the scope check refusing zero and two, an out-of-vocabulary
role, the release cascade leaving the profile, the user cascade taking both, and
a clean re-apply.

**A verification lesson worth keeping:** the delivered-check mutation first
appeared to SURVIVE. It had not — the `sed` used six leading spaces where the
line has four, so the mutation never applied. Applied properly it kills two
tests. **Confirm a mutation actually landed before believing a survivor.**

**Not verified:** nothing has run against a real database. No backfill has
executed, no record exists, and the dry run has never reported real numbers.
`show_id` is in the schema and nothing writes it yet — shows verify the same way
once a show date has passed, which is a later phase.

### Phase 2 (2026-09-05): opt in, the editor, the controls

Your own profile only. `GET/PATCH /api/directory/profile`, and a "Your
directory record" section in Settings -> Account. **No public profile page and
no search yet** — reading somebody ELSE'S profile has to apply section 10's
field rules, which depend on state RLS cannot see, so it belongs with the
directory read rather than bolted onto this.

Four things worth knowing:

- **What you type and what you delivered are rendered APART**, deliberately.
  The role chips are a claim you can toggle; the counts below them come from
  `delivery_records` and nothing on that page can change them. Blurring the two
  would put the record back at the mercy of self-reporting.
- **A delivered role you never claimed still shows** (`profileRoles` in
  `lib/person-profile.ts`, mutation-tested). Somebody who delivered artwork and
  never ticked "graphic designer" has the record either way.
- **Absent and null mean different things in the PATCH.** The editor saves one
  field at a time, so an omitted key leaves the stored value alone while an
  explicit null clears it. Treating absent as null would wipe a bio the moment
  somebody edited their city — the trap the credits route and the curator
  profile each had to fix. Mutation-tested.
- **The handle is suggested once, on the first save, and never regenerated.**
  It is a URL somebody may already have shared, so a later rename must be an
  explicit edit rather than a side effect of changing your name.

**The curator overlap, decided.** `person_profiles` and `curator_profiles` stay
SEPARATE rows, and the directory is a team-side surface in v1: the profile route
uses `requireActiveAuthenticatedUser`, which `blockCuratorAccount` refuses, so a
curator-ONLY account cannot opt in yet. Chosen because it touches the curator
containment model not at all, and because widening it is additive later while
narrowing it would not be. Note "Playlist curator" still makes sense in the
vocabulary — a team user can claim it; it is not reserved for curator accounts.
**Reversing this is a founder call**, and the thing to decide then is whether a
curator's display name and bio are one row with this or two.

**Also fixed in passing:** `DirectoryProfileSection` imported `Loader2` from
`lucide-react` directly, which `lib/icons-registry.test.ts` (landed on main the
same day) correctly failed. Routed through `@/components/icons` rather than
exempted.

**Verified:** 2599 tests (17 new in `person-profile.test.ts`), lint at the exact
3-error / 79-warning baseline, `next build` green by exit code in both flag
states with `/auth`, `/onboarding` and `/settings` still `○ Static`, and a
runtime probe showing `/api/directory/profile` 404s with the body exactly
`{"error":"Not found."}` when off and 401s when on, against an ungated control
that 401s either way. Three mutations killed their own tests: treating an absent
field as null, allowing any url scheme on a link, and dropping unclaimed
delivered roles.

**Not verified:** the section has never rendered in a browser and no profile has
been created — no session is mintable in this sandbox and the migration is still
unapplied.

### Phase 3 (2026-09-05): the sweep, and the page other people read

Two gaps closed. Records now recompute on their own, and there is somewhere a
stranger can read one.

**The sweep is a passenger on `/api/cron/due-date-notifications`, and it cannot
be anything else.** `/vercel.json` holds exactly two schedules and the Hobby
plan caps them at one a day — the weekly motivational nudges and the trial
sweep already ride that same route for the same reason, each saying so in a
comment. `runDeliveryReconcile` is the fourth step.

**There is deliberately NO completion hook**, and that is the finding rather
than a shortcut. A task reaches `done` through two divergent server paths (the
PATCH route, which does not set `completed_at`, and
`completeTaskWithCascade`, which does and cascades) whose only shared column is
`status`. Hooking recomputation onto completion would mean two hook points on
the hottest write path in the product — and would still miss the case that
needs it most: a release DATE passing, where no write happens at all. One sweep
covers both. A record appearing within a day is not a cost for a credential
nobody is waiting on.

**The sweep RECONCILES rather than only adding.** A reassigned or reopened
task, or a release date moved back into the future, makes an old record untrue,
and a derived table has to match its derivation. `planReconcile` is pure and
carries two guards, both because deleting somebody's credential is not
undoable: it only ever deletes within the releases it actually scanned, and it
deletes NOTHING when the scan was truncated (absence then means "not looked at",
not "no longer true"). Both mutation-tested.

**Records accrue for people who never opted in.** Deliberate, and it looks like
a bug until you see why: the profile controls who can SEE a record, not whether
it exists, so somebody opting in six months from now finds their real history
waiting rather than starting at zero.

**`/p/{slug}` shows COUNTS ONLY (founder call).** Section 10 allowed release
titles where the release is public, and the honest test for that turned out to
be a join through `press_kits.published_at` into a section's
`published_content` JSON — real work carrying the entire cross-team privacy
surface for very little more than the count already says. The count is the
product. Titles can be added later; a leak cannot be taken back.

**Only `visibility === 'public'` opens that page**, never `directory`, which
means findable by signed-in users and nothing more. That split is what the
Settings copy already promises, and `isPubliclyReadable` has its own test
because widening it to `isListed` is the tidy-up somebody would make by
mistake. Claimed and verified render as two lists under two headings; merging
them would put the record back at the mercy of self-reporting.

It reuses the dark-locked `.kit-island` palette rather than adding a fifth
near-identical CSS block — that class is now the shared public-artifact palette
rather than the press kit's alone. `noindex`, unlike a kit, which the founder
deliberately made findable.

**Not added to `sw-offline.js`'s `PUBLIC_ONLY_PREFIXES`**, on purpose: that
list only matters for paths that would otherwise match `APP_CHROME_PREFIXES`,
and anything in neither already falls through to the same offline page. `/k/`
and `/pack/` are absent for the same reason and are not bugs.

**Verified:** 2613 tests (14 new), lint at the exact 3-error / 79-warning
baseline, `next build` green by exit code in both flag states with `/auth`,
`/onboarding` and `/settings` still `○ Static` and `/p/[slug]` dynamic. Runtime
probes: flag off, `/api/directory/profile` 404s while the ungated control 401s;
both states render the 404 body for an unknown slug. Note `/p/{slug}` answers
that body with HTTP **200**, the same pre-existing `force-dynamic` quirk this
file already records for `/epk/`, `/credits/` and `/capture/` — the shell
flushes before the data resolves. Three reconcile mutations each killed their
own tests.

**Not verified:** the sweep has never run and the page has never rendered a
real profile — no database here. The cron's 500 in this sandbox is its
pre-existing unset-`CRON_SECRET` guard, which sits before the new step.

### Phase 4 (2026-09-05): search, filters, and the empty states

`/dashboard/directory` — a search field, three filters, result cards. The thing
the feature is named after.

**THE SEARCH DECISION: filter a fetched list, do not query for it.** There is no
text search anywhere in this repo — no `ilike`, no `to_tsvector`, no trigram
index — so this phase had to pick one. `GET /api/directory` returns the listed
profiles once and the browser filters them. Three reasons, in order of weight:

1. **The empty states demand it.** The brief requires that an empty result names
   what exists NEARBY. With the whole set in hand those counts are free;
   querying per filter needs a round trip per suggestion.
2. **It is what this codebase already does three times** — `lib/task-search.ts`,
   `lib/release-search.ts` and `useNotesStore`, which says so outright.
3. **`ILIKE` treats `_` as a wildcard**, which has already caused a real bug
   here: the credits route had to stop using it for email matching.

Bounded at 200 with a `truncated` flag, so the page is honest rather than
silently partial. The day that binds is where paging or a real index goes.

**Four things worth knowing:**

- **An empty query returns EVERYONE**, the same as `searchReleases` and the
  opposite of `searchTasks`. This bar filters a list already on screen, so an
  empty box means "no filter"; the activity palette appears on demand, so there
  it means "nothing asked for yet". Copying the wrong sibling would leave the
  directory blank on arrival. Mutation-tested.
- **Fallback counts are computed from the WHOLE set, never the filtered one.**
  From the filtered list every suggestion reads zero, and an empty state
  offering "0 more if you drop the city" is worse than one that says nothing.
  Mutation-tested, as is not suggesting you drop a filter you never set.
- **A card links to `/p/{slug}` only for a `public` profile.** Somebody listed
  as `directory` is findable here and their page is not open, so the link would
  be a 404. The card renders plain instead.
- **`applyDirectoryFilters` is generic over the entry shape** rather than taking
  it directly, so the page's cards keep their slug and visibility fields through
  the filter. The alternative was a cast at the call site, which is exactly
  where a wrong assumption stops being checked.

**The Manager gate** is a new boolean entitlement, `directory_search`, false on
Solo and true above, enforced on `GET /api/directory` only — listing stays free
on every tier, which is the founder's supply-free/demand-paid call. It resolves
through `getTeamAccessForUser`, which already carries the tier and is cached;
`getWorkspaceTier` is for the invite-redemption case where the actor is not who
pays. **Inert today** and a test pins that: every state a real team is in
(paid on a legacy plan, trial, comped, unknown) resolves to something other than
solo. If that test ever fails the gate has started biting real customers, which
is a decision rather than an accident. A gated team gets the page with a plain
line and an upgrade link, not a 404.

**Entry points, and the known gap.** The identity card's nav at `lg`+,
`lib/app-pages.ts` with keywords that are JOBS rather than the word "directory"
(find, hire, producer, engineer, designer, photographer), and
`lib/prefetch-routes.ts`. **No mobile tab** (founder call): the bar is at its
seven-slot ceiling and an eighth needs a different shape for it. So a phone
reaches this through the search surface until Phase 5's role gaps panel gives it
a better path in — which is the brief's own sequencing rather than an omission.

**Verified:** 2627 tests (14 new), lint at the exact 3-error / 79-warning
baseline, `next build` green by exit code in both flag states with `/auth`,
`/onboarding` and `/settings` still `○ Static`, and a runtime probe showing
`GET /api/directory` 404s with the exact flag body when off and 401s when on,
against an ungated control that 401s either way. Three search mutations each
killed their own tests.

**Not verified:** no search has ever returned a real person and no empty state
has rendered — no database and no session here. The plan-gate refusal has never
been triggered by a real team, and cannot be until Solo is sellable.

### Phase 5 (2026-09-05): the role gaps panel

The phase the brief is built around — section 8 calls it "the whole retention
mechanic". The rollout plan already knows which jobs a release needs, so the
plan writes the job posts and nobody seeds demand by hand. It is also, per the
Phase 4 founder call, **how the directory becomes reachable on a phone**: the
tab bar is at its seven-slot ceiling, so a link from the release the manager is
already looking at is the path in.

**Two things section 8 assumed that the code does not support as written**, the
same class of finding as Phase 1's verification rule:

1. **"Role tasks with nobody assigned" matches nothing, ever.** Template
   instantiation assigns EVERY task to the release owner, and
   `lib/task-owners-server.ts` already names the consequence: a row still
   sitting on the owner "is not evidence of anything — it is just the unmoved
   default". A panel keyed on unassigned would be permanently empty. **A gap is
   therefore a role task still sitting on the owner**, which is the same filter
   that module already trusts and is exactly the thing the panel means to
   surface: nobody has been brought in yet.
2. **"Pre-filtered to that city" has no source.** Nothing in the schema knows
   where a team is — the only `city` in the product is on `person_profiles`,
   which is the person being HIRED. The rows pre-filter **role and
   availability, not city**. Deriving a location from the manager's own profile
   would apply a guess to somebody else's search, and most managers are not
   listed at all.

**The design decision worth reading: two maps, not one.** `DELIVERY_TASK_ROLE`
answers "who did this?" and deliberately covers only steps where work ARRIVES.
A hiring gap is a different question, and the COMMISSIONING steps answer it
better because they come earlier — "Brief designer on cover art" is week 7,
"Cover art first draft delivered" is week 6, so briefing gives a week of warning
where delivery is telling them late. `HIRING_TASK_ROLE` holds those steps across
all three playbooks, and `roleNeededForTask` reads hiring first, then delivery,
so roles with no commissioning step (master engineer, videographer, digital
marketer) still surface at their delivery step, the earliest signal they have.

**THE TWO MAPS MUST STAY DISJOINT, and a test enforces it.** An earlier comment
here claimed the lookup ORDER was load-bearing; a mutation reversing it survived
every test, which is what proved the claim wrong — with disjoint maps the order
is unobservable. The disjointness is the real invariant, so that is what is
pinned. `*_plan_content_shoot` stays unmapped for the reason it is unmapped in
the delivery map too: a shoot is a photographer or a videographer depending on
the release, and a link cannot pre-filter to a role nothing in the row names.

**Four smaller decisions:**

- **A new `activitiesFooter` slot on `TasksPanel`**, at the end of the
  `space-y-3` stack inside the scroll body — below the buckets, scrolling with
  them. NOT `activitiesBanner`, a single slot with four claimants where the
  press kit prompt wins; NOT the desktop footer pill row, which is pinned,
  scarce and shared with Content and Press kit. A list of role rows is not a
  banner and should not fight one for space.
- **Dismissal is per RELEASE**, through `lib/persisted-state.ts` like the task
  buckets. Each release is a new hiring moment, so a dismissal on one must not
  silence the next. Capped at 50 ids; a dismissal that could not be written
  still closes the panel for the session.
- **Not coupled to the press kit.** Section 8 sequences this after a kit is
  published, which describes the journey rather than a precondition — gating on
  `NEXT_PUBLIC_FEATURE_PRESS_KITS` would hide the panel behind a different
  feature's switch.
- **Owner-only, and nothing renders unless there is something to say** (the
  `PostPlanKitPrompt` rule verbatim). Reassigning is the action this leads to,
  and offering it to a teammate who cannot take it is a control that fails on
  press.

**The directory now accepts the link.** `?role=…&availability=open` is read
ONCE into the initial filter state, validated against `DIRECTORY_ROLES` /
`PERSON_AVAILABILITIES`, never mirrored — keeping filters in sync with the URL
would make every keystroke fight a param nobody set. The page stays `○ Static`
because that read sits inside the existing Suspense boundary.

**Verified:** 2641 tests (14 new across `directory-roles.test.ts` and
`role-gaps.test.ts`), `eslint .` at 3 errors / **80** warnings against the
79-warning baseline — the one new finding is `RoleGapsPanel`'s localStorage
hydration effect, the documented React-19 `set-state-in-effect` downgrade,
matching `TasksPanel`'s own bucket-state effect in shape. `next build` green by
exit code in both flag states with `/auth`, `/onboarding`, `/settings` and
`/dashboard/directory` all still `○ Static` in each.

**Four mutations, and TWO GENUINELY SURVIVED — both were real test weaknesses
rather than failed applications, which is the part worth keeping.** Crediting a
task assigned to somebody other than the owner, and treating a done task as a
gap, each killed their own tests immediately. But "last wins instead of
earliest" survived because the fixture listed the LATE task first, so last-wins
accidentally picked the right one; the fixture is reordered with a comment
saying why. And reversing the map lookup order survived because the maps are
disjoint, which is what corrected the prose above. Both kill their tests now.
**Separately, remember Phase 1's lesson: confirm a mutation actually applied
before believing a survivor** — one there was a `sed` indentation miss.

**Not verified:** no panel has rendered and no gap has been computed from real
tasks. No database, no session, no route to app.urganize.app.

### Phase 6 (2026-09-05): instrumentation

The last phase in the brief, and the one that decides whether anybody can tell
if the directory is working. Two channels, split on a rule rather than by habit.

**PostHog for the funnel; a durable row for the one signal that drives a
decision.** The funnel questions — do people opt in, do managers search, does
the role gaps panel drive them there — are read in aggregate and can afford to
be a bit lossy. One question cannot: **which roles are managers asking for that
nobody has delivered.** That is the recruiting list, it has to be right every
week, and this app has already lost months of events to a content blocker once
(see "PostHog was never recording anything"). So it is written server-side, the
way `limit_hit` is: a `directory_role_wanted` row in `billing_events`, read back
by `/admin/directory`. **No migration** — that column is free text by design and
its existing `(workspace_id, type, created_at)` index is the access path.

**Six things worth knowing before editing this:**

1. **NO SEARCH TEXT LEAVES THE BROWSER, in either channel.** The search box takes
   a person's NAME, and somebody typing a name is making a private search.
   `parseDirectoryDemand` is an allowlist of exactly three fields — role,
   matched, source — so a future caller cannot widen the row by adding one, and
   a payload carrying a query, a city and an email comes back with the three.
   Mutation-tested: spreading the rest of the body through fails exactly that
   test. The analytics event follows the same rule and reports `has_query` as a
   boolean.
2. **The durable row is only written when there IS a role filter.** A search with
   no role says nothing about which job is short, which is the only question
   that row exists to answer. The analytics event fires either way, because
   "managers search but never by role" is itself worth knowing.
3. **One row per team per role per UTC day.** A manager comparing two designers
   runs the same filter a dozen times in a sitting, and a dozen rows say nothing
   one row does not. Deduped on the metadata role rather than the type alone, so
   looking for a designer and then an engineer is two signals. Anything
   unreadable answers "not today" and records — a duplicate row costs nothing, a
   lost first row loses the signal. Mutation-tested.
4. **Demand from the role gaps panel is kept apart from demand somebody typed.**
   The panel links with `from=role_gaps`, which rides into the row's `source`.
   Whether the rollout plan actually drives search is a different question from
   whether managers search at all, and folding the two together makes it
   unanswerable — the same reason the planner's review nudge reports `via_prompt`
   separately.
5. **SUPPLY IS PEOPLE, NEVER RECORDS.** Somebody who delivered artwork on four
   releases is one designer you can call, not four. `summarizeDirectory` counts
   distinct users per role for exactly this, and a table that says "four
   designers" when there is one would send the founder recruiting for the wrong
   job. Mutation-tested.
6. **The recruiting list needs DEMAND, not just absence.** A role nobody asked for
   is not a shortage, and listing every empty role would bury the two that
   matter. `recruit` is roles with unmet demand, worst first, tie-broken toward
   the role with nobody who has ever delivered it. Mutation-tested.

- **Result counts go to analytics bucketed** (`0`, `1-4`, `5-19`, `20+`). Zero is
  kept exact because zero is the whole signal; above that the difference between
  seven and nine answers nothing, and a raw count is one more way to fingerprint
  a small team.
- **The beacon is fire and forget and the route answers 202 whatever it makes of
  the payload**, including one it throws away. This is a report on somebody
  else's keystroke: there is nothing for a manager to do about a rejected one,
  and an error here would surface as a failure of the search they were actually
  running. It is debounced 600ms and deduped per settled filter, so typing
  "designer" reports once rather than eight times.
- **`/admin/directory`** is the founder's read: listed and with-a-record per role,
  wanted and unmet per role, how much of that came from the panel, and the
  recruiting list on top. Aggregated in TypeScript rather than SQL, the
  `/admin/urgans` call for the same reasons. **Not flag-gated** (the
  `/admin/teams` precedent) so it can be watched filling from day one, and its
  three reads report their table by name — a directory with no migration applied
  fails three different ways, and knowing which is the difference between a two
  minute fix and a hunt.
- **`directory_profile_listed` fires on opting IN, not on every save.** The save
  path reads visibility before the write and reports only the private-to-listed
  transition; every later edit is somebody already listed tidying their record.

**Verified:** 2665 tests (24 new across `directory-demand.test.ts` and
`directory-admin-summary.test.ts`), `eslint .` at 3 errors / **81** warnings
against the 80-warning baseline — the one new finding is the admin page's
fetch-on-mount gate effect, the documented React-19 `set-state-in-effect`
downgrade, matching `TeamsAdminPageClient` and `UrgansAdminPageClient`
byte-for-byte. `next build` green **by exit code** in both flag states with
`/auth`, `/onboarding`, `/settings`, `/dashboard/directory` and
`/admin/directory` all still `○ Static` in each. Runtime probes, rebuilding
between them: flag off, `POST /api/directory/demand` returns **404** with body
exactly `{"error":"Not found."}` while the ungated `/api/releases` **401**s;
flag on it **401**s. `/api/admin/directory` answers the same
unset-`ADMIN_EMAILS` 500 as the pre-existing `/api/admin/teams` under this
sandbox's env, checked side by side rather than assumed. **Four mutations, each
killing exactly its own test** (the privacy allowlist, records-not-people, the
recruiting filter, the dedupe fallback).

**Not verified:** no event has ever been captured and no row has ever been
written. No database, no session, no PostHog project reachable from here, and
`/admin/directory` has never rendered a real number. The dedupe's metadata
filter (`metadata->>role`) in particular has never run against real PostgREST.

**Phase 6 closes the brief's six phases.** Ranking — which the brief says to
revisit "then, and only then" — is deliberately not built: it wants real demand
rows to rank against, and there are none yet.

### First live report: a phone could not reach it, and "Add yourself" led nowhere (2026-09-06)

The founder, minutes after the flag went on: *"Add yourself is not working I'm
trying on mobile and I can't even find it on mobile it just showed your release
needs a digital marketer and that's the only way I found it."* Three separate
faults, and the first two were predicted in writing.

1. **A PHONE COULD NOT REACH THE DIRECTORY AT ALL**, which Phase 4 recorded as
   a known gap and closed on the founder's own answer, "search plus the Phase 5
   panel". That answer turned out to be half a path: the identity card carrying
   it is `lg:block`, and the page search that indexes it lives in `TasksPanel`'s
   mobile dock, which only renders on a SCOPED RELEASE. So with no release
   scoped there was no entry point, and the role gaps panel — the accident he
   describes — was the only way in.

   **It is a tab in the bottom bar now (founder call), and it fills that bar.**
   The right side holds three at most; a dual account already holds three there
   (Shows · Pitches · Press kits), so Directory takes that third slot for
   everybody EXCEPT a dual account. Presence therefore depends on ACCOUNT TYPE,
   which is fixed for a session and never shifts under a thumb — the rule
   Pitches itself follows, and different in kind from the URL-dependent Song tab
   that was removed for moving about. A dual account keeps the paths everyone
   had before this. The next surface that wants a slot is the one that has to
   build the overflow sheet the bar's own header calls for.

2. **"Add yourself" pushed a bare `/settings`.** The section is fifth of twelve
   in the Account tab, and a client-side push does not scroll to a hash the way
   a document load does — so on a phone the button appeared to do nothing, which
   is exactly how it was reported. It links to `/settings#directory` now, and
   the page scrolls to it. `DIRECTORY_SETTINGS_ANCHOR` lives in
   `lib/person-profile.ts` rather than beside the component, so the link and its
   target cannot drift and neither page pulls a whole settings section in for a
   string. No tab redirect is needed, unlike the `#teammates` precedent: Account
   is the default tab.

3. **A collision on a handle WE suggested failed the opt in**, found while
   reading rather than reported. On a first save there is no handle field on
   screen — you type a name and press "List me" — so "That handle is taken. Try
   another." named a thing the person never chose and could not change, on the
   one action the whole feature depends on. The insert is retried without a
   handle instead: the column is nullable, a profile with no handle is a valid
   profile, and they can pick one afterwards. A handle somebody TYPED still gets
   the honest refusal, because that one is theirs to change
   (`slugConflictIsOurs`, unit-tested).

**Verified:** 2685 tests (4 new), `eslint .` at the exact 3-error / 80-warning
baseline with zero new findings, and `next build` green by exit code in both
flag states with `/auth`, `/onboarding`, `/settings` and `/dashboard/directory`
all still `○ Static` — `/settings` in particular, since this added an effect to
it. **Not verified:** nothing has rendered on a phone from here, and the
collision retry has never run against a real database.

### Connecting the two sides: work requests (2026-09-06, flag-off)

Founder, once the directory was live and he had added and viewed a profile:
*"nothing happens from there how can Urganize now connect those two people"*.

**The brief never specified this step**, so the feature was built to a spec
that ended one move early. Two things were wrong, and the first was a plain
defect.

1. **"List me" set `visibility: 'directory'`** — findable, page NOT open. The
   in-app card links to `/p/{slug}` only for a `public` profile, and the card's
   payload carries neither `bio` nor `links`. So the DEFAULT opt-in state
   produced somebody a manager could find and had **no way to reach**: a name,
   a city, an availability label and some counts. **"List me" opens the page
   now** (founder call), and closing it again is one control below.
2. Even a public profile was reachable only through the person's own links, and
   only by leaving the app. Nothing was recorded, so nothing fed back.

**The connection is a reach-out inside Urganize** (founder call, chosen over a
mailto and over a team invite). It is a sanctioned scope expansion: it moves
"in-app inbox is v2" off the out-of-scope list for the second time, playlist
pitching having been the first. Behind
`NEXT_PUBLIC_FEATURE_DIRECTORY_REQUESTS`, default off — deliberately NOT the
directory's own flag, which is on in production with real people in it.

**Why not the other two, recorded so they are not re-litigated:** a team invite
costs a permanent seat, and Solo has two (the manager and the artist), so there
is literally no room for a freelancer hired for one release. A bare mailto
records nothing and leaves the directory a lookup table.

**Six things worth knowing before editing this:**

1. **THE RECIPIENT NEVER SEES THE RELEASE.** `release_id` is stored so a request
   can show on the SENDER's release and is absent from
   `RECIPIENT_REQUEST_FIELDS` — the `CURATOR_PITCH_COLUMNS` rule verbatim. An
   unannounced title must not reach somebody who is about to say no. The email
   carries no release either. Mutation-tested.
2. **`sender_name` and `sender_team` are denormalised** so the recipient's read
   path cannot touch `workspaces`, `releases` or `profiles` even by mistake.
   Written server-side, never accepted from the client, or a sender could forge
   who they are.
3. **Only the recipient moves a status, and only once.** `canAnswerWorkRequest`
   is the pure rule and the route is its only caller; the UPDATE is additionally
   conditional on `status = 'new'`, so two taps cannot both land — the row is
   the lock, the call the curator invite and the plan claim both make.
   Mutation-tested.
4. **One OPEN request per team per person per role**, by partial unique index,
   plus ten open requests per team. This is a cold-start marketplace and the
   failure mode is one manager approaching every designer at once, which would
   empty the directory of people faster than it fills. Answered requests do not
   count, so following up is never blocked, and the cap FAILS OPEN on an
   unreadable count like every other counter here. Mutation-tested.
5. **Neither side is behind the Manager gate** that `/api/directory` carries.
   Searching is Manager and up; being listed and answering are free on every
   tier, which is the supply-free/demand-paid rule. A Solo person who is listed
   has to be able to read their own inbox.
6. **THERE IS NO NEW ACCOUNT TYPE**, unlike pitching. Everybody in the directory
   is already a signed-in team-side user, and a curator-only account cannot opt
   in, so none of `blockCuratorAccount`'s containment machinery has an analogue
   here. That is most of why this is one table rather than four.

- **The inbox lives inside "Your directory record" in Settings**, not in its own
  nav entry: that is where somebody already manages being listed, it is
  reachable on a phone through the one route to Settings, and **the mobile bar
  is full** — an inbox most accounts never receive anything in should not be
  the thing that forces the overflow sheet. It renders nothing until there is
  something in it.
- **The email is what actually reaches a person.** Founder-note register and a
  "<name> via Urganize" From line, the assignment email's rules, for the same
  reason: this is one person approaching another. Both directions are best
  effort and never throw — the row is the durable record.
- **Not built, deliberately:** no threading (one ask, one answer; a conversation
  is the inbox the scope line warns about), no attachments or rates, no
  responsiveness ranking, and no team invite from an accepted request. That last
  one is the natural next step and is cheap on top of the existing invite routes.

**Verified:** 2712 tests (27 new), `eslint .` at 3 errors / **81** warnings
against the 80 baseline — the one new finding is `WorkRequestSheet`'s portal
mount guard, byte-identical in shape to `DeleteReleaseDialog`'s and
`ArchiveReleaseDialog`'s. `next build` green by exit code in both flag states
with `/auth`, `/onboarding`, `/settings` and `/dashboard/directory` still
`○ Static`. Runtime probes: requests off, both new routes **404** with body
exactly `{"error":"Not found."}` while `/api/directory` still **401**s — which
also proves the new flag is independent of the directory's; requests on, all
three **401**. The migration was applied to a scratch Postgres 16 and every
documented rule exercised with real rows: the duplicate-open refusal, asking
again after an answer, the note and status CHECKs, a deleted release leaving
the request with a null, a deleted recipient taking their requests, two SELECT
policies and no others, and RLS on.

**Not verified:** nothing has run against the production database or in a
browser. No request sent, no answer given, no email delivered.

**Activation:** apply `20260906120000_work_requests.sql`, set
`NEXT_PUBLIC_FEATURE_DIRECTORY_REQUESTS=true` with a deploy that rebuilds
`apps/web`, then changelog entry and version bump at the flip (the EPK
precedent).

### Closing the loop: contact on interest, and the sender's own view (2026-09-07)

Founder, after using the flow: *"if someone agrees to work or rejects where do
I see it?"*, then *"the email how can I reach him so we proceed to work it's an
Urganize email that sends it"*. Both were real holes rather than settings, and
the second is the one that made the whole feature stop at "yes". Same flag, no
migration, no new route.

**What was actually wrong, traced rather than guessed.** The From address on
every message is the verified sender on `send.urganize.app` — only the display
name becomes "&lt;name&gt; via Urganize" — and `EMAIL_REPLY_TO` points at an
Urganize mailbox, so Reply reached us. The answer email carried a name, a
decision and a one-line reply and **no way to reach anybody**, while its own
text claimed "Their contact details are on their profile" and linked the SEARCH
page: wrong twice, because that is not their profile and `person_profiles` has
no contact field at all. Separately, `GET …/requests?box=sent` had served the
sender's side since the day this was built and **nothing in the UI called it**,
so deleting the email deleted the answer.

**Five things worth knowing before editing this:**

1. **`revealsContact` is the consent model in one function, and it is the only
   thing that decides.** Answering *interested* IS the permission to be
   contacted; a pass and a still-waiting request reveal nothing. There is no
   second opt-in question after "I am interested", because a question nobody
   expects at that moment is one most people ignore, and the request then dies
   at yes. Mutation-tested.
2. **The reveal is computed at read time and stored nowhere.** No contact
   column exists on `work_requests` and a test asserts `SENDER_REQUEST_FIELDS`
   never grows one: a stored copy would outlive the consent that revealed it.
   It is also why the address lookup in the sent branch is FILTERED before it
   runs (a handful of `getUserById` calls, not one per row).
3. **`buildWorkRequestAnswerEmail` re-checks `interested` itself** rather than
   trusting its caller, so a future caller that forgets the rule still cannot
   leak an address onto a refusal.
4. **`composeReplyTo` is deliberately strict.** One plain mailbox: no display
   name, no comma list, no angle brackets, length capped, anything else falls
   back to the configured mailbox. The override comes from an account record
   rather than a form, but a mail header is not the place to discover that
   assumption was wrong — a comma adds a silent second recipient and a line
   break opens a header. Mutation-tested.
5. **Only a `public` record gets a profile link.** Somebody listed as
   `directory` is findable in-app and has no page, so linking their `/p/` URL
   would 404 — worse than linking nothing.

- **`SentRequestsList` has two mounts and one implementation.** In Settings it
  is the complete record and is gated on the flag ALONE, not on `profile` the
  way the inbox beside it is: nobody can ask somebody who is not listed, but a
  manager who does the asking need never have opted in. On the release it sits
  beside `RoleGapsPanel`, filtered to that release — closing the loop where the
  panel opened it, and the reason `release_id` is stored on the row at all.
  Both render nothing until there is something to say.
- **Verified:** 2729 tests (17 new), `eslint .` at the exact 3-error /
  81-warning baseline with **zero** new findings, `tsc --noEmit` clean apart
  from the documented pre-existing `confirmed-action.test.ts` errors, and
  `next build` green **by exit code** in both flag states with `/auth`,
  `/onboarding` and `/settings` still `○ Static` in each. Runtime probes,
  rebuilding between them: flag off, both requests routes **404** with body
  exactly `{"error":"Not found."}` while `/api/directory/profile` and
  `/api/releases` **401** — which also proves this flag is independent of the
  directory's own. Three mutations, each killing exactly its own test.
- **Not verified:** no email has been sent, no answer has round tripped, and
  neither list has rendered. No database, no session, no Resend key and no
  route to app.urganize.app from here. The manual pass at the flip is what
  settles it: send a request, answer it as the other account, and confirm the
  answer email lets you press Reply and reach them.
