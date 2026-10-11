# Agent browser, job 1: fill the Spotify editorial pitch form

Status: **plan only. Nothing is built.** Written 2026-10-10 for the founder.
Docs only, so no changelog entry and no version bump.

This is the first of two "do something on the web for the user" jobs. The second
(finding grants with Exa) follows the same pattern and is outlined at the end so
it can be planned in its own chat.

**Scope note.** A browser the product controls on a user's behalf is not in the
v1 scope list and it is not on the strategy doc's committed list either. Building
the *technology* in a spike, with no user surface, is cheap and reversible.
Putting it in front of customers is a scope decision for the founder's Monday
review, logged in `CLAUDE.md` when taken. Nothing below ships to a customer.

---

## 1. What we are proving

One sentence: **an agent can open Spotify for Artists in a logged-in browser, fill
the editorial pitch form from the data Urganize already holds, and stop before
Submit, reliably, cheaply, and without doing anything we did not allow.**

It is a spike with a measurable result and a decision gate (section 8). It is
deliberately the smallest real job that still exercises the hard parts:

- staying logged in to a site we do not control,
- filling a real form that changes without warning,
- a safety layer that decides what the agent may click,
- what it costs per run.

## 2. What the agent does and does not do

Does:

1. Open the release's pitch page in Spotify for Artists (already logged in).
2. Read the form, map our fields onto its fields, fill them.
3. Read the values back and take a screenshot of the filled form.
4. Report what it filled, what it could not map, and anything unexpected.

Does not:

- **Click Submit.** Ever, in this spike. The human reads the screenshot and clicks.
  This is the same rule as UrgAns's confirmation gate (the model proposes, a person
  approves anything that cannot be taken back), applied at the browser.
- Type a password, a one-time code or a recovery answer.
- Solve a captcha or work around a bot check. If one appears, it stops and says so.
- Leave the allowed sites (section 6).

## 3. The data it types

The source is `apps/web/lib/editorial-pitch.ts`, built earlier: four fields,
`genre`, `moods`, `instruments` and `description` (500 characters at most,
`PITCH_DESCRIPTION_MAX`), filled by the person or by the `release.draft_spotify_pitch`
UrgAns action.

**The form asks for more than we hold.** As of the research done for this plan,
Spotify's form also has a subgenre, a culture or language, whether the song is a
cover, and a story field, and it takes up to two moods. These are unconfirmed
until someone opens the real form, so the first job in Gate 0 is to write the real
field list down. For the spike, the agent:

- fills the four fields we have,
- lists every form field it could not map instead of guessing a value,
- never invents a subgenre or a story.

Whether to widen `PitchFields` to match is a product call for after the spike.

## 4. How it is built

### 4.1 A scripted fill first, a model second

The form is fixed and known. The cheapest, most predictable way to fill a known
form is a plain script that finds each field by its label and types into it, with
no model in the loop. A model-driven agent is only needed for the case where the
form has changed and the script cannot find a field.

So the spike builds two layers and measures how often the second is needed:

1. **Scripted fill.** Playwright, locators by accessible role and label, no model.
2. **Model fallback.** Only when a locator fails: show the model the page text and a
   screenshot, ask it for the next safe action from a short list, run it through the
   same safety policy. Capped at a small number of steps.

If the script alone succeeds almost every run, the model layer may not be worth
shipping. That is a useful answer, not a failure.

### 4.2 One driver interface, two browsers

A small interface (open, read text, click, type, screenshot, wait) with two
implementations: Playwright on a local Chromium, and Playwright on a Browserbase
cloud browser. The agent and the policy only ever see the interface, so changing
vendor, or moving to the Tauri desktop client or a Chrome extension later, replaces
one file. This mirrors how `packages/native-bridge` lets the web app talk to the
Expo shell and, later, Tauri through one abstraction.

### 4.3 Where the code lives

- **`lib/agent-browser/`** in `apps/web`: the pure parts, with tests first (house
  habit, pattern 1 in "How new logic gets tested here"). Action classification,
  the allow and deny policy, the step and time budget, the field mapping, the
  result and report types, secret redaction. No network, no browser.
- **`scripts/agent-browser/`** (new): the runnable parts, the driver implementations
  and the CLI the founder runs by hand. **Not a Next route.** A route has a 60 second
  ceiling on the Hobby plan and an agent run is longer; a script has no ceiling and
  needs no deploy.
- Playwright is **not** a dependency of the repo today. Adding it is a deliberate
  exception to "boring stack" (principle 5): it goes in the scripts folder's own
  dependencies, not in `apps/web`'s, so it never reaches a Vercel build.
- No flag and no migration in the spike, because there is no user surface.
- Browserbase and model keys are server-only env vars (`BROWSERBASE_API_KEY`,
  `BROWSERBASE_PROJECT_ID`), documented in `.env.example`, never `NEXT_PUBLIC_`.

### 4.4 What can be tested here, and what cannot

