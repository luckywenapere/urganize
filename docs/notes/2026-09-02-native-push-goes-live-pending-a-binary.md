# Native push goes live, pending a binary (2026-09-02, v1.19.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: "turn on native push too", the third flag flip of the morning.
`NEXT_PUBLIC_FEATURE_NATIVE_PUSH`, built 2026-08-10, with its activation
checklist recorded under "Mobile push notifications + editable presets". Unlike
the two flips above, **this one is not finished by the flag and a deploy.** Read
the four points before assuming Android phones are receiving anything.

1. **The flag only controls the CLIENT half.** The server sender
   (`lib/fcm-server.ts`) gates on `FCM_SERVICE_ACCOUNT_JSON` being set, not on
   the flag, and no-ops silently without it. Firebase's Android CLIENT config
   (`google-services.json`, project `urganize-2b082`) has been committed since
   2026-08-12 (#269); whether the SERVER key was ever pasted into Vercel is a
   founder step (`docs/mobile/push-setup.md` part 2) that this sandbox cannot
   verify and the doc does not mark done. If a device registers and nothing
   arrives, that env var is the first suspect; `[fcm]`-prefixed lines in the
   Vercel function logs are the second.
2. **No installed binary can use this yet.** The only Android build ever
   recorded is the debug APK of 2026-08-07, which predates BOTH the push plugin
   (added 2026-08-10) and `google-services.json` (2026-08-12). On that build
   `Capacitor.isPluginAvailable('PushNotifications')` is false, so
   `isNativePushAvailable()` is false, the card and the Settings toggle fall
   back to the web path, and `isPushSupported()` is false inside a webview — so
   the flag changes NOTHING on any phone running it. That is safe (no broken
   button) and also means **a new APK is the real activation step.**
   `versionCode` is bumped 1 → 2 in this pass so the next `assembleRelease` is
   the incremented build the signing doc requires; note that doc's warning that
   a release-signed build cannot install over the 2026-08-07 debug APK — those
   testers uninstall first and sign in again.
3. **What the flag does change, once a capable build is installed:** the
   notification ask card (live since v1.17.0) takes its native branch
   (`native = NATIVE_PUSH_ENABLED && isNativePushAvailable()`), so "Turn on
   notifications" inside the app requests the OS permission and registers an
   FCM token to `device_push_tokens` instead of failing on a missing
   `PushManager`; `PushNotificationsSection` in Settings does the same; and
   `CapacitorPushBridge` re-registers a granted device on every launch. The
   server fans every existing push — deadlines, assignments, the drip, admin
   broadcasts — out to those tokens with no call-site change.
4. **iOS is untouched.** Part 3 of `docs/mobile/push-setup.md` (APNs key,
   entitlement, `GoogleService-Info.plist`) is still founder-blocked on a Mac
   and an Apple Developer account. The iPhone path remains: install to the Home
   Screen, then the WEB push ask.

**The ledger entry is written for the state AFTER the binary ships**, because a
changelog line saying "the Android app can notify you" is true of the build, not
of the flag — and the flip and the build are being done in the same pass on
purpose, so the entry does not sit false for weeks the way the EPK flag once
did. If the binary slips, the entry is the thing that is wrong, not the code.

- **A leftover from the original checklist, closed in the same sitting:**
  `20260810140000_notification_type_due_tiers.sql` was verified NOT applied on
  2026-08-12 and nothing since recorded applying it, so for three weeks the
  daily sweep's 7-day and 3-day tiers failed on insert (`task_due_7d` was not a
  valid enum value) while the 1-day tier and `task_overdue` kept working. **The
  founder applied it 2026-09-02**, right after this flip merged. Worth knowing
  when reading notification history: no 7d/3d reminder can exist before that
  date, and their absence is not a bug in `assignDueTier`.
- **Verify, in this order:** (a) build and sideload the new APK; (b) in the
  app, sign in, wait for the card, tap Turn on, accept the OS prompt — expect
  "Notifications are on for this device" and a new row in `device_push_tokens`;
  (c) `/admin/notifications` → Send test to me — expect a system-tray
  notification within seconds; (d) tap it — expect the app to foreground and
  land on the target page.
