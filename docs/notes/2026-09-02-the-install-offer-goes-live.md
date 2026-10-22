# The install offer goes live (2026-09-02, v1.18.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: "turn on the install prompt too", minutes after the notification ask
above. `NEXT_PUBLIC_FEATURE_INSTALL_PROMPT`, built 2026-08-30 (#437),
retriggered to a one-minute timer 2026-08-31, and given its iOS fix 2026-09-01.
**No code changed** — this is the ledger entry, the version bump and this note.

**This also resolves the contradiction the 2026-09-01 iOS entry left open.**
That section records the founder watching a real user tap `Got it` on iOS while
this file insisted the flag had never been flipped, and named the two
possibilities: on in production with no ledger entry, or a preview deploy.
Either way it is moot now — the flag is on by an explicit founder call, the
ledger entry exists, and this note is the record. If it WAS already on, the only
thing this deploy changes is that the changelog finally says so.

**Three things worth knowing at the flip:**

1. **Env var FIRST, then a deploy that rebuilds `apps/web`** — the same order as
   the notification ask, for the same build-time-inlining reason. The
   version-bump commit is what forces the rebuild.
2. **`AndroidAppBanner` stands down the moment this is on.** `AppShell` renders
   it only when `INSTALL_PROMPT_ENABLED` is false, so Android browser visitors
   lose the top banner on arrival and gain the bottom card after a minute. Both
   point at `/download`. Nobody gets asked twice for one thing, and nobody loses
   the path to the APK.
3. **The two cards share one slot and are sequenced, not stacked.** With both
   flags on, the notification ask holds itself until this card is answered, and
   follows a decline about a second later (`INSTALL_HANDOFF_DELAY_MS`). An
   accept, or an ignored card, releases it too. On iOS the notification ask
   cannot fire in a Safari tab at all, so this card is the only one an iPhone
   user sees — and its iOS variant has no primary button by design (2026-09-01):
   it teaches the two share-sheet taps and records a decline on Close, because
   nothing the page can read confirms an iOS install except `navigator.standalone`
   on the next visit from the Home Screen.

**The one thing that has never been observed and is worth watching for:** the
DESKTOP card depends on Chrome firing `beforeinstallprompt`, which requires the
manifest to pass Chrome's installability criteria (the icon now declares
`1004x1004` for exactly this). If no card ever appears on desktop Chrome after a
minute, that is the first thing to check, not this code — the failure is silent
by design, since a card with an install button that cannot install would be
worse than no card.

- **Verify after the deploy:** on an Android phone in Chrome, sign in and wait a
  minute — expect "Get the Urganize app" low on the screen, no top banner, and
  the notifications card a beat after tapping Not now. On desktop Chrome, expect
  "Install Urganize" with a working Install button. On an iPhone in Safari,
  expect the two-step card with only a Close.
