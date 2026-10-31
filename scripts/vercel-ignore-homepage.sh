#!/usr/bin/env bash
#
# Ignored Build Step for the marketing site (Vercel project the-urganization,
# urganize.app). Wired in as `ignoreCommand` in apps/homepage/vercel.json, which
# is the file that project reads since its Root Directory became apps/homepage
# (2026-10-19), so this runs with apps/homepage as the working directory.
#
# EXIT 0 SKIPS THE BUILD. EXIT 1 BUILDS IT. Every uncertainty below ends in a
# build, never a skip: an extra marketing deploy costs one of the day's 100,
# a skipped one leaves the site showing old copy with nothing to say so.
#
# THE RULE (founder call 2026-10-31, #947): the marketing site deploys itself,
# but only when a push to main asks for a deploy AND changes something the site
# is built from.
#
#   1. The commit message must contain [deploy], the same opt-in the product
#      app has had since 2026-10-27 (root vercel.json).
#   2. Something the site is built from must have changed since its last
#      deploy: anything under apps/homepage/, packages/pricing, packages/ui,
#      packages/config, or pnpm-lock.yaml.
#
# NOT COUNTED, ON PURPOSE, so a product release does not rebuild the site:
#   - a package.json change whose only changed lines are "version" (every
#     release bumps all eleven package.json files together);
#   - packages/changelog, which every release edits. The trade: the public
#     /changelog page on urganize.app catches up at the next marketing deploy
#     rather than at every release.
#
# Before 2026-10-31 this project did not deploy from main at all ("main": false
# from 2026-10-14, effective from 2026-10-19; reverted back to it on
# 2026-10-22), so every marketing deploy was by hand.

set -u

log() { printf '[ignore-homepage] %s\n' "$1" >&2; }
build() { log "BUILD: $1"; exit 1; }
skip() { log "SKIP: $1"; exit 0; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || build "not a git checkout"
cd "$ROOT" || build "cannot reach the repo root"

MESSAGE="$(git log -1 --pretty=%B 2>/dev/null)" || build "cannot read the commit message"
case "$MESSAGE" in
  *"[deploy]"*) ;;
  *) skip "no [deploy] in the commit message" ;;
esac

# The base is the last commit this project deployed, so changes merged in
# earlier commits without [deploy] are still seen. When Vercel does not give
# one, or this shallow clone does not have it, fall back to the oldest commit
# the clone holds: that may build when it did not need to, never the reverse.
BASE=""
if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] && git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  BASE="$VERCEL_GIT_PREVIOUS_SHA"
  log "comparing against the last deployed commit ($BASE)"
else
  BASE="$(git rev-list --max-parents=0 HEAD 2>/dev/null | tail -n 1)"
  [ -n "$BASE" ] || build "cannot find a commit to compare against"
  log "no deployed commit in this checkout; comparing against the oldest one held ($BASE)"
fi

CHANGED="$(git diff --no-renames --name-only "$BASE" HEAD 2>/dev/null)" || build "git diff failed"
[ -n "$CHANGED" ] || build "no changed files reported, which is more likely a wrong base than an empty change"

# True when the only lines a package.json gained or lost are its "version".
version_only() {
  ! git diff --no-renames -U0 "$BASE" HEAD -- "$1" 2>/dev/null \
    | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' | grep -vqE '^[-+][[:space:]]*"version":'
}

while IFS= read -r path; do
  case "$path" in
    apps/homepage/*|packages/pricing/*|packages/ui/*|packages/config/*|pnpm-lock.yaml)
      case "$path" in
        */package.json)
          if version_only "$path"; then continue; fi ;;
      esac
      build "the marketing site changed ($path)" ;;
  esac
done <<EOF
$CHANGED
EOF

skip "nothing the marketing site is built from changed"
