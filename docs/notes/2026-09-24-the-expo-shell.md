# The Expo shell (2026-09-24; finished 2026-09-25)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: move the mobile app from Capacitor to Expo, **keeping the same
approach** — the app still shows the live website, so every web change still
reaches phones with no store review. Offered and declined: a native core
(catalog, activities, UrgAns, notes as React Native screens) and a full native
rewrite. The reasons given: a more app-like feel, easier builds and store
releases, over-the-air updates, and offline/device features. **Not a new scope
expansion** — the same sanctioned mobile surface (2026-07-21), re-shaped. The
full design record is `docs/mobile/expo-shell.md`; read it before touching
`apps/mobile` or any of the website files it names.

**THE CAPACITOR APP IS ON REAL PHONES, which the first session missed, and it
decides the rollout order.** It never reached a store, but its APK (0.41.2) has
been at urganize.app/download since 2026-08-08, and the install card (live
since v1.18.0) sends Android browser visitors there. **That APK is signed with
a real key, not a debug one:** `C:\Users\penta\urganize-upload-key.jks`, issued
to Urganize, Abuja, SHA-256 `37:A4:CB:08…:33:DE` — measured with `apksigner`,
2026-09-25. So two lines in "Native mobile app" above are stale ("one debug
APK", "keystore still to generate"), and the first session's
`android-signing.md` was wrong to say letting EAS make a fresh key "is fine": a
phone only installs an update signed with the same key. The site no longer
speaks Capacitor, so once this is live the old app still signs in with email,
but "Continue with Google" finishes in the phone's browser (its
`allowNavigation` held only urganize.app hosts, so Google opened outside it);
it never had push or a share sheet, since that build predates both. **Swap the
/download APK in the same release**, for an EAS preview build signed with that
key; the four steps are "Switching people from the old app" in
`docs/mobile/expo-shell.md`. The
passwords are in `apps/mobile/android/keystore.properties` in the MAIN
checkout, inside the old Android folder this change deletes from the repo —
save them before anyone runs `expo prebuild --clean` there. **One piece of the
old shell is still recognised:** `isRetiredCapacitorApp()` in `lib/platform.ts`
(`window.Capacitor` exists, which no browser tab has), so the old app is never
read as a phone browser and offered to install itself. Delete it once no
Capacitor installs remain.

