# A docs-only merge no longer costs four deployments (2026-09-08)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The follow-up the section above deferred, and the one that actually reduces the
burn rather than reporting it. `scripts/vercel-ignore-build.sh` is the Ignored
Build Step for both projects: it **skips a build only when every changed file is
markdown**, and hands the decision to `turbo-ignore` in every other case.

**Read the exit convention before editing it, because it is inverted from
instinct: EXIT 0 SKIPS THE BUILD, EXIT 1 BUILDS IT.** Getting that backwards
stops every deploy on both projects, which is worse than the problem being
solved. It is also why every uncertainty in the script ends in a build.

**Eight things worth knowing:**

1. **IT GOES IN THE PER-PROJECT DASHBOARD FIELD, NEVER IN `vercel.json`.**
   `/vercel.json` is read by BOTH projects (both have Root Directory `.`), so a
   single `ignoreCommand` there cannot pass a different workspace name to each —
   the two projects would filter on the same app and one of them would stop
   deploying its own changes. Settings → Build and Deployment → Ignored Build
   Step, per project:
   `bash scripts/vercel-ignore-build.sh @urganize/web` on `urganize`, and
   `bash scripts/vercel-ignore-build.sh @urganize/homepage` on
   `the-urganization`. **CORRECTED TWICE. First, within hours of this section
   being written, by the founder opening the field: it POPULATES that field
   rather than replacing anything, because the field was EMPTY on both projects
   and always had been.** This item said it "replaces the bare `npx turbo-ignore
   @urganize/<app>` that field holds today"; two other places in this file
   asserted the same thing as fact (the Hosting bullet and the Deploy
   Configuration bullet, both now corrected), and every one of them was wrong
   for as long as it existed. **Then again on 2026-09-11: `the-urganization` now
   HAS something in that field and `urganize` still does not** — measured from
   the commit statuses on #579 and #582, with the full evidence under Hosting.
   So on the marketing project this genuinely does replace whatever is there,
   and the recommended order below (install on `urganize` first) was not the
   order it happened in. Read the existing value out of the dashboard before
   overwriting it. That settles what point (9) under the rate limit
   left open — **a docs-only merge promotes the app not because a gate leaks but
   because there has never been a gate** — and it retires the alternative that
   file was carrying, that `turbo-ignore` was populated and failing open in
   Vercel's shallow clone. Nothing about this script changes; what changes is
   that installing it is the first thing ever to sit in that field, so there is
   no prior behaviour to preserve and nothing to compare a regression against.
2. **THE BASE IS THE LAST DEPLOYED COMMIT, and that is the detail that stops a
   skip stranding code.** A code commit whose deploy failed, followed by a docs
   commit, looks docs-only against `HEAD^` — so the skip would leave that code
   undeployed. Against `VERCEL_GIT_PREVIOUS_SHA` it does not: the code files are
   still in the diff, so it builds. `HEAD^` is the fallback when that variable
   is absent or names a commit the checkout does not have (shallow clone, force
   push); the stranding risk is real there and bounded, because a Vercel build
   deploys the branch TIP rather than one commit, so the next non-docs merge
   ships whatever accumulated. `/api/version` is how you notice meanwhile.
3. **`--no-renames` on the diff is load-bearing.** With rename detection on,
   moving `a.ts` to `b.md` reports only `b.md`, which reads as a docs-only
   change while a real source file was deleted. Without it, both paths appear.
4. **The pattern is anchored** (`\.md$`, case-insensitive), so `lib/x.md.ts` is
   code. A path git had to quote (spaces, non-ASCII) ends in a quote character
   rather than `.md` and so fails toward building, which is the right direction.
5. **An empty changed-file list delegates rather than skipping.** Vacuously
   "all markdown" is true of nothing, and an empty diff is far more likely a
   wrong base than a genuinely empty commit.
6. **A MARKDOWN-ONLY SKIP IS SAFE, and it was verified rather than assumed.**
   Nothing in either app reads a `.md` file at build time or run time: no `.md`
   imports under `apps/*/app` or `apps/*/lib`, and the only fs read in shipped
   code is `lib/recap-fonts.ts` loading TTF binaries. Two markdown files ARE
   sources of truth (`lib/release-templates/single-v0.3.md`,
   `lib/capture-playbook/capture-v0.1.md`) but each is encoded into a sibling
   `.ts` that is what ships, and the only thing reading the markdown is a
   vitest test — and tests are not run by the Vercel build.
7. ~~**A root-level docs edit is not exempt from turbo-ignore.**~~ **WRONG, AND
   THE ATTRIBUTION MATTERS MORE THAN THE FACT — corrected 2026-09-08, measured
   two independent ways.** This item said `CLAUDE.md` "belongs to no package,
   and turbo treats a file outside every package as a global change, so
   `turbo-ignore` correctly answers 'build' for a CLAUDE.md-only commit. That is
   the whole 84-deployments-a-day mechanism." **Turbo does no such thing**, and
   `turbo.json` declares no `globalDependencies` to make it: on `e237427`, a
   one-file one-line `CLAUDE.md` commit, `npx turbo-ignore @urganize/web
   --fallback=HEAD^` answers *"This project and its dependencies are not
   affected / Ignoring the change"* and exits **0**, and asking turbo itself
   with `--filter="@urganize/web...[e237427^...e237427]" --dry=json` reports
   `packages: []`, `tasks: 0`. **The trap that most likely produced the claim is
   worth keeping, because it is one line away from the correct command:** run
   that same filter as `...[e237427^]` instead of the explicit range and web IS
   in scope with 7 tasks — because `...[ref]` means `ref..HEAD`, so with `HEAD`
   at `main` the range picks up every later commit that really did touch
   `apps/web`. Ran the tool, generalised — the error shape point (9) under the
   rate limit already names, hit again while fixing point (9).
   **THE REAL 84-A-DAY MECHANISM IS THE ONE THE FOUNDER CONFIRMED THE SAME DAY:
   the Ignored Build Step field was EMPTY on both projects, so `turbo-ignore`
   never ran at all** (see the correction on item 1 — and note the field is no
   longer empty on `the-urganization`, which is why that sentence is past
   tense). Those are different causes with different consequences — had bare
   `turbo-ignore` been installed all along, docs-only merges would already have
   been skipped and the burn would not have happened.
   **What this does NOT change is the script or item 6, and the genuine
   increment is worth stating exactly**, because "then why does the script
   exist" is the obvious next question. For a root-level `.md` the script and
   bare `turbo-ignore` agree (both skip); where they part is **markdown INSIDE a
   package** — `apps/web/lib/release-templates/single-v0.3.md` and
   `apps/web/lib/capture-playbook/capture-v0.1.md` belong to `@urganize/web`, so
   turbo marks the package affected and `turbo-ignore` correctly refuses to
   skip, while this script does skip. **That is precisely the case item 6 goes
   to such lengths to prove safe**, and it is the script's real value: item 6's
   reasoning is right, only item 7's attribution was wrong.
8. **`turbo-ignore` now prints a deprecation notice** pointing at `turbo query
   affected`. It still works and still returns the right exit codes, and the
   dashboard field has been using it for months, so nothing was changed for it
   — but that is the migration waiting whenever it stops working.

- **Tested as the real artifact**, because the exit codes are the thing most
  likely to be got wrong and nothing else in the repo could catch it:
  `lib/vercel-ignore-build.test.ts` runs the script with a stub `git` and a stub
  `npx` on PATH and asserts what it exits with — the `sw-offline.test.ts` shape
  for a plain script with nothing to import. It covers both of turbo-ignore's
  answers passing through, so delegation cannot quietly become "always build".
- **Verified:** 2922 tests (13 new; clean-tree baseline 2909, measured by moving
  the file aside), `eslint .` at the exact 3-error / 81-warning baseline with
  **zero** new findings, `tsc --noEmit` clean apart from the 8 documented
  pre-existing `confirmed-action.test.ts` errors, and `next build` green **by
  exit code** with `/auth`, `/onboarding` and `/settings` still `○ Static` and
  `/api/version` still `ƒ`. **Four mutations, each killing exactly its own
  tests** (inverting the skip exit code, dropping the pattern's anchor, skipping
  instead of building on an unknown base, and ignoring the deployed base), each
  printing `APPLIED` before running per the recorded lesson that a mutation which
  never landed is indistinguishable from a survivor.
- **RUN FOR REAL AGAINST THIS REPO'S OWN GIT, both branches**, which is stronger
  than the stubs: on a genuinely docs-only `HEAD` it logged
  *"every changed file is markdown; skipping this build"* and exited **0**
  without reaching turbo-ignore; with `VERCEL_GIT_PREVIOUS_SHA` set to a commit
  four back, it logged *"comparing against the last deployed commit"*, ran the
  real `turbo-ignore`, which answered *"This commit affects @urganize/web ·
  Proceeding with deployment"*, and exited **1**.
- **NOT verified, and it is the one thing left: no Vercel deploy has run THIS
  SCRIPT — though something is now gating `the-urganization`.**
  So `VERCEL_GIT_PREVIOUS_SHA` existing and being set on a production deploy
  rests on documentation rather than observation — if it is absent the script
  silently falls back to `HEAD^` and still works, which is why that fallback is
  there. **Install it on ONE project first** (`urganize`), push a docs-only
  commit and confirm the build is skipped and the log line appears, then push a
  code commit and confirm it builds, and only then set it on
  `the-urganization`. Both stderr lines are prefixed `[ignore-build]` so the
  Vercel build log says which branch it took — **which is also how to find out
  what is in `the-urganization`'s field today, since a cancelled build that
  prints no `[ignore-build]` line is bare `turbo-ignore` rather than this
  script.** As of 2026-09-11 `urganize` is still ungated, so the order above is
  the reverse of what happened; read the marketing project's existing value
  before replacing it (item 1).
- **`turbo-ignore` ITSELF fails open in every failure mode, measured 2026-09-08
  — so the delegate path cannot halt a deploy either.** The script's own
  uncertainties all end in a build by construction, but that only covers the
  cases it decides; this covers the case it hands over. An unresolvable base ref
  (`--fallback` pointed at a nonexistent sha, the shallow-clone shape) exits
  **1**, and a mistyped workspace name exits **1** logging
  `No package found with name '@urganize/typo' in workspace`. Both print
  *"Proceeding with deployment"*. **So the worst case of a wrong value in that
  dashboard field is a gate that does nothing, which is exactly today's
  behaviour** — which recasts the standing "exit 0 is skip, so getting it
  backwards stops deploys entirely" warning as a hazard of WRAPPING the command,
  the thing this script does, rather than of `turbo-ignore` itself. One
  measurement trap, hit while taking these: `cmd | tail` reports `tail`'s exit
  status, so the first reading showed 0 in both directions and had to be redone
  without the pipe. Drop the pipe or read `PIPESTATUS`.
- **WHETHER A SKIPPED DEPLOYMENT STILL COUNTS AGAINST THE 100/DAY CAP IS
  UNKNOWN, and it is the half that decides whether any of this solves the
  founder's actual problem.** `vercel.com` and `api.vercel.com` are both
  policy-blocked from the agent sandbox, so this is unread rather than
  uncertain. A skip certainly saves build minutes and wall-clock; if Vercel
  still records the deployment, it does **not** prevent exhaustion. **Do not
  promise that the cap problem is solved by installing this** — the honest claim
  is that it is safe, correct, and applies to the majority of merges (measured
  over the 24 hours to 2026-09-08: 18 merges, 7 touching `apps/` or `packages/`,
  **11 touching neither**). **The check costs nothing and rides along with the
  install anyway:** after setting the field, merge one docs-only change and read
  the project's deployment list — a deployment recorded as skipped means it
  counted, an absent one means it did not.
