# Android release signing — manual steps

Play Store builds must be signed with an **upload keystore** that only you hold. The Gradle wiring is already done (`apps/mobile/android/app/build.gradle`); what remains needs a password, so it has to be you running it, not an assistant — nobody should type your signing password into a tool that logs its input.

Read the backup section before generating anything. Losing this file is the expensive mistake, not leaking it.

## 1. Generate the keystore

Run this from anywhere. Note the output path is **outside the repo** on purpose — gitignore is a safety net, not a strategy:

```bash
keytool -genkeypair -v -keystore ~/urganize-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias urganize-upload
```

`keytool` ships with the JDK. If it isn't on your PATH, use the one bundled with Android Studio:

```bash
"/c/Program Files/Android/Android Studio/jbr/bin/keytool" -genkeypair -v -keystore ~/urganize-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias urganize-upload
```

It will prompt for:

- **Keystore password** — choose a strong one. Store it in your password manager now, not later.
- **Name / organizational unit / city / country** — this ends up in the certificate. "Urganize" and your real city/country code are fine; none of it is shown to users.
- **Key password** — pressing Enter reuses the keystore password, which is normal and what `keystore.properties.example` assumes.

`-validity 10000` is ~27 years. Play requires a certificate valid well beyond any plausible release date; a short validity locks you out of updating your own app later.

## 2. Point the build at it

```bash
cp apps/mobile/android/keystore.properties.example apps/mobile/android/keystore.properties
```

Edit the copy with the real path, alias, and passwords. Both `keystore.properties` and `*.jks` are gitignored (`apps/mobile/android/.gitignore`) — verify with `git status` that neither appears before your next commit.

## 3. Back it up — this is the step people regret skipping

If you lose this keystore **and** its password, you cannot ship another update to `com.urganize.app`, ever. Not with a support ticket, not with a new key. The recovery path is publishing a brand-new listing under a different package name and asking every installed user to migrate manually.

Google Play App Signing softens this — Play holds the *app signing key* and you hold the *upload key*, so a lost upload key can be reset via Play support. Enrolling is the default for new apps and worth accepting. But that reset is a support round-trip, not a button, and it only helps if you enrolled.

Minimum backup: the `.jks` file in a password manager or encrypted cloud vault (not a plain Drive folder), plus the passwords stored separately from it. Treat it like the deed to the app.

## 4. Build a signed release

```bash
pnpm mobile:sync
```

Then, from `apps/mobile/android/`, with `JAVA_HOME` pointed at a JDK (Android Studio's bundled one works: `C:\Program Files\Android\Android Studio\jbr`):

```bash
./gradlew assembleRelease
```

Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` — this is the one to sideload to testers.

For the Play Store, build an App Bundle instead, which is what Play accepts for new apps:

```bash
./gradlew bundleRelease
```

Output: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.

Confirm it actually got signed with your key rather than silently falling back:

```bash
"/c/Program Files/Android/Android Studio/jbr/bin/keytool" -printcert -jarfile apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

If that errors or shows a CN of "Android Debug", `keystore.properties` was not picked up.

## 5. Bump `versionCode` before every upload

`versionCode` in `apps/mobile/android/app/build.gradle` must strictly increase on every build you upload to any Play track, and Play never lets a number be reused — even from a rejected or deleted build. It is currently `1`, correct for a first upload.

`versionName` needs no maintenance: it reads `apps/mobile/package.json` at build time, so it tracks the changelog ledger version automatically.

## Signature mismatch and the debug APK

An APK signed with this key **cannot install over** the debug APK from 2026-08-07, because Android refuses to replace an app with a build carrying a different signature. Anyone holding that debug build must uninstall it first, which clears their session and requires signing in again.

Worth doing once, now, rather than repeatedly: every release build from here shares this key, so upgrades work normally after this one-time break.