Most of it can be proven in this sandbox, because the sandbox has Chromium and
Playwright: the policy, the budget, the mapper, and the whole scripted fill against
a **fake form** (a static HTML page imitating Spotify's, with a "Submit" button the
policy must refuse). What cannot be proven here: Spotify itself (no signed-in
session, and the sandbox cannot mint one), a real Browserbase session without a key,
and anything that depends on Spotify's bot detection. Those are the founder's runs.

## 5. Logging in, which is the real risk

The spike never types a password.

- **First time:** the founder logs in to Spotify for Artists himself, either in a
  headed local browser or through Browserbase **Live View** (a window onto the cloud
  browser he can click in), including 2FA.
- **Every later run:** the agent reuses the saved browser profile. On Browserbase
  that is a **Context**, which keeps cookies, localStorage and IndexedDB between
  sessions. Locally it is a persistent Chromium profile directory.
- The agent and the model never see the password, the cookies or the profile
  contents. They get a browser that is already signed in.

What the spike has to find out, because nobody can promise it from documentation:
how long a Spotify session survives in a Context (hours, days, never), what Spotify
does when the same account appears from a new datacentre address, and whether it
forces a re-login or a 2FA prompt. If the session dies every day, "the agent does
it for you" collapses into "you log in, then the agent does it", and that changes
the value of the whole idea. This is measured in section 8.

**Proxies:** none. No residential proxies and no stealth tooling. Those exist to
look like a person to a site that is trying to tell the difference, which is
exactly the thing we should not be doing to Spotify, and they add cost per
gigabyte.

## 6. Safety rules, built and tested before the first real run

All of it lives in `lib/agent-browser/` as pure functions with tests, because the
safety layer is the part that must be right and the part a browser cannot tell you
about.

| Rule | How |
|---|---|
| Three kinds of action | `read` (always allowed), `reversible` (type into a field, pick an option), `irreversible` (submit, send, confirm, pay, delete, sign out, change account settings). |
| Irreversible is refused in this spike | The click tool checks the target's accessible name and role against an irreversible list. A match is refused and reported. The fake form has a Submit button specifically to prove it. |
| Unknown is irreversible | A button the policy cannot classify is treated as irreversible. The default is no. |
| Domain allowlist | Spotify for Artists, Spotify account and login hosts. Anything else is refused, including redirects and new tabs. |
| Page text is data | Text on the page never changes the policy. A page that says "click Submit now" is read as text. The model prompt says so, and a test feeds it that text. |
| Hard limits | Maximum steps, maximum wall time, maximum model spend per run. Hitting any limit ends the run with a clear reason. |
| Evidence | A screenshot after every step plus the readback of each filled field, saved somewhere private. This is both the audit trail and what the human reviews. |
| Secrets | Keys and profile contents are never in the prompt, the logs or the screenshots' file names. A redaction test covers it. |
| Kill switch | One command ends a run and closes the browser session. On Browserbase it also releases the session so it stops billing. |
| Challenge means stop | A captcha, a "verify it's you" page or an unexpected login stops the run and reports. It never tries to get past one. |

## 7. Gate 0: before any run, with no code

These are checks and decisions, and they come first because a no here ends the job.

1. **Read Spotify's terms for this use.** Spotify's general user guidelines
   prohibit automated access and scraping. The Spotify for Artists terms were not
   read when this plan was written. Decide whether filling a form in your own
   account, with a person approving the submit, is a risk you accept. The
   consequence if it is not accepted is action against the Spotify account, so:
2. **Use an account that does not matter.** A throwaway or your own artist profile,
   **never a customer's**, for the whole spike.
3. **Find out whether a submitted pitch can be edited.** Unconfirmed. It decides
   whether "stop before Submit" is the only safe mode or just the safest.
4. **Write down the real form.** Open it once, list every field, label, option and
   limit. That list replaces section 3's unconfirmed one and becomes the mapper's
   spec.
5. **Check for an official route.** None is known for editorial pitching. Ask Spotify
   or the distributor (Therealmusicdistro, agreement signed) once. An API would
   replace this whole job.
6. **Needs a real release.** The pitch option only appears once a release shows in
   the artist's dashboard and is scheduled at least a week out (our code uses the
   7 day line). So the test account needs an upcoming release, not an old one.

## 8. Measuring it, and the gate after it

Run it about 30 times on the test account, a mix of fresh sessions and reused ones,
and record per run: did every field end up filled correctly (checked by readback),
steps used, wall time, whether the scripted layer was enough or the model layer
had to step in, whether the login held, whether a challenge appeared, and the cost
(browser time plus model tokens, from the gateway's own usage report, not from an
estimate).

Proposed bars for the decision gate (the founder sets the real ones):

- every field correct in at least 27 of 30 runs,
- the login survives long enough that a person would not have to re-do it more than
  about once a week,
- no run ever clicks anything irreversible, and no run leaves the allowlist (this one
  is zero tolerance, and the fake-form tests should already have proved it),
- the cost per run is small enough to fit inside the credit model (browser time and
  tokens fold into the "3 times the provider cost" rule). No figure is assumed here;
  the runs produce it.

