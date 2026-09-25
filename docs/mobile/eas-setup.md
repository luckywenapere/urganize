# EAS setup: building and releasing the app

EAS (Expo Application Services) builds both apps in the cloud, including iOS without a Mac, and uploads them to the stores. It replaced Codemagic and local Android Studio builds on 2026-09-24. These steps need your own Expo, Apple and Google accounts, so they cannot be done from the code side.

## One-time setup

1. **Install the CLI and sign in.**
   ```bash
   npm install -g eas-cli
   ```
   ```bash
   eas login
   ```
2. **Create the project.** From `apps/mobile`:
   ```bash
   eas init
   ```
   It prints a project id. `app.config.ts` is a dynamic config, so EAS cannot write the id into it. Paste it into `PASTED_EAS_PROJECT_ID` in `apps/mobile/app.config.ts`. Until you do, builds and OTA updates are off.
3. **Android signing: give EAS your existing key before the first build.** Do not let EAS make a new one. The APK on urganize.app/download is signed with the key you made on 2026-08-07, and a phone only accepts an update signed with the same key. See `android-signing.md`.
4. **iOS.** You need an Apple Developer account. On the first iOS build, EAS asks to sign in to Apple and creates the certificates, the provisioning profile and the App Store Connect record for `com.urganize.app`. iOS push needs the Firebase steps in `push-setup.md` first. Without `GoogleService-Info.plist` the iOS build fails at prebuild, because the Firebase plugin requires it.

## Everyday commands (run from the repo root)

| What | Command |
|---|---|
| Run the app against a dev build | `pnpm mobile:start` |
| Build Android | `pnpm mobile:build:android -- --profile <development\|preview\|production>` |
| Build iOS | `pnpm mobile:build:ios -- --profile <development\|preview\|production>` |
| Ship a shell JS fix over the air | `pnpm --filter @urganize/mobile update -- --channel preview --message "..."` |

The profiles are defined in `apps/mobile/eas.json`:

- **development:** a dev client you install once. Then `pnpm mobile:start` loads the shell's JavaScript from your computer. Android builds an APK.
- **preview:** an internal build for testers, and the one to put on urganize.app/download. Android gives an installable APK; iOS goes to TestFlight or ad hoc devices. Its build number goes up on every build, so a new APK installs over the last one. It is built only for real phones (`armeabi-v7a`, `arm64-v8a`), not emulators, which makes the APK about 40 percent smaller than the four-chip default; a React Native APK is still around 40 MB, against 3.2 MB for the Capacitor one.
- **production:** store builds. Build numbers auto-increment (`appVersionSource: remote`), so there is no hand-kept `versionCode` any more. Submit with `eas submit --profile production`; Android goes to the Play internal track.

## What an OTA update can and cannot change

EAS Update replaces only the shell's own JavaScript: the bridge, the offline screen, the navigation rules. The website itself already updates the moment it deploys, so there is usually nothing to push. Anything native, such as a new Expo module, a permission, the icon or the splash, needs a new store build. `runtimeVersion` follows the app version, so an update only reaches builds of the same version.

## Versioning

The app version is read from `apps/mobile/package.json`, which mirrors the product ledger (`packages/changelog`) like every other `package.json`. The first changelog entry for the Expo app lands when a build first reaches people: the APK on urganize.app/download, or a store track.

## Replacing the APK on urganize.app/download

The page is `apps/homepage/app/download/page.tsx` and the file is `apps/homepage/public/downloads/urganize.apk`. Put a preview build there, signed with your Urganize key, and change `APP_VERSION` and `APK_SIZE` on the page in the same commit. Someone who installed the old app then installs the new one over it. Both load the same site, so they should stay signed in (not yet checked on a phone); if not, they sign in again, and nothing is lost, because everything lives on the server.

Do this in the same release as the website half of the Expo move (the branch that retired Capacitor). Before that ships, the live site does not know the new app; after it ships, the old Capacitor app loses Google sign-in, because the site no longer speaks to it.
