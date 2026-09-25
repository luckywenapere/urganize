# Android signing

Every Android build of `com.urganize.app` must be signed with **the Urganize key you made on 2026-08-07**:

- File: `urganize-upload-key.jks` in your user folder (`C:\Users\penta\urganize-upload-key.jks`)
- Issued to: Urganize, Abuja, Federal Capital Territory, NG
- SHA-256 fingerprint: `37:A4:CB:08:FB:A4:C9:63:B8:62:49:54:F6:1F:83:2F:EC:CC:57:77:43:A7:83:6F:CF:AA:AF:11:D0:C9:33:DE`

The APK on urganize.app/download (the Capacitor app, version 0.41.2) is signed with it, and a phone only installs an update signed with the same key. A build signed with any other key fails with "App not installed" until the old app is removed.

## First, save the passwords

The passwords for that key are in `apps/mobile/android/keystore.properties` in your main checkout, inside the Capacitor project's old Android folder. That folder leaves the repo with the Expo move, nothing regenerates the file, and `expo prebuild --clean` deletes the whole folder. So before anything else:

1. Copy the store password, the key alias and the key password into your password manager.
2. Back up the `.jks` file somewhere other than this computer.

Losing either means the app on people's phones can never be updated; they would have to remove it and install a new one.

## Give the key to EAS

EAS builds in the cloud, so it needs its own copy. From `apps/mobile`:

```bash
eas credentials --platform android
```

Pick any build profile (the key is stored for the app, and every profile uses it), then **Keystore → Set up a new keystore**. Answer **No** when it offers to generate one; it then asks for the file, the alias and the two passwords.

Check it took: `eas credentials` shows the keystore's SHA-256 fingerprint, and it must match the one above. After the first build you can check the APK itself too:

```bash
apksigner verify --print-certs urganize.apk
```

## When the app goes on Google Play

Google Play signs apps with its own key by default (Play App Signing). If it makes a new one, people who installed the APK from urganize.app/download cannot update from Play. When you set up the app in Play Console, choose to **upload your own app signing key** and give it this one. You can then keep this key as the upload key too, or let Play set up a separate upload key.

## Never commit signing files

`apps/mobile/.gitignore` ignores `*.jks`, `*.keystore`, `*.p8`, `*.p12` and `credentials.json`. Check `git status` before committing if you ever handle one locally.

## The test APK from a local build is different

A local `./gradlew assembleRelease` (see `expo-shell.md`) signs with React Native's public test key, which is the same for every React Native project. That APK is only for trying the app on your own phone, after removing the old app. Never put it on urganize.app/download: anyone could build an "update" signed with the same public key.