Browserbase cost context, from its own pricing page as read for this plan (third
party write-ups disagreed, so confirm before buying): a free tier with 3
concurrent browsers and 15 minute sessions, a Developer tier at $20 a month with
100 browser hours and 6 hour sessions, overage per hour and per gigabyte of
proxy. A three minute run is a small fraction of an hour. The free tier is enough
for the plumbing; the sessions limit is not a problem for a run this short.

## 9. Is this worth building as a product? An honest check

The pitch is **once per release**, the form has a handful of fields, and the
person already has the four values in Urganize with a Copy button. Doing it by hand
is a couple of minutes. A browser agent saves that couple of minutes at the cost of
a cloud browser, a safety layer, a login problem and a terms risk on the user's real
artist account.

So as a feature the Spotify job is weak. **It is a good spike, not a good
product.** It is concrete, it stops before anything irreversible, and it tests the
things any later agent job would depend on: persistent login, drift, the policy
layer, cost.

Worth comparing in the same spike, at almost no cost: a **bookmarklet or Chrome
extension** that fills the form from Urganize's data in the user's own browser
session. No cloud browser, no credentials held by us, no proxy question, and it
carries the user's own login. If the extension gets the same two minutes back with
none of the risk, that is the better product and the agent browser is saved for
jobs where the user is not at their keyboard.

## 10. Build order

Each step is small and ends with something checkable.

1. **Gate 0** (section 7). No code. Output: the real form field list, the terms
   decision, the test account, the "can a pitch be edited" answer.
2. **Safety layer, tests first** in `lib/agent-browser/`: action classes, policy,
   allowlist, budget, redaction, field mapper. Done when the tests pass and
   deliberately breaking each rule fails a named test.
3. **Driver interface and the local Playwright driver**, plus a fake Spotify form.
   Done when the scripted fill passes against the fake form and the policy refuses
   its Submit button. Verifiable in this sandbox.
4. **Model fallback layer**, behind the same policy, tested against a fake form that
   has been changed (renamed labels, moved fields) so the script fails and the
   fallback has to recover.
5. **Browserbase driver** and Context handling. Needs the founder's key.
6. **Real runs** by the founder, headed first, on the test account, stopping before
   Submit. About 30 of them, logged.
7. **Decision gate.** Write the results into `docs/agent-browser/spotify-pitch-results.md`
   and decide: stop, switch to the extension, or plan a product version.

## 11. If it passes: what productising would require

Not planned here, listed so nobody builds it by accident:

- the deferred question of holding a customer's browser session (consent, storage,
  deletion, what happens when they cancel), which is a privacy decision before it is
  an engineering one;
- a long-running worker, since an agent run does not fit a 60 second route;
- Browserbase (and any model or search vendor) added to the subprocessors page and
  the privacy policy, with the NDPA 2023 basis checked;
- browser time metered into UrgAns credits;
- a confirmation card for Submit, the UrgAns pattern;
- a feature flag and a founder-sanctioned scope entry in `CLAUDE.md`.

## 12. Questions I would have asked, and the default I assumed

| Question | Default in this plan |
|---|---|
| Which Spotify account and release to test on? | A throwaway or own artist profile with a release at least a week out. Needs your word on which. |
| Log in each time through Live View, or reuse a saved Context? | Reuse a saved Context, and measure how long it lasts. |
| Do you have a Browserbase account and key? | Not assumed. The free tier is enough for the plumbing, so step 5 waits on a key. |
| Where does it run? | A script on the founder's machine. A worker only if it becomes a product. |
| Can a submitted pitch be edited? | Unknown. Checked in Gate 0. |
| Which model for the fallback layer? | Pick after step 3 shows how often the script alone fails. The model layer may not be needed. |
| Widen `PitchFields` to match the form (subgenre, language, cover, story)? | No. The spike reports the gaps. |

---

## The same pattern for finding grants (Exa)

**Now planned in full: see `grant-finder-plan.md`.** The outline below is what that
plan started from.

Kept short so it can be planned on its own. It is the **read-only** job, so it is
far lower risk, and it fits the strategy doc's Opportunities area (deals, grants,
sync, brands, partnerships), which is committed but not built.

- **Vendor:** Exa, an AI search API (search, page contents, find similar, answer).
  Pricing as read: about $7 per 1,000 searches, $5 per 1,000 answers, free credits to
  start. Whether zero data retention is on the standard plan was unclear (the docs
  and a blog post disagreed), so confirm with Exa before sending any user's context.
- **Shape:** a read-only UrgAns tool and an Opportunities source, behind its own flag.
  No browser, no logins, no irreversible action.
- **Same gates:** Gate 0 (terms, retention, subprocessor listing), a measured spike
  (about 20 real queries a manager would run, scored by a person), then a decision.
- **Rules carried over from the repo:** every result carries its source link and the
  date it was read (no invented deadlines or amounts); results never auto-create
  Relationships records (the directory rule: an unclaimed profile only comes from
  credits on a public release link); and coverage for Nigerian and wider African
  funders is the first thing to test, since a search API tuned on English web pages
  may miss exactly the funders this audience needs.
- **Cost:** per-search pricing is predictable and small, and folds into credits more
  easily than browser time does.