**Built in two sessions, and the handover is worth knowing.** The first session
(`expo-mobile-conversion-6b3287`) did the conversion on top of #598 and stopped
before committing, testing or recording anything under "Verified". The second
copied that uncommitted work onto main through a snapshot commit object (a
temporary index over the other worktree, so its folder was never touched),
resolved the one conflict, and finished it. The part of main the first session
never saw is the part that was broken: **share to socials (#602, #605) had
added four share helpers that still called Capacitor**, which the merge kept
and nothing compiled against any more. They go through the bridge now.

### Ten things worth knowing before editing this

1. **The website talks to the shell in exactly one place,
   `apps/web/lib/native-bridge.ts`**, and these modules sit on it:
   `lib/platform.ts`, `lib/external-link.ts`, `lib/native-push.ts`,
   `lib/share-file.ts`, the native branch of `loginWithGoogle` in
   `lib/auth-store.ts`, `components/providers/NativePushBridge.tsx` and
   `components/providers/NativeAppearanceBridge.tsx` (`CapacitorAuthBridge` is
   deleted: the OAuth result comes back as the answer to a request, so no
   listener is needed). Every other caller goes through those and did not
   change. Nothing else should read `window.__URGANIZE_NATIVE__` or post to the
   webview.
2. **The protocol is a package, `packages/native-bridge`, imported by both
   apps**, so the two halves cannot drift. It also holds the shell's pure
   helpers — the dispatcher (`createShellDispatcher`), `safeShareFileName`,
   `notificationPath`, `shouldRetryAfterReconnect`, the colour readers —
   because that is what puts them within reach of vitest, which only runs in
   `apps/web`. `apps/mobile/src/bridge.ts` is only a re-export. Tests:
   `apps/web/lib/native-bridge.test.ts`, plus `share-file.test.ts` and
   `native-appearance.test.ts`.
3. **Detection needs BOTH signals**: the injected `window.__URGANIZE_NATIVE__`
   AND `window.ReactNativeWebView.postMessage`. Either alone means something
   other than our shell, and with neither every export is inert and the website
   behaves exactly as before — which is why none of this needs a feature flag.
4. **Android injects the description LATE, sometimes, and two things cover it.**
   iOS runs `injectedJavaScriptBeforeContentLoaded` as a document-start script,
   before any page script. Android (react-native-webview 13.16) runs it through
   `evaluateJavascript` from `onPageStarted`, which is usually but not strictly
   before the page's first script — read in the library's
   `RNCWebView.callInjectedJavaScriptBeforeContentLoaded`, not assumed. So the
   shell also puts `UrganizeApp/<version>` in the user agent
   (`buildShellUserAgentSuffix`), and `isAndroidBrowser()` / `isIOSBrowser()`
   refuse to call the app a phone browser when they see it; without that, the
   app could offer to install itself. And `whenInShell()` runs code once the
   description arrives, polling for up to 3 seconds only when a post channel
   exists; `NativePushBridge` and `NativeAppearanceBridge` start through it,
   because a missed start loses the notification tap that launched the app.
5. **Capabilities, not versions.** The shell lists the request types it
   understands; asking an older shell for something new rejects at once with
   `UnsupportedRequestError` rather than timing out. Add a request type by
   adding it to `BRIDGE_REQUEST_TYPES` and `BridgeRequestMap`, a handler in
   `App.tsx` (the `BridgeHandlers` type makes a missing one a compile error),
   and a `shellSupports()` check on the web side. The dispatcher also answers a
   request it has no handler for with an error, and calls every handler inside
   the promise chain, so nothing the page sends can throw inside the webview's
   message callback.
6. **Only our own pages drive native code.** The dispatcher drops any message
   whose page URL fails `isFirstPartyUrl` (https, `urganize.app` or a
   subdomain), and any top-level navigation off those hosts goes to the system
   browser or the owning app, never into the webview. A pushed link must pass
   `isSameOriginPath`, which refuses `/\host` as well as `//host`: a URL parser
   reads a backslash after the first slash as a second slash, so the old
   `startsWith('/') && !startsWith('//')` check let `/\evil.test` through as a
   path. Mutation-tested four ways, each failing a named test: loosening the
   host suffix (so `evilurganize.app` passes), dropping the https check,
   skipping the check in the dispatcher, and letting any pushed link through.
7. **Push is React Native Firebase, not expo-notifications**, and that is
   forced: the server sends only through FCM HTTP v1, and Expo's iOS device
   token is a raw APNs token FCM refuses. RN Firebase gives an FCM token on both
   platforms, so the server did not change. Its config plugin only POINTS at a
   notification icon (read in its `setupFirebaseNotifationIcon.js`), so
   `apps/mobile/plugins/withNotificationIcon.js` writes the drawable and colour
   — without it the Android build fails on a missing resource.
8. **A shared file carries no caption.** Android's share sheet takes a file or
   text, not both, and `expo-sharing` shares only a file. The share-to-socials
   sheet copies the caption to the clipboard before it shares, on every path,
   so it is one paste away. Text alone (the DM message) goes through React
   Native's own `Share`, a new `shareText` request that needs no native module.
9. **App-bound domains were removed, reversing the first session's call.** It
   had set `WKAppBoundDomains` + `limitsNavigationsToAppBoundDomains` so a
   service worker could run in the iOS webview. Nothing needs one there today
   (Web Push cannot reach a webview, and `NEXT_PUBLIC_FEATURE_OFFLINE` is off),
   and they narrow what the webview may load and run on a platform nobody can
   test from here. Put both back together if the offline layer is switched on
   and wanted in the app, and test the bridge on a real iPhone first.
10. **The escape in `buildDeliverScript` was a no-op, and the test now catches
    it.** Written `.join('\u2028')` in source, the replacement is the raw
    separator again. It needs a doubled backslash. Harmless on the engines the
    app runs on, but the comment claimed protection the code did not give.
    Worth knowing for anyone editing it: the file tools in this environment
    turn a typed `\uXXXX` into the raw character, so the fix went in through a
    script that builds the backslash from a char code.

### Smaller decisions

- **Native projects are generated, not committed.** `apps/mobile/android` and
  `ios` come from `app.config.ts` via `expo prebuild` and are gitignored.
  `google-services.json` moved to the `apps/mobile` root.
- **Builds are EAS** (`eas.json`: development / preview / production, remote
  auto-incremented build numbers). `codemagic.yaml` is deleted, and the
  hand-kept `versionCode` with it. The app version is read from
  `apps/mobile/package.json`, which mirrors the ledger. Root scripts are
  `mobile:start`, `mobile:build:android`, `mobile:build:ios`.
- **The EAS project id is a constant to paste** (`PASTED_EAS_PROJECT_ID` in
  `app.config.ts`), because `eas init` cannot write into a dynamic config. The
  first session read it from an environment variable only, which every EAS
  build and update would then have needed set; the variable is kept as an
  override.
- **OTA updates reach only the shell's own JavaScript.** The website already
  updates on deploy; anything native needs a store build.
- **Offline:** a native offline screen replaces the webview error page on a
  failed first load, and retries only when reachability TURNS true
  (`shouldRetryAfterReconnect`). The first session retried whenever it WAS
  true, which reloads in a tight loop when the load failed while online (the
  site down, a certificate problem).
- **Process death:** `onContentProcessDidTerminate` (iOS) and
  `onRenderProcessGone` (Android) reload the page instead of leaving a blank
  screen after the OS reclaims the webview's memory.
- **The splash** waits for the first page load, for at most 8 seconds.
- **Keyboard:** Android is edge to edge (`edgeToEdgeEnabled=true` in the
  generated `gradle.properties`), so the keyboard covers the webview instead
  of resizing it. A `KeyboardAvoidingView` with `padding` shrinks it on
  Android only, so the UrgAns composer stays above the keyboard; its
  relative-frame maths gives zero if the system resizes the window anyway, so
  it cannot double up. iOS moves the page itself.
- **Bar colours follow the page**, closing the first session's "ink bands in
  light mode" known limit: `NativeAppearanceBridge` reads the `--color-bg-base`
  token (a variable, so never a colour caught mid-transition), sends it as
  `appearance` on start and on every theme change, and the shell paints the
  safe-area bands and picks status bar text by luminance.
- **Permissions:** Expo's default storage and draw-over-apps permissions are
  in `blockedPermissions`, so notifications are the only permission the app
  ever PROMPTS for. The built manifest also carries install-time ones the
  libraries add (internet, network and wifi state, wake lock, vibrate, FCM
  receive), read with `aapt2 dump badging` rather than assumed. Checked
  against react-native-webview first: its file picker needs none of the
  blocked ones, and its storage check only guards its own download path,
  which this app does not use.
- **The preview profile is the /download build**, so it auto-increments its
  build number (a new APK installs over the last) and passes
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=armeabi-v7a,arm64-v8a` —
  verified to override the generated `gradle.properties` with
  `./gradlew properties`, not assumed. Real phones only: `armeabi-v7a` stays
  because many low-end Android Go phones run 32-bit. **A React Native APK is
  big, and that is a real cost on mobile data:** measured, each chip type's
  native libraries are ~15 MB and the app code ~11 MB (R8 minification is
  off, the Expo default), so the two-chip APK should be around 40 MB against
  the Capacitor one's 3.2 MB. Turning on R8 could cut the code part but needs
  a device test first, since reflection-heavy modules can break under it.
- **TypeScript stays on 5** in `apps/mobile` (Expo 57 recommends 6), excluded
  from `expo-doctor`'s version check, to match the rest of the repo.
- **Vercel installs the whole workspace**, so both web projects now install
  React Native and Expo too. Harmless to the build (the mobile app has no
  `build`, `lint` or `test` task), but it costs install time; filtering the
  install command to `@urganize/web...` is a dashboard change if it matters.
- **Remaining known limits:** Android shows no notification while the app is
  foregrounded (as before), and pull-to-refresh is deliberately off because the
  app's pages scroll inside panels.

### Local Android builds on Windows hit the 260-character path limit

Recorded because it cost two failed builds and will look like a code problem.
`LongPathsEnabled` is 0 on the founder's machine, and inside a worktree under
`.claude/worktrees` the build creates paths of 280-285 characters inside
pnpm's nested store (`node_modules/.pnpm/<pkg>@<ver>_<hash>/node_modules/...`):
first `CreateProcess error=2` on a `prefab_command.bat`, then, from a shorter
folder, ninja's `manifest 'build.ninja' still dirty after 100 tries` because
it cannot stat prefab config files of 261-266 characters. EAS builds on Linux
and never sees this. What worked locally: copy the repo without
`node_modules` to `C:\Users\penta\ub`, add `node-linker=hoisted` to THAT
copy's `.npmrc` only (the flat layout cuts about 80 characters from every
package path), install, prebuild, build. The flat layout is not what EAS uses,
so the JavaScript bundle was checked separately with the project's real
nested layout (`expo export --platform android` in the worktree). Turning on
long paths in Windows would remove the need for any of this, and is the
founder's call, being a system setting.

**A third failure was self-inflicted and is the one to not repeat:** forcing
`-Pkotlin.compiler.execution.strategy=in-process` (to dodge the "Could not
connect to Kotlin compile daemon" the first session logged) runs every
module's Kotlin compile inside the Gradle process, whose generated default of
512 MB class space ran out (`OutOfMemoryError: Metaspace` across seven
modules). Leave the strategy alone and raise the memory instead:
`"-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m"` on the command
line. Gradle falls back to in-process compiling by itself when the daemon is
unreachable, so the memory is what actually needs covering.

**The test APK built here is signed with React Native's PUBLIC test key**
(`fac61745…` — the `debug.keystore` every Expo prebuild writes, used by the
template's release build too). It cannot install over the old app, and it must
never go on /download: anyone can sign an "update" with that key. It exists to
try the shell on the founder's own phone, after removing the old app.

### Founder-only steps

In order: save the key's passwords from `keystore.properties` into a password
manager and back up the `.jks`; `eas login` and `eas init` (paste the project
id into `PASTED_EAS_PROJECT_ID` in `app.config.ts`); `eas credentials` to
UPLOAD the existing key, answering No to generating one
(`docs/mobile/android-signing.md`, which also covers choosing to upload this
key as the app signing key when Play comes, or Play-installed updates cannot
reach sideloaded phones); build a preview APK. For iOS, add the iOS app in
Firebase, commit `apps/mobile/GoogleService-Info.plist` (iOS builds fail at
prebuild without it) and upload an APNs key. Then ship this change with the
/download swap and run the checklist at the end of `docs/mobile/expo-shell.md`.

**No changelog entry and no version bump in this change**, on the EPK
precedent: the entry lands with the /download swap, which is when the new app
reaches anyone. Merged on its own, this is inert for every browser and changes
only the old Capacitor app, as described above.

### Verified

On the tree merged with main at v1.44.0:

- **3672 tests passing, 30 skipped, none failing.** 72 are new, in three files
  main does not have: `lib/native-bridge.test.ts`, `share-file.test.ts` and
  `native-appearance.test.ts`.
- **Nine mutations, each confirmed applied and each killed by a named test:**
  the user-agent token, the reconnect transition, the no-handler answer, no
  timer without a post channel, the same-origin path, the host suffix, the
  https check, the dispatcher's origin check, and the retired-Capacitor guard.
- **`eslint .` at 3 errors / 79 warnings with zero new findings.** Four files
  this branch touches carry a warning, and each carries the identical one on
  main, checked by linting main's copy through `--stdin`; every file it adds is
  clean.
- **`tsc --noEmit`**: only the 8 documented pre-existing errors in
  `confirmed-action.test.ts`.
- **`next build` green by exit code**, with `/auth`, `/onboarding`,
  `/settings`, `/dashboard`, `/dashboard/urgans` and `/locked` still `○ Static`.
- **`pnpm install --frozen-lockfile` passes.** Its one new warning is
  `@firebase/util`'s skipped install script, which only reads
  `FIREBASE_WEBAPP_CONFIG` for Firebase's web hosting; harmless here.
- **Mobile:** `tsc` clean, `expo-doctor` 21/21 (its TypeScript check excluded
  on purpose), `expo prebuild --platform android` clean, and
  `expo export --platform android` bundles with the project's real nested
  layout (660 modules, 1.6 MB).
- **A release APK built locally** from the short-path copy:
  `com.urganize.app`, target SDK 36, `arm64-v8a` + `x86_64`, 46 MB, manifest
  read with `aapt2`. It says 1.43.1 inside because it was built before the
  merge; the merge changed only `apps/mobile`'s version and description.

### Not verified

- **Nothing has run on a phone or an emulator.** The APK has not been
  installed anywhere, so the splash, keyboard, back button, offline screen and
  links are unseen.
- **iOS has never been built**: it needs the Firebase iOS app and its plist,
  an APNs key and EAS.
- **Google sign-in, push, sharing and the bar colours cannot be tried until
  the website half is live**, because the app loads the live site.
- **No EAS build has run.** The preview profile's chip list is proven only
  against the local Gradle project, and its auto-increment only by reading
  EAS's schema.
- **Whether an update from the Capacitor app keeps people signed in** (both
  load the same site, so it should).
