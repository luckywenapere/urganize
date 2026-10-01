# iOS submission plan

Written 2026-10-01. The goal: get Urganize through Apple review and into TestFlight and then the App Store, on a partner's Apple Developer account, without being rejected.

The app is the Expo shell in `apps/mobile` (a native wrapper around app.urganize.app). Apple's rule 4.2 rejects apps that are only a website in a frame, so the plan has two jobs: make the app clearly more than a frame, and remove everything Apple rejects on sight.

Status key: **BUILT** (exists today), **GAP** (not built, work to do), **YOU** (a step only the founder can do: it needs a login, a password or a decision).

---

## Progress (updated 2026-10-01)

| Item | State |
|---|---|
| 3. Payments on iOS | DONE in code. No purchase link, price or upgrade prompt in the iPhone app. A guard test blocks new ones. |
| 2. AI consent | DONE in code, off until `NEXT_PUBLIC_FEATURE_AI_CONSENT=true`. Needs `ai_consent_at` migration applied first. |
| 1. Sign in with Apple | DONE in code. Needs the `apple_sign_in_tokens` migration, Apple keys, Supabase provider and 4 env vars (see section 1). Untested on a real iPhone. |
| 5. Housekeeping (repo) | DONE: iPad off, camera and photo permission text, encryption answer was already set, privacy page and subprocessors updated, unfinished options hidden in the iPhone app, App Store Connect guide written (`docs/mobile/app-store-connect.md`). |
| 4. Face ID / passcode lock | DONE in code (shell lock screen, Settings > Security row). Untested on a real phone. |
| 4. Native photo picker | Covered by the phone's own picker (camera and photo text added). No extra code needed unless review asks. |
| 4. Native tab bar | Held back, as planned. |
| Founder steps (Apple account, keys, Firebase, Supabase, demo account, screenshots) | Not started. |

---

## 0. What already exists (do not redo)

| Item | State |
|---|---|
| Expo shell, bridge, push, share sheet, offline screen | BUILT (needs a real-phone test) |
| Android preview build on EAS | Started 2026-10-01, signed with the existing upload key |
| EAS project `@the-urganization/urganize` linked | BUILT (`cbd14f37`) |
| Delete account (Settings, `DeleteAccountSection.tsx`, `/api/account/delete-now`) | BUILT |
| iOS hides prices and the Subscribe button (`isIOSApp()` in `LockedPageClient`, `TeamWall`, `StartTrialPageClient`, paid pitching) | BUILT, but see section 3 |
| Microphone permission text (voice input) | BUILT |
| Privacy page `/privacy` | BUILT, needs a small update (section 6) |

---

## 1. Sign in with Apple (GAP, most likely rejection)

Apple rule 4.8: an app that offers a third-party login (we offer Google) must also offer Sign in with Apple. Today `app/auth/AuthPageClient.tsx` has Google and email only.

**Design.** Native, not a web redirect.
- Add `expo-apple-authentication` to `apps/mobile`, plus its config plugin and the `com.apple.developer.applesignin` entitlement in `app.config.ts`.
- New bridge request `appleSignIn` in `packages/native-bridge` (add it to `BRIDGE_REQUEST_TYPES` and `BridgeRequestMap`, a handler in `apps/mobile/App.tsx`). The shell asks for name and email, uses a random nonce, and returns the identity token.
- Web side: `loginWithApple()` in `lib/auth-store.ts`, calling `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`. It lives beside `loginWithGoogle` and uses `shellSupports('appleSignIn')`.
- The Apple button renders only inside the iOS shell (a capability check, like the other native features), above the Google button, in Apple's required style and wording ("Continue with Apple").
- A native token needs no yearly client-secret rotation, which a web flow would.

**Things that are easy to miss**
- **Hidden email.** Apple lets people hide their email behind a relay address. Mail from us to that address bounces unless our sending domain is registered in the Apple developer portal (Sign in with Apple for Email Communication) and SPF/DKIM pass. Register `send.urganize.app`. YOU.
- **First sign-in only.** Apple gives the person's name only the first time. Save it then, or it is lost.
- **Account linking.** A person who already has an email or Google account may sign in with Apple using the same address. Confirm Supabase links them rather than making a duplicate. Test with one real account.
- **Deleting an account must also revoke the Apple token** (Apple rule). That needs the authorization code exchanged server-side for a refresh token, which is stored and revoked on `delete-now`. Needs one migration (a small table, row-level security on, no policies) and three server-only env vars (Team ID, key ID, the Sign in with Apple key). Without this, review can reject at the delete-account check.
- **Supabase dashboard.** Enable the Apple provider, and set Client IDs to `com.urganize.app`. YOU.

