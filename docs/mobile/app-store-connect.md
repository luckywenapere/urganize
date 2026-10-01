# App Store Connect: what to enter

Everything below is meant to be pasted into App Store Connect when the app record
exists. It is written to match what the app really does today. If the app changes,
change this too, because Apple compares these answers with what reviewers see.

## App information

| Field | Value |
|---|---|
| Name | Urganize |
| Subtitle | Everything after the music |
| Bundle ID | com.urganize.app |
| SKU | urganize-ios-1 (anything unique) |
| Primary category | Business |
| Secondary category | Productivity |
| Privacy policy URL | https://urganize.app/privacy |
| Support URL | https://urganize.app (or a page with contact@urganize.app) |
| Marketing URL | https://urganize.app |
| Age rating | 4+ (no mature content, no web browsing, no user-to-user public content in the app) |
| Price | Free |
| Export compliance | Already answered in the app config (no non-exempt encryption) |
| iPad | Not supported yet. iPhone screenshots only. |

Description, keywords and promotional text: use `docs/store-listing.md`.

## App Privacy (the "nutrition labels")

Answer these in App Store Connect under App Privacy. Tracking: **No**. Nothing is used
to follow people across other companies' apps or sites.

| Data type | Collected | Linked to the person | Used for |
|---|---|---|---|
| Contact info: name | Yes | Yes | App functionality |
| Contact info: email address | Yes | Yes | App functionality, account |
| User content: photos or videos (cover art, press photos) | Yes | Yes | App functionality |
| User content: audio data (songs they upload; voice only when they use voice input) | Yes | Yes | App functionality |
| User content: other (rollouts, tasks, notes, team messages) | Yes | Yes | App functionality |
| Identifiers: user ID | Yes | Yes | App functionality, analytics |
| Identifiers: device ID (push notification token) | Yes | Yes | App functionality |
| Usage data: product interaction | Yes | Yes | Analytics |
| Diagnostics: crash and performance data | Yes | Yes | App functionality |

Not collected: financial info (the iPhone app has no payments), location, health,
contacts, browsing history, search history, sensitive info.

## Review notes (paste into "App Review Information")

> Urganize is a rollout-planning app for artists and managers. The app shows the live
> Urganize service in a native shell and adds native features: push notifications, the
> iPhone share sheet, Sign in with Apple, a native offline screen and a device
> passcode or Face ID lock.
>
> **Demo account** (full access, filled with sample rollouts):
> Email: [demo email]
> Password: [demo password]
>
> **Signing in:** the sign-in screen offers Sign in with Apple, Google, or email. The
> demo account uses email.
>
> **AI features:** the first time you use UrgAns (the assistant), voice, or rollout
> planning, the app asks for permission to send your words to our AI provider. Tap
> Agree to try them. You can change this in Settings, under UrgAns.
>
> **Payments:** the iPhone app does not sell or link to anything. Plans are managed
> outside the app and the app shows no prices.
>
> **Deleting an account:** Settings, then Security & account, then Delete account.
>
> Contact: contact@urganize.app

## Before you press Submit

- [ ] Demo account created, given active access in the admin team page so it never hits
      the locked screen, and filled with a couple of rollouts and tasks.
- [ ] Demo email and password pasted into the review notes above.
- [ ] iPhone screenshots taken on a real device or simulator at 6.7 inch and 6.5 inch.
- [ ] Privacy answers entered exactly as in the table above.
- [ ] Privacy policy page live with the 1 October 2026 update.
- [ ] Sign in with Apple tested on a real iPhone with a real Apple ID.
- [ ] App tested through TestFlight with no crash.
