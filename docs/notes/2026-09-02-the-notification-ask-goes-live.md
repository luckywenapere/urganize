# The notification ask goes live (2026-09-02, v1.17.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: "turn it on" — `NEXT_PUBLIC_FEATURE_PUSH_PROMPT`, the soft ask card
built 2026-08-21 (PR #361) that has sat at its default `false` ever since. The
question that led here was whether notifications could be switched on
automatically across all devices; they cannot (a permission is granted per
device, by a tap on that device, and browsers only honour the OS prompt from a
real gesture), so this card is the closest the platforms allow: it asks on every
device that has not answered yet, about six seconds after sign-in.

**Why it was almost certainly off, since nothing recorded it either way.** The
flag was introduced without a ledger entry (a flag flip earns one, per the EPK
precedent, and none exists for the card), this file's only mention of it was the
install-prompt checklist saying it "should be on too", and the comment above the
flag in `AppShell.tsx` records the audit that motivated the card — ONE
registered browser and ZERO devices against ~40 deadline notifications a day —
with nothing since recording that number moving. The Vercel value itself could
not be read from the sandbox (the proxy refuses the connection), so "off" is an
inference from the paper trail, not a reading.

**Three things worth knowing at the flip:**

1. **The order is env var FIRST, then a deploy that rebuilds `apps/web`.**
   `NEXT_PUBLIC_*` is inlined at build time, so merging this entry before the
   var is set ships a ledger announcing a card the bundle cannot render — the
   exact false-announcement the EP/album flip recorded. The version-bump commit
   is sufficient to force the rebuild (`apps/web/package.json` is part of the
   package, measured 2026-08-16); a same-commit Redeploy is not.
2. **Web only, unless `NEXT_PUBLIC_FEATURE_NATIVE_PUSH` is also on.** The card
   covers the Capacitor shell through `isNativePushAvailable()`, but that path
   is gated on the native flag, which has its own founder-blocked activation
   checklist (Firebase, `FCM_SERVICE_ACCOUNT_JSON`, a new binary). With it off,
   the native app's bridge stays passive and the only way to enable push there
   is still the Settings toggle. That is a known limit, not a defect.
3. **iOS Safari tabs never see the card**, by platform rule rather than by ours:
   `isPushSupported()` is false there because Apple exposes `PushManager` only
   to Home Screen apps. The install offer (`NEXT_PUBLIC_FEATURE_INSTALL_PROMPT`,
   still off) is what would get an iPhone user to the point where this card can
   ask. Turning this flag on alone helps Android browsers and every desktop.

- **No code changed.** This is the ledger entry, the version bump and this note;
  the card, its gates and its snooze are exactly as PR #361 and #437 left them.
- **Verify after the deploy:** sign in on a device where app.urganize.app has
  neither been granted nor blocked for notifications and "Not now" has never
  been tapped, stay on the dashboard for ten seconds, and expect the card.
  Then, from a second browser, assign yourself an activity and expect the push.
  If no card appears, check the Vercel var and confirm the deploy rebuilt
  `apps/web` before suspecting the code.