**Needs from the Apple account (YOU, after the partner gives you Admin):** an App ID with Sign in with Apple switched on, and a Sign in with Apple key (.p8).

**Tests.** Pure helpers (nonce, name capture, capability check) in `lib/` with vitest. The bridge request goes through the existing dispatcher tests. The real flow can only be proven on an iPhone.

---

## 2. AI consent (GAP)

Apple rule 5.1.2(i): before personal data goes to a third-party AI, the app must say so clearly and get permission. UrgAns sends rollout data to an outside model through our gateway, and voice sends audio for transcription. Nothing asks today.

**Design**
- One consent screen, shown once before first use of any AI feature: UrgAns chat, voice, rollout planning, status updates, task outcomes, press kit drafting.
- Plain wording (fifth-grade): what is sent (your messages, the rollout details you ask about, and voice recordings for voice), who gets it (our AI providers: name them, currently OpenAI through RodiumAi), what we do not do (we don't use it to train models; matches `/privacy`), and a link to the privacy page. Two buttons: **Agree** and **Not now**.
- Not now keeps everything else in the app working; AI features show a short "Turn on AI to use this" prompt instead.
- Stored on the account: new column `profiles.ai_consent_at` (migration). Cached in the browser for speed.
- **Enforced on the server**, not only hidden in the UI: one shared check used by `/api/urgans`, `/api/urgans/transcribe`, the planner, status-update, task-outcome and press-kit-draft routes. Without consent the route answers 403 with a clear message. The assistant's typed-command fallback (no model) is unaffected.
- A way to withdraw: a toggle in Settings, which clears the column.

**Open decision (recommend: everyone, not iOS only).** One rule everywhere is simpler, is honest for all users, and avoids a second code path. The cost is that existing users see the screen once.

**Flag.** `NEXT_PUBLIC_FEATURE_AI_CONSENT`, default off, switched on with the iOS release. Entry for the changelog lands at the flip.

---

## 3. Payments on iOS (GAP: update what exists)

Apple rules 3.1.1 and 3.1.3: an iOS app must not tell people to buy or subscribe elsewhere. Today the iOS branches hide prices but still say "visit app.urganize.app to subscribe" and link there. That is the thing to remove.

**Changes (iOS app only; web and Android are unchanged)**
- `app/locked/LockedPageClient.tsx` (~line 275), `components/billing/TeamWall.tsx` (~line 497), `app/start-trial/StartTrialPageClient.tsx` (~line 240): remove the link and the "subscribe on the web" wording. Replace with neutral text such as: "Your team's plan has ended. The team owner can sort this out." plus **Check again** and **Sign out**. No website, no price, no button that leads to payment. The team owner is told to act in whatever way they usually do; the app does not say how.
- Hide on iOS: the "Talk to us" sales card on the wall, the Settings billing "See plans" button, any "Upgrade" link in the UrgAns usage strip, and seat-limit or limit-hit messages that carry an upgrade button (keep the text, drop the link).
- Audit: search every link a person can reach inside the iOS shell that lands on a pricing page or the marketing site's pricing (the Help menu, docs links, footers). The shell opens first-party pages inside the webview, so a pricing page is reachable by a link.
- Free trial stays. Existing paying customers keep working. Paid pitching is already hidden.
- One helper, `showsPurchasePrompts()` in `lib/platform.ts`, so every screen asks the same question; a guard test fails if a new screen renders a purchase link without it.

**Reviewer access.** The paywall would lock a reviewer out. YOU: create a demo account, comp it from `/admin/teams` so it never hits the wall, and fill it with sample data (a couple of rollouts, tasks, a note). Give the login in the App Review notes.

---

## 4. Make the app clearly more than a website

Already counts: push notifications, share sheet, offline screen. Add:

| Item | State | Notes |
|---|---|---|
| Face ID / passcode lock on opening | GAP | `expo-local-authentication`, a new `biometricLock` bridge request, a switch in Settings (off by default, on for people who want it). Small. Strongest cheap "real app" signal for unreleased music. |
| Native photo/camera picker for cover art | GAP | Needs `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` strings. Check the web file input already opens the phone's own picker; wire it to the bridge if not. |
| Native bottom tab bar (Home, UrgAns, Notes, Shows) | GAP, hold | Bigger change. Build only if review comes back saying "repackaged website". |

---

## 5. Housekeeping

**In the repo**
- `ios.supportsTablet`: set to `false` unless iPad layouts are tested. True means iPad screenshots are required and iPad bugs are rejections.
- `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` so Apple stops asking an export question on every upload.
- Camera and photo-library permission strings (section 4).
- Confirm the microphone string reads clearly; it does.
- Remove any placeholder or lorem text and dev-only screens reachable in the app. Grep and walk through.
- Check there are no broken links or dead buttons in the iOS shell: run the app on a real phone and tap everything.
- Account deletion: confirm it is easy to find on a phone (Settings, Account), asks for confirmation, and (once Apple sign-in exists) revokes the token.
- Reporting content: the app has a Report an issue form. The only public user content is the Directory and public pages, both flag-gated. If the Directory is on at review time, add a report/block path or keep it off for the iOS build.

**App Store Connect (YOU)**
- App name "Urganize", subtitle "Everything after the music", category Business or Productivity, age rating questionnaire, support URL, marketing URL, privacy policy URL (`https://urganize.app/privacy`).
- App Privacy answers ("nutrition labels"), truthfully. Data collected: email, name, user content (rollouts, notes, files, messages), usage analytics (PostHog), diagnostics, and audio only when voice is used. Linked to the user: yes. Tracking: no.
- Screenshots: iPhone 6.7-inch and 6.5-inch sets showing real screens. No device frames needed.
- Description: reuse `docs/store-listing.md`.
- Review notes: demo account login, a line saying "Urganize is a rollout-planning workspace; the app uses push notifications, native sharing, and a native offline mode", how to reach AI features, and a note that AI consent appears on first use.

**Privacy page update** (`apps/homepage/app/privacy/page.tsx`): add Sign in with Apple (what Apple gives us), and the AI consent wording matching section 2. Bump `LAST_UPDATED`.

---

## 6. Apple account and build steps

1. YOU: ask the partner to accept agreements and invite you as **Admin** (message already drafted). Ask whether his account is Individual or Organization.
2. YOU: accept the invite, turn on two-factor, create the **App ID** `com.urganize.app` with Push Notifications and Sign in with Apple on, and create the app record in App Store Connect.
3. YOU: create an **APNs key** (.p8) and a **Sign in with Apple key** (.p8). Each downloads once; keep both safe.
4. Firebase: add the iOS app (bundle `com.urganize.app`), download `GoogleService-Info.plist` into `apps/mobile`, upload the APNs key under Cloud Messaging. (Needs your Google login.)
5. Supabase: enable the Apple provider.
6. EAS: `eas build --platform ios --profile production` (you type the Apple ID and password), then `eas submit --platform ios` to TestFlight.
7. Test on a real iPhone through TestFlight: sign in with email, Google and Apple; AI consent; locked-account screen shows no purchase links; push; share; delete account.
8. Submit for review.

---

## 7. Order of work

| # | Work | Who |
|---|---|---|
| 1 | Payments update (section 3) | Me |
| 2 | AI consent: migration, server check, screen, Settings toggle (section 2) | Me |
| 3 | Sign in with Apple: bridge, button, token revoke, migration (section 1) | Me |
| 4 | Housekeeping in the repo (section 5, top list) | Me |
| 5 | Face ID lock and photo picker (section 4) | Me |
| 6 | Privacy page update | Me |
| 7 | Android build checked on a real phone | You |
| 8 | Apple account steps, keys, App Store Connect, Firebase, Supabase | You (with the partner) |
| 9 | iOS build, TestFlight test, submit | Me, with your logins |

Items 1 to 6 can be built and tested before the partner gives access. The two migrations need applying by hand in the Supabase dashboard (SQL goes in the chat, per project habit).

## 8. Known risks

- Apple may still say "repackaged website." The native tab bar (section 4) is the planned answer.
- Sign in with Apple can only be fully tested on a real iPhone with a real Apple account.
- Ownership: the app sits under the partner's name. Agree in writing who owns it.
- Nothing in the Expo shell has run on a phone yet. Expect the first real run to find bugs.
