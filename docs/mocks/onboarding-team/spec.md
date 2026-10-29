# Onboarding: account, team, first music (spec for the prototype)

Issue #854 · 29 Oct 2026 · Status: spec for mocks. No code until Oyin says yes.

Read with: `docs/mocks/team-tab/mock.html` (#853, Team tab), `docs/notes/2026-10-27-next-record.md`, `docs/notes/2026-10-24-lighter-rollouts.md`.

---

## 0. The flow in one picture

```
/auth or /onboarding
  S1  Create your account          (Google, or name + email + password)
  S2  Your team                    (join the team that invited you, or name your own)
  S3  Ask to be invited            (only if they tap "I'm joining a team" and no invite is waiting)
  S4  What are you working on?     (the Vercel-style screen: add music at any stage, inline)
  S5  Land on it + trial sheet     (rollout plan building, or the record in the making)
```

Today: up to 13 screens before the app (persona, 6 questions, artist import, preview, opt-in, account, paywall, welcome, invite). New: **4 screens for a new team, 2 for an invited teammate.** A new manager can be on their own plan in about 8 taps.

### Words used on screen

- **Team** for the shared space. Never "workspace" or "organization".
- **"Music you're working on"** on the S4 screen, not "project". Reason: the app already has Rollouts (the work) and records in the making (Catalogue). A third noun on the first screen would make people learn a word we then drop. The founder's "project" stays the internal name in this spec. If he wants "project" on screen, swap the S4 card title only.
- "Rollout" for the plan and the work, as everywhere else in the app.

---

## 1. Screens, in order

Phone first (375 wide). Desktop notes per screen. Look (updated 29 Oct after the design pass, see `design-direction.md` and `mock.html`):
- **One main button colour: spring green with ink text**, the same as /auth and the app's `Button`. Today's onboarding uses a cream pill, the odd one out. A disabled main button is a solid muted pill, not a see-through green one.
- **No card around the step on phone.** The question is the page heading (Young Serif at its real weight). Desktop keeps the two columns, with cards on the right like the reference.
- **No progress bar.** Four screens do not need one, and a bar with 13 segments was part of the problem.
- Logo top left and avatar top right, where the app puts them, so landing in the app does not jump. Back is a small text link, never a second pill. 16px inputs. Sentence case labels.
- **On phone, once the New music form is long, Add it stays pinned to the bottom of the screen** with the blocker and promise lines under it.

### S1 · Create your account

Route: `/onboarding` (signed out). `/auth` keeps log in and still hands a new email here with `?email=`.

Purpose: an account in under 30 seconds, nothing asked that the account does not need.

| Element | Copy |
|---|---|
| Heading | Create your account |
| Line | Plan every release with your team. It takes a minute. |
| Button 1 | Continue with Google |
| Divider | or with email |
| Field | Your name (autocomplete name) |
| Field | Email (prefilled from `?email=`) |
| Field | Password · hint under it: At least 8 characters. |
| Link (collapsed) | Have a referral code? → opens one field: Referral code (Optional) |
| Primary button | Create account |
| Footer | Already have an account? Log in |

States:
- Button disabled until name, email and an 8+ character password are in. The line beside it says what is missing (keep `describeNextBlocker`): "Add your name." / "Add your email." / "Use at least 8 characters."
- Working: button reads "Creating your account…". The `beforeunload` guard stays.
- Email already has an account: "This email already has an account. Log in instead." with Log in as a link that keeps the email.
- Closed sign-up, email not let in: the existing "Urganize is invite-only for now" notice (`InviteOnlyNotice`). A pending team invite for this email lets them in, as today.
- Email confirmation on (dormant today): the existing Check your inbox screen. The confirm link lands on S2. Nothing from the wizard rides in metadata any more, because nothing was asked before the account.
- Bad referral code: "That code doesn't look right. You can carry on without it." Never blocks.

Removed from this screen: "How did you hear about Urganize?" (moves to S5, see the cut list), the persona picker (moves to S2), the long subline about "lock in your rollout".

Desktop: centred card, 440 wide.

`/auth` fix while here: the heading is "Log into Urganize" on phones and "Sign up or log in" on desktop. Make it one line on both: **Log in or create your account**.

---

### S2 · Your team

Route: `/onboarding` (signed in, `profiles.onboarding_step < 2`).

Purpose: put the person in the right team before anything is made. This is the screen that fixes invited teammates landing in a team of their own.

The server answers one question first: is an invite waiting for this email? (pending `workspace_members` rows for the email, plus a token held in `user_metadata.pending_invite_token` or in this browser). Show a skeleton card while it loads; on bad data, after 6 seconds, show 2B with a quiet line "Couldn't check for invites. We'll keep looking." and keep checking in the background.

#### 2A · An invite is waiting

| Element | Copy |
|---|---|
| Heading | You're invited |
| Card | **{Team name}** · {Inviter name} invited you as {role}. · Primary button: **Join {Team name}** |
| More than one invite | One card per invite, newest first, each with its own Join button. |
| Under the cards | Want your own team too? **Create a team** (link → 2B form) |
| Account chip | {avatar} {email} · Not you? Log out |

Tap Join: button reads "Joining…", then go straight into the team (skip S4 for anyone who is not a Manager there; see S4 "Joined a team").
Expired invite card: "This invite has run out." · secondary button **Ask {Inviter} for a new one** (opens S3's WhatsApp message with the inviter's first name).

#### 2B · No invite: name your team

| Element | Copy |
|---|---|
| Heading | Set up your team |
| Line | Your team is everyone who works on your releases. You can invite them next. |
| Field label | Team name |
| Field | Prefilled: **{First name}'s Team** (selected, so typing replaces it). Placeholder if cleared: e.g. Northline Music |
| Hint | Your team sees this name, and so does anyone you invite. |
| Group label | Who is this team for? |
| Rows (one tap, required) | **Just me, I'm the artist** · **Artists I manage** · **A label** (three full-width rows with a radio dot, not chips: equal targets for the thumb) |
| Primary button | Create team. If they come back here from S4 after the team exists: heading "Your team", button "Save and continue", and the "joining someone's team" card is gone. |
| Card, under the form | I'm joining someone's team · Ask the owner to invite {email}. → S3 |
| Account chip | {avatar} {email} · Not you? Log out |

States and rules:
- Blank name on Create: use "{First name}'s Team". Never an error for blank. No first name (Google gave none): "My Team".
- Over 80 characters: "Keep it under 80 characters." (the existing server limit).
- **Names do not have to be unique.** Two teams can both be "Mavin". So there is no "name taken" state, by design. (Nothing in the schema makes names unique today, and invites carry the inviter's name, so people can tell teams apart.)
- No row picked: button disabled, line beside it: "Pick who the team is for."
- Desktop: two columns like the reference. Left: heading, line, account chip. Right: the form card, and under it a second card "I'm joining someone's team · Ask the owner to invite {email}." → S3. Phone shows the same card under the form.

---

### S3 · Ask to be invited

Shown only from "I'm joining someone's team" on 2B.

Purpose: get the owner to send the invite, and catch it the moment it lands, without the person doing anything.

| Element | Copy |
|---|---|
| Heading | Ask your team to invite you |
| Line | The team owner adds you from Team, then Invite. Send them this. |
| Primary button (first) | Send on WhatsApp (opens `https://wa.me/?text=` with the message) |
| Secondary button | Copy message |
| Message preview (read-only box), label "What they get" | Hi, please add me to our team on Urganize so I can see the plan. My email is {email}. In Urganize, go to Team, then Invite. |
| Email box, label "Your email" | {email} · Copy |
| Field (collapsed link) | Got an invite link? → field "Paste the link here" + button **Join** |
| Waiting row (under the actions, so nobody waits before asking) | {spinner} **Waiting for your invite** · This page updates by itself. You can close it and come back. |
| Footer links | Use a different email (logs out, back to /auth) · Create my own team instead (→ 2B) |

States:
- After WhatsApp or Copy: toast "Message ready. Send it, then come back here."
- **Invite arrives**: the ask disappears and the screen becomes "Your invite is here" · "{Inviter first name} added you. Join to see the plan and what's yours to do." with the 2A card (soft highlight, no sound) and "Not the right team? Create my own team instead". One green button on screen.
- Pasted link that is not an Urganize invite: "That isn't an invite link. Ask for a new one."
- Pasted link expired or used: "That link has run out. Ask the owner for a new one."
- Still waiting after 30 minutes on screen: the row reads "No invite yet. Send the message again?" with the WhatsApp button repeated. Checking slows to every 2 minutes.
- They close the app: next time they open Urganize with no team decision made, they come back to this screen (see routing).

Checking rule (data-light): ask the server every 20 seconds while the screen is visible, and once when the app comes back to the front. Stop while hidden.

---

### S4 · What are you working on?

Route: `/onboarding` (team decided, `onboarding_step = 2`). The Vercel-style screen. With zero music in the team, the "New music" card is already open, so this is one screen, not two.

Purpose: get the first piece of music in, at whatever stage it is, with the fewest answers the plan needs.

**Desktop layout** (the reference):

- Left column: "Nothing here yet." (heading) · "Add what you're working on in **[{Team name} ▾]**, or ask someone to invite you." · account chip ({avatar} {email} · Log out). The ▾ shows only when they are in 2 or more teams; otherwise the team name is plain text. "ask someone to invite you" links to S3.
- Right column, three cards stacked:
  1. **New music** · Any stage, even just an idea. (open, form below)
  2. **Bring in released music** · Type an artist's name. We pull in their releases. (opens the existing artist import, `OnboardingArtistImportStep`, as a sheet)
  3. **Invite your team** · They see what's theirs to do. (opens the invite sheet from the Team tab mock #853: Email, Role (Manager · Team member · Artist · Viewer), "Or copy an invite link". **No "What can they see?" here**: with no rollouts yet there is nothing to choose. One hint line instead: "They see everything in your team. You can limit them to chosen rollouts later, in Team.")

**Phone**: same order, one column. Heading block, then the three cards.

**The New music form** (inside card 1). **Stage comes first** (changed 29 Oct, from the design pass): the fields below depend on it, so asking it first means the form never reshapes under something already typed. Before a stage is picked, only the stage list shows.

| # | Label | Control | Default | Required |
|---|---|---|---|---|
| 1 | Where is it now? | **Five full-width rows on one line of work**, a dot per row joined by a thin line, each with one short line under the label: **Just an idea** (No date. Nothing recorded yet.) · **Recording** (In the studio.) · **Mixing or mastering** (Recorded, being finished.) · **Ready to release** (Mastered. Time to plan the release.) · **Already out** (Keep it going after release day.). After a tap the list folds into one line: "{stage}" with a green dot and **Change**. Rows, not chips: five chips of different lengths wrap into ragged lines on a phone and look ranked. | none | Yes |
| 2 | Artist | Text field. Placeholder: Artist name. Hint: "You, or the artist you manage." ("Your artist name." for Just me, I'm the artist.) The team's artists show as one-tap suggestions under it, including any just brought in with card 2. | Empty. **Never prefilled from the account name**: a stage name is rarely the name on the account. Only a saved profile artist name may prefill it. | Yes |
| 3 | What is it? | Chips: **Single** · **EP** · **Album** · **Not sure yet** ("Not sure yet" shows only for the first three stages) | Single | Yes (defaulted) |
| 4 | Name (optional) | Text field. Placeholder: Untitled. Hint: A working title is fine. | empty → "Untitled" | No |
| 5a | Release day (only for **Ready to release**) | **Two chips: No date yet · Pick a day.** Pick a day opens a date field (today or later). Replaces the date box plus checkbox: a greyed date box above a ticked box read as broken, and this matches 5b. | No date yet | Only once Pick a day is chosen |
| 5b | When did it come out? (only for **Already out**) | Chips: This week · This month · Earlier · Pick a day (opens a date field, today or earlier) | none | Yes, for Already out |

**Preview** (from the design pass): once a stage is picked, a small dashed box captioned "Preview" shows the music as a card (initials tile, title, artist and kind, stage and date). It fills in as they type. No catalogue number: none exists in the product.

Primary button: **Add it**. While working: "Adding…", then "Building your plan…" for rollouts.
Under the cards, small link: **Skip for now** → the app (Home shows the existing "Got a release coming?" card).

What the button promises, shown as one line under it, changing with the stage chip:
- Just an idea / Recording / Mixing or mastering: "We'll keep track of it while you make it. Plan the rollout when you're ready."
- Ready to release, with a day: "We'll build your rollout plan, week by week."
- Ready to release, no date yet: "We'll ask a few questions, then build your plan."
- Already out: "We'll build the plan for after the release."

States:
- Missing answers: button disabled, line under it, in this order: "Pick where it is now." / "Add the artist." / "Pick when it came out." / "Pick the day." / "Pick the day, or choose No date yet."
- Day in the past for Ready to release: the button stays disabled with "That day has passed.", and a line under the date: "That day has passed. Pick Already out instead?" with the stage as a link.
- Network failure: the button turns into **Try again**, with "No connection. Your answers are saved. Tap Try again." under it (answers kept in sessionStorage per user).
- Artist limit reached (`checkArtistAllowance` refuses): "Your plan holds {n} artists. Pick one you already have." with the suggestions open.

**Joined a team** (came from 2A or S3):
- Role Viewer, Artist, or Team member: skip S4. Land on the team's Home. First Home visit shows one line on top: "You're in {Team name}. Here's what's yours to do." (the existing first-session quiet rules apply).
- Role Manager (or owner/admin): show S4 with the heading "**{Team name}** has {n} rollouts." and the line "Add what you're working on in [{Team name} ▾], or open one of the team's rollouts." The New music card is closed, so they see the team's work first: a rollout list (title, artist · kind · date) on the right, above the cards. The bottom link reads "Go to Home", not "Skip for now". No trial sheet (the owner pays). If n is 0, show S4 as for a new team.

---

### S5 · Land on it, then the trial sheet

Where they land:
- **Rollout** (Ready to release, Already out): `/dashboard?release=<id>`, as today (`onboardingLandingPath`). With a date, the plan builds on the server (auto-plan) and the page shows it arriving. Without a date, the planner opens with type, artist and stage already answered (`markOnboardingPlannerHandoff`, `stageKnown`), so it asks only what's left.
- **Record in the making** (Just an idea, Recording, Mixing or mastering): the record page `/dashboard/artists/{artistId}/records/{recordId}` with its "Plan the rollout" button.

While the plan builds (rollouts with a date only, usually 10 to 40 seconds), one quiet row **above** the building state, so it is seen during the wait it is meant for:
"While you wait: how did you hear about Urganize?" · chips: Instagram · X · TikTok · A friend or artist · A manager or label · WhatsApp · Event · Google · Other. One tap, then the row says "Thanks." and goes. Never shown again. (Same options and storage as today's `heardFrom`.)

**Trial sheet** (the paywall, moved). Opens once, as a bottom sheet on phones and a centred dialog on desktop:
- Rollout with a date (Ready with a day, Already out): when the plan has finished building, or after 45 seconds, whichever is first.
- Rollout with no date: after they answer the planner's questions and the plan starts building. **Never over the planner's questions**, which would hide the thing they came for.
- Record in the making: 8 seconds after landing.
- Skipped S4: on the first Home visit.

| Element | Copy |
|---|---|
| Heading | Your 3-day trial is on |
| Line | Everything is open for your whole team. No card needed. |
| Plan card (recommended, from who the team is for, small "Fits you" stamp) | Just me → **Solo** ₦5,000/mo: "One artist, you and one other person." · "One rollout at a time." Artists I manage or A label → **Manager** ₦30,000/mo: "Up to 3 artists and 5 people." · "Three rollouts at a time." Read from `@urganize/pricing` (limits and price, including any intro price, the way the billing wall shows it), never typed in. No "Distribution included": for Manager it depends on how they pay. |
| Link | See all plans (opens the existing in-app plan picker) |
| Primary button | Keep going |
| Small line | We'll remind you before it ends. (A reminder exists: `runTrialEndingSweep` in the daily cron. Check it mails the team owner before relying on this line.) |

Rules:
- The sheet is closable (Keep going, the X, swipe down). It takes no money and starts nothing: the trial began when the team was made. The copy says "is on" because that is the truth. Today's "Start my free trial" button records nothing.
- **iPhone app**: no prices, no plan card, no "See all plans". Heading, line, Keep going, and "You can pick a plan later in Settings." (App Store rules, same as `isIOSApp()` on the billing wall.)
- Call-led plans (Label, 6-month, yearly) are not shown here; "See all plans" leads to them as today.
- A teammate who joined someone else's team never sees this sheet. The owner pays.

---

## 2. Routing rules (who sees which screen)

| Person | Goes to |
|---|---|
| New email from /auth or the homepage | S1 |
| Google sign-up, from /auth or S1 | `/auth/callback` → S2. Nothing to resume, because nothing was asked before the account. The sessionStorage resume marker and the 30-minute `FRESH_SIGNUP_WINDOW_MS` rule go away. |
| Opened an invite link (`/invite/accept?token=`) | The existing accept page. After joining: Home of that team. They never see S2 to S4 (Managers can add music from the app). |
| Signed in, `onboarding_step` < 2, no active membership in a team they don't own | S2 (or S3 if they chose "I'm joining" last time) |
| Signed in, `onboarding_step` = 2, owns the team | S4 |
| Finished, or `onboarding_completed` true | The app, never the wizard again |
| Old account that never finished onboarding (any age) | S2 on next sign-in, if it owns no rollouts and no records. Otherwise mark it finished and leave it alone. |
| Curator-only account | Never the wizard (unchanged) |
| Held account (closed sign-up, not approved) | `/locked?reason=not_approved`, as today |

Device Back: S4 → S2 (rename the team or switch to joining). S2 and S3 → nothing (no way back into account creation). Same `onboarding-history` approach as today.

---

## 3. What is written where

No schema change. Everything below uses tables and routes that exist, plus one new route that bundles calls so a phone on bad data makes one request, not four.

| Moment | Write | Through |
|---|---|---|
| S1 account | `auth.users`, `profiles` (name, `onboarding_step = 1`) | `useAuthStore.signup` / `loginWithGoogle` (unchanged) |
| S1 referral | remembered code, reported once the team exists | `rememberTypedReferralCode`, `reportReferralCode` (unchanged) |
| S2 check | read only: pending invites for this email, held token | **New** `GET /api/onboarding/team-state` → `{ ownTeam, memberships[], invites[] }`. Must not activate anything. |
| S2 Join | `workspace_members` row active | Existing `POST /api/invites/[token]` (`claimWorkspaceInvite`). For an email-only pending row with no token, mint one server side the way `resolve-by-email` does. |
| S2 Create team | `workspaces.name`, `profiles.onboarding_persona`, `profiles.role` (via `applyPersonaToRole`), `profiles.onboarding_step = 2` | Team: `ensureOwnedWorkspace` (exists, one per owner) then rename. Note `PATCH /api/workspace` is gated on two flags (`IDENTITY_PANEL` and `WORKSPACE`); onboarding needs the rename to work with both off, so either relax that gate for the owner or rename inside the new route. Persona: existing `PATCH /api/user/onboarding`. |
| S4 Add it, early stage | `artists` (lookup or create by slug in the team), `next_records` (title, kind or `unknown`, status `making`), one `record_songs` row at the picked stage (`idea`, `recording`, `mixing`), titled with the name for a single, "Song 1" otherwise | **New** `POST /api/onboarding/music` calling the existing server functions in `lib/next-records-server.ts`. Fires `record_started` with `source: onboarding`. |
| S4 Add it, ready or out | `releases` (`source: onboarding`, `metadata.origin = onboarding`), auto-plan when dated | Same new route calling the `POST /api/releases` logic: `releaseType`, `artistName`, `title`, `releaseDate` (or none), `plan: template`, `autoPlan: { readyToday: ['master'], whereStuck: [] }`. Already out with no exact day: date from `out_when` as planner v2 already derives it. |
| S4 Skip / S4 done / joined | `profiles.onboarding_completed = true`, `onboarding_step = 3` | Existing `PATCH /api/user/onboarding` |
| S5 heard from | `heardFrom` in user metadata | Existing `PATCH /api/user/onboarding` |
| S5 trial sheet | nothing (trial already stamped at team creation) | `localStorage` "seen" key per user, like the welcome key today |

`onboarding_step` meanings (column exists, free integer): 1 account made, 2 team decided, 3 done.

**One thing engineering must check before building S4 for joiners** (read from the code, not tested live): when a teammate creates a rollout by typing an artist name, `POST /api/releases` finds or makes the artist in the teammate's **own** team (`ensureOwnedWorkspace`), not the team they joined, and the rollout is owned by them. That rollout may not show for the team owner. S4 for a joined Manager must create the music in the team chosen in the ▾, or that Manager's first rollout disappears from the team. See open question 2.

---

## 4. Analytics

All client events through `captureAnalyticsEvent`, internal accounts excluded as usual. Every event carries `seconds_since_start` (from `onboarding_started`).

| Event | When | Properties |
|---|---|---|
| `onboarding_started` | First view of S1 or S2 (fix: `markOnboardingStarted` exists but **nothing calls it** today) | `entry: auth | homepage | invite | google` |
| `onboarding_account_created` | S1 done | `method: google | email`, `had_referral` |
| `onboarding_team_viewed` | S2 shown | `invites: n`, `state: invited | none | check_failed` |
| `onboarding_team_created` | Create team | `who_for`, `name_edited: bool` |
| `onboarding_team_joined` | Join tapped and done | `via: pending | link | waited | accept_page`, `role` |
| `onboarding_join_asked` | S3 WhatsApp or Copy | `channel: whatsapp | copy` |
| `onboarding_join_resolved` | Invite caught on S3 | `waited_seconds` |
| `onboarding_music_viewed` | S4 shown | `teams: n`, `joined: bool` |
| `onboarding_music_added` | Add it succeeded | `stage`, `kind`, `has_date`, `saved_as: record | rollout` |
| `onboarding_music_skipped` | Skip for now | |
| `onboarding_import_opened`, `onboarding_invite_opened` | S4 cards 2 and 3 | |
| `onboarding_trial_sheet_viewed` / `_closed` | S5 | `tier_shown`, `ios: bool`, `opened_plans: bool` |
| `onboarding_heard_from` | S5 row (exists) | `source` |

Server events kept: `onboarding_release_created`, `record_started` (add `source`).

Retire with the screens: `onboarding_preview_viewed`, `onboarding_optin_*`, `onboarding_paywall_*`, `onboarding_welcome_*`, `onboarding_invite_skipped`. Keep the names reserved so old dashboards still read.

### Success measures (week on week, Mon to Sun Lagos time)

Today's baselines are **not measured**: `onboarding_started` never fires, so there is no start time to count from. First week after launch is the baseline. Targets below are assumptions.

1. **Time to first music**: median seconds from `onboarding_started` to `onboarding_music_added`. Target under 2 minutes.
2. **Reach a plan**: share of new teams (not joiners) with a rollout that has tasks, or a record in the making, within 24 hours of the account. Target 70%.
3. **Invited people land in the right team**: share of accounts whose email had a pending invite at sign-up that are an active member of that team within 10 minutes, and own no rollout in a team of their own after 7 days. Target 95%.

Watch also: S2 → S4 drop-off, and the S3 wait (how many never get an invite).

---

## 5. What was cut, and why

Every question today, judged on one test: does the plan or the account need it right now?

| Today | Decision | Why |
|---|---|---|
| Who are you? (6 options) | **Kept, smaller**, on S2 as "Who is this team for?" (3 options) | It sets `profiles.role` (the artist-name gate needs it) and picks the plan shown on the trial sheet. "Producer / Beatmaker", "Artist team" and "Other" drop: producers are not who we sell to, and an artist's team member is almost always invited. |
| What are you working on? (type) | **Kept** on S4 as "What is it?", Single by default | The plan template needs it. Music Video ("Coming soon", disabled) is removed: never show an option nobody can pick. |
| Nothing planned yet | **Replaced** by "Just an idea" and "Skip for now" | "Nothing planned yet" made nothing. "Just an idea" makes a record they come back to, which is the 27 Oct retention bet. |
| Who is the artist? (import step) | **Moved** to an optional S4 card | Good feature, wrong place. As a step it stood between a person and their first plan. |
| Where does a rollout usually fall apart? | **Cut** | It is research for us, not value for them. Auto-plan runs fine with it empty (goal defaults to new listeners). Planner v2 asks what a win looks like, at the moment it matters. |
| What's already done? | **Cut**, replaced by the stage chip | "Ready to release" means the music is mastered. Planner v2 asks about cover art, video and distributor when it builds the plan. Asking twice was the old bug the planner hand-off had to patch. |
| Title, date, artist | **Kept**, title optional, date optional or not asked | Date blocked every early-stage person. Records need no date; rollouts take none (`template_pending` / planner pending exist). |
| Your first move (template guess + AI or scratch choice) | **Cut** | A guess shown before the real plan, which then differs. "Start from scratch" asks a power-user question of a first-timer; the blank plan stays in the in-app New rollout. |
| Your plan, week by week (preview) | **Cut** | The real plan is seconds away on S5. |
| Stay on top of your next move (push, email) | **Cut from onboarding** | Asked before there was anything to be told about. Both toggles start off anyway. Ask for push in the app when something is first assigned to them (separate issue, not in this spec). |
| How did you hear about Urganize? | **Moved** to the plan-building wait on S5 | Same data, asked while they wait instead of on the longest form. |
| Referral code | **Kept**, behind "Have a referral code?" | Partner codes pay commission; the field must exist, it need not be open. |
| Paywall (before the plan, "Start my free trial") | **Moved** to the S5 sheet, after the music exists, copy made true | Value before price. The button started nothing; the trial began with the team. |
| Welcome to Urganize | **Cut** | A screen whose only button is "Let's go". The landing is the welcome. |
| Bring your team in | **Moved** to an S4 card | Optional, and the invite gate still asks after the first plan. Sending an invite here fills a seat, so the gate never fires twice. |

---

## 6. Problems in today's onboarding, ranked by impact

From reading the code on 29 Oct. Marked **(verify)** where not tested live.

1. **Thirteen screens before the app.** Persona, six questions, artist import, preview, opt-in, account, paywall, welcome, invite. Nothing is saved until the account step near the end, so anyone who leaves on screen 9 leaves with nothing. (`lib/onboarding-steps.ts`)
2. **Invited people end up in their own team.** Onboarding has no "join a team" path. A teammate told "get on Urganize" who signs up from the homepage walks the whole wizard and makes a rollout. Their pending invite is activated silently in the background, but the app picks their primary team as the one they own once they own a rollout (`resolveWorkspaceAccessContext`, the 23 Jul primary rule), so they land in an empty team of their own instead of their manager's. (verify)
3. **A release day is required.** The manager who is still recording, the person the 27 Oct "next record" bet is for, can only pick "Nothing planned yet", which makes nothing.
4. **Teams are named after the email.** Every team starts as "{email handle}'s Team" (for example "luckydio10's Team") and onboarding never asks. That name shows in invites and at the top of the app.
5. **We can't measure onboarding.** `markOnboardingStarted` has no caller, so `onboarding_started` never fires and time-to-first-rollout cannot be computed. The six question steps have no view or answer events, so drop-off per step is invisible.
6. **The paywall comes before the plan and its button is not true.** "Start my free trial" records nothing (`handleStartTrial`); the 3-day clock started when the team was made.
7. **A teammate's rollout may not reach the team.** Typing an artist name makes the artist in the teammate's own team (`POST /api/releases` → `ensureOwnedWorkspace`), so the owner may never see it. (verify)
8. **Google sign-up is fragile.** It depends on a sessionStorage marker surviving the round trip (fails in some private modes, leaving a signed-in account with no rollout), the Google button is disabled until every question is answered, and `?setup=1` only catches accounts under 30 minutes old.
9. **No way to switch teams.** Someone in two teams sees one, picked by a hidden rule. The ▾ on S4 is the first place this shows; a team switcher for the app is out of scope here but now needed.
10. **Copy.** "Welcome aboard" and "A few questions and your first rollout is ready" on every step; "Create account & rollout"; "Give me AI recommendations / I prefer to start from scratch"; `/auth` says different things on phone and desktop; the invite step points at "Settings → Teammates", which the Team tab (#853) replaces.
11. **Opt-in asks for push before the account exists**, when there is nothing to notify about.
12. **Two plans.** The preview and "Your first move" show a template guess; auto-plan then builds a different real plan.
13. **The phone account step is a long form**: Google, name, email, password, referral, heard-from select, in one card.
14. **The Team tab mock (#853) says "Workspace"** ("People / Workspace" tabs, "Workspace name", "Hand the workspace to someone else"). That breaks the Team-only word decision. Suggest "People / Settings" and "Team name". Raise on #853.
15. **The record page depends on `NEXT_PUBLIC_FEATURE_ARTIST_PAGE`** (per the next-record note). If that flag is off in production, landing an early-stage person on their record would fail. Check before build. (verify)

---

## 7. Self-critique: two passes as a tired Lagos manager on a phone, bad data

**Pass 1 (cut):**
- Had a separate "New music" screen after the Vercel screen. Merged: the card opens inline when the team has nothing. One screen fewer.
- Had a progress bar. Removed: 4 screens, and the bar made 13 look normal.
- Had "Team name" required. Now prefilled and blank is fine. Most people will tap Create without typing.
- Had the WhatsApp ask before checking for an invite. Now the server checks first, so most invited people see Join and never type anything.
- Had push opt-in on S5. Cut: one ask at a time, and the trial sheet is already there.

**Pass 2 (bad data, one hand):**
- Four calls to save early-stage music (artist, record, song, profile) would fail halfway on 3G. Bundled into one route.
- Polling every 5 seconds on S3 would eat data. Now 20 seconds, only while visible, slowing after 30 minutes.
- The trial sheet on top of a plan still loading would hide the thing they came for. It now waits for the plan or 45 seconds.
- "Mixing or mastering" stays one chip: two chips for one step in the work is a choice nobody needs to make.
- "Already out" asked for an exact day. Now "This week / This month / Earlier" first; the exact day is optional.

**Pass 3 (the clickable prototype, 29 Oct):**
- The artist field filled itself with the account name ("Kemi Bello") when "Just me" was picked. A stage name is rarely the legal name, so a wrong artist would be saved with one tap. Removed.
- "Pick a day" with no day, and a day already gone, both let Add it through. Both now block and say why.
- On a phone, Add it sat a scroll below the fold once the stage was picked. Now pinned to the bottom of the screen.
- The waiting spinner sat above the WhatsApp button, so the screen said "waiting" before anyone was asked. Moved under the actions.
- The trial sheet opened over the planner's "When do you want it out?" question. It now waits for the answer.
- The invite sheet asked "What can they see?" when the team has no rollouts. Removed for onboarding.
- The preview said "URG·001 · How it shows on Home". No such number exists, and a record shows under the artist. Now just "Preview", and only after a stage is picked.
- Added the states the prototype was missing: email already used, invite-only, two invites with one run out, couldn't check for invites, still waiting after 30 minutes, no connection, joined as a Manager.

What still bothers me: S2's "Who is this team for?" is one more required tap. It earns it only because it sets the role and the plan on the trial sheet. If the founder is happy to recommend Manager to everyone, it can go and S2 becomes a single button.

---

## 8. Open questions for Oyin (3)

1. **Music that is not finished yet: save it as a record in the making, not a rollout?**
   Recommended: **yes.** On 27 Oct records were kept out of `releases` so rollout counts, the Solo one-rollout limit and the scoreboard stay true. The person sees one "New music" form either way; "Just an idea", "Recording" and "Mixing or mastering" become a record with a "Plan the rollout" button, and "Ready" or "Already out" become a rollout. No new tables.

2. **When a Manager who joined someone's team adds music, does it belong to that team?**
   Recommended: **yes, always the team picked in the ▾.** Today it may land in their own empty team (problem 7). Fixing it is a server change in how a new rollout picks its team, so it needs your yes before build. Team members, Artists and Viewers skip S4 and go to Home.

3. **The card on S4 says "New music", not "New project". Keep it?**
   Recommended: **yes, "New music".** The app already has Rollouts (the work) and records in the making (Catalogue). "Project" would be a third word on the very first screen, then never seen again in the app. The prototype's Card control swaps the label so you can compare both.

Settled in this spec, not asked (say so if you disagree): the trial sheet can be closed. The trial needs no card and is already running, so a sheet you can't close only blocks the plan they just made, and the billing wall already asks when the trial runs out.
