# Your photo on your account (2026-10-30, flag off)

Founder approved mocks "photo-mocks-v3" on 2026-10-30. Behind
`NEXT_PUBLIC_FEATURE_PROFILE_PHOTO` (off unless `'true'`). Needs migration
`20261031060000_profile_avatar_path.sql` before the flag goes on. No changelog
entry yet: the founder adds one when the flag goes on.

## What

A person's own photo, the face their team sees.

- **Set up your team** (founder path): an optional "Your photo" row between the
  line and the form (`components/onboarding/AccountPhotoRow.tsx`). States:
  empty, uploading, error (Try again re-sends the same cropped file), done.
  Continue never waits on it. No Google suggestion here.
- **Invitee step**: a state inside `InviteAcceptPageClient` (also `/join/<code>`),
  shown after joining succeeds, just before the redirect
  (`components/onboarding/InvitePhotoStep.tsx`). Once per person per device
  (localStorage `urganize.account_photo.invite_seen.<uid>`), only with no photo.
  Every exit goes to the same `afterJoinPath` (keeps `?next=`). Offers the Google
  account photo when there is one; nothing is saved until "Use this photo".
  Not shown on the in-onboarding Join card (InvitesScreen); that is a different step.
- **Settings, Profile**: "Your photo" block above the form, saves on its own
  (`components/settings/AccountPhotoSettings.tsx`).
- **Faces**: the top bar avatar and its menu (`AvatarFace`), the onboarding top
  bar and account chip, the Team page and the task assignee picker
  (`loadWorkspaceMembers` fills `avatarUrl`, one profiles read and one batched
  signing call). Photos get a 1px hairline; a photo that fails to load falls
  back to initials.

## How

- Column `profiles.avatar_path`, a path in the private `release-assets` bucket,
  always `account/<uid>/photo/<file>`. Read with the service role, handed out as
  signed URLs (1 hour). Never public.
- Routes (`app/api/account/photo/`): `POST sign`, `GET` (`?suggest=google` adds
  `googleSuggestionUrl`), `PUT { photoPath }`, `POST google`. They use
  `getAuthenticatedUser`, not the paywall gate: the photo is offered before a
  trial exists. Each acts on the caller's own row and folder only.
- Client: `usePhotoUpload` (pick, downscale, crop, sign, PUT, save; lifted out of
  `ProfilePhotoPicker`, which now runs on it). The upload itself lives in a small
  zustand store (`lib/photo-upload-store.ts`); account surfaces share one
  (`accountPhotoUploadStore`) so an upload started on onboarding survives Continue.
- `useAccountPhotoStore` holds your own signed URL, not persisted. `AccountPhotoSync`
  (in AppShell) fetches it on sign-in and on focus after 45 minutes; a failed
  `<img>` asks once for a fresh link.
- Account deletion lists and removes everything under `account/<uid>/photo/`.
- Analytics: `profile_photo_saved` `{ surface: 'account_photo', place, source }`,
  `account_photo_skipped`.

## Traps

- **Not the directory photo.** That one is `person/<uid>/avatar/` on
  `person_profiles` and is part of a published profile. Adding an account photo
  must never touch it. Do not merge the two without a founder call.
- **Only the service role writes `avatar_path`.** The browser can upsert its own
  profiles row, so trigger `profiles_protect_avatar_path` refuses inserts with a
  value and any change from `authenticated`/`anon`. Without it a person could
  point their face at any file in the bucket and the server would sign it for
  their team. The server also re-checks `isOwnAccountPhotoPath` before signing.
- **The path guard is stricter than `isOwnPhotoPath`**: one file name directly in
  the folder, `[A-Za-z0-9._-]`, no `..`, no `.thumb`.
- **Google fetch is the SSRF surface.** The URL comes only from the account's own
  identities read with the admin client (never the request), must be https on
  a `*.googleusercontent.com` host, no credentials or odd port; no redirects
  followed, 8 s, 5 MB, JPEG/PNG/WebP. No server thumb is made for it; the
  original is small (512 px).
- **Signed URL cache.** `generateSignedUrl` caches for 48 of 60 minutes, so your
  own photo is signed fresh (`signFreshAccountPhoto`) to give the client a full
  hour. Teammates' faces use the cached batch and fall back to initials on error.
- **Flag off must be today.** Every surface returns null or the old initials
  element; `finishJoin` calls `router.replace(afterJoinPath)` synchronously.
- react-hooks/refs: callers destructure `bindInput` out of `usePhotoUpload`
  before passing it to `ref=`; passing `photo.bindInput` taints the whole object.
