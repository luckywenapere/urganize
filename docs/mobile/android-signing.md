# Android signing

Play Store builds must be signed with an **upload key**. Since the move to Expo (2026-09-24), EAS holds that key for you: on the first Android build it asks whether to generate a keystore, and you say yes. Nothing is kept in the repo or on your computer, and every later build is signed with the same key automatically.

## If you already made a keystore for the Capacitor app

The old instructions had you generate `urganize-upload-key.jks` yourself. **If you did, and it was ever used for a build uploaded to Google Play, you must keep using it.** Play refuses an update signed with a different upload key. Hand it to EAS instead of letting EAS make a new one:

```bash
eas credentials --platform android
```

Choose the production profile, then **Keystore → Set up a new keystore → upload existing**, and give it the file, alias and passwords. If nothing was ever uploaded to Play (true as of 2026-09-24: no Play Console record existed), letting EAS generate a fresh key is fine.

## Back it up anyway

Losing the upload key and its password means you can never update `com.urganize.app` again, and the only way out is a new store listing that every user has to move to by hand. EAS stores it for you, but download a copy once and put it with the password in your password manager:

```bash
eas credentials --platform android
```

Choose **Keystore → Download credentials**. Play App Signing, which Google turns on by default for new apps, adds a second safety net: Google holds the real signing key, and a lost upload key can be reset through Play support.

## Never commit signing files

`apps/mobile/.gitignore` ignores `*.jks`, `*.keystore`, `*.p8`, `*.p12` and `credentials.json`. Check `git status` before committing if you ever handle one locally.
