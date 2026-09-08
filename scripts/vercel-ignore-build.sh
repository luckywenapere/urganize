#!/usr/bin/env bash
#
# Vercel Ignored Build Step.
#
# EXIT 0 SKIPS THE BUILD. EXIT 1 BUILDS IT. Getting those the wrong way round
# stops every deploy on both projects, which is far worse than the problem this
# solves, so read that line twice before editing anything below. It is also why
# every uncertainty here ends in a build rather than a skip.
#
# WHY IT EXISTS. Both Vercel projects build from this one repo, and each merge
# costs FOUR deployments: a preview on each project, then a production deploy on
# each. The Hobby plan caps deployments at 100 a day, so 25 merges is the
# ceiling — and a docs-only commit is not exempt, because a root-level file such
# as CLAUDE.md belongs to no package, which turbo treats as a global change.
# Measured on 2026-09-07: 21 merges in 24 hours, every one of them touching
# CLAUDE.md, while only 8 touched apps/web and 2 touched apps/homepage. Roughly
# three quarters of that spend rebuilt an app that had not changed.
#
# WHAT IT DOES. Skips only when EVERY changed file is markdown, and hands the
# decision to turbo-ignore in every other case — including every case where it
# cannot positively determine what changed. It is a narrowing of turbo-ignore,
# never a replacement for it.
#
# WHY A MARKDOWN-ONLY SKIP IS SAFE. Nothing in either app reads a .md file at
# build time or at run time. Verified rather than assumed: there are no .md
# imports under apps/*/app or apps/*/lib, and the only fs read in shipped code
# is lib/recap-fonts.ts loading TTF binaries. Two markdown files ARE sources of
# truth (lib/release-templates/single-v0.3.md, lib/capture-playbook/capture-v0.1.md)
# but each is encoded into a sibling .ts that is what actually ships, and the
# only thing reading the markdown is a vitest test — and tests are not run by
# the Vercel build.
#
# HOW TO INSTALL IT. Per project, in the Vercel dashboard, under Settings ->
# Build and Deployment -> Ignored Build Step, replacing `npx turbo-ignore
# @urganize/<app>`:
#
#   bash scripts/vercel-ignore-build.sh @urganize/web        (project: urganize)
#   bash scripts/vercel-ignore-build.sh @urganize/homepage   (project: the-urganization)
#
# DO NOT put this in vercel.json's `ignoreCommand`. That file lives at the repo
# root and BOTH projects read it (both have Root Directory `.`), so a single
# command there cannot pass a different workspace name to each one — the two
# projects would filter on the same app and one of them would stop deploying
# its own changes. The per-project dashboard field is what keeps them apart.
#
# Invoked as a relative path, so it depends on the cwd being the repo root.
# That holds because both projects have Root Directory `.`.

WORKSPACE="${1:-}"

log() { printf '[ignore-build] %s\n' "$1" >&2; }

# Every path out of this script that is not a proven docs-only diff ends here.
delegate() {
  log "handing the decision to turbo-ignore${WORKSPACE:+ ($WORKSPACE)}"
  if [ -n "$WORKSPACE" ]; then
    npx --yes turbo-ignore "$WORKSPACE"
  else
    npx --yes turbo-ignore
  fi
  exit $?
}

# THE BASE IS THE LAST DEPLOYED COMMIT WHERE VERCEL TELLS US ONE, and that is
# the detail that keeps a skip from stranding code.
#
# Consider a code commit whose deploy failed (rate limited, say), followed by a
# docs commit. Diffed against HEAD^ the docs commit looks docs-only and would be
# skipped, leaving that code undeployed. Diffed against the last DEPLOYED commit
# it does not: the code files are still in the diff, so it builds. VERCEL_GIT_
# PREVIOUS_SHA is that commit.
#
# HEAD^ is the fallback when the variable is absent or points at a commit this
# checkout does not have (shallow clone, force push). The stranding risk is real
# there but bounded: a Vercel build deploys the branch tip rather than one
# commit, so the next non-docs merge ships whatever accumulated. /api/version is
# how you notice in the meantime.
BASE=""
if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] && git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  BASE="$VERCEL_GIT_PREVIOUS_SHA"
  log "comparing against the last deployed commit ($BASE)"
elif git rev-parse --verify --quiet "HEAD^" >/dev/null 2>&1; then
  BASE="HEAD^"
  log "no deployed commit to compare against; using HEAD^"
fi

# No base means no changed-file list, which means no evidence for a skip.
if [ -z "$BASE" ]; then
  log "could not work out what changed"
  delegate
fi

# --no-renames so a rename shows BOTH paths. With rename detection on, moving
# a.ts to b.md reports only b.md, which would read as a docs-only change while
# a real source file was deleted.
CHANGED="$(git diff --no-renames --name-only "$BASE" HEAD 2>/dev/null)" || {
  log "git diff failed"
  delegate
}

# An empty list is more likely a wrong base than a genuinely empty commit.
if [ -z "$CHANGED" ]; then
  log "no changed files reported"
  delegate
fi

# Anchored at the end, so lib/x.md.ts is code rather than docs. Case-insensitive
# for README.MD. A path git had to quote (spaces, non-ASCII) ends in a quote
# character rather than .md and so fails toward building, which is the right
# direction.
if printf '%s\n' "$CHANGED" | grep -qviE '\.md$'; then
  delegate
fi

log "every changed file is markdown; skipping this build"
exit 0
