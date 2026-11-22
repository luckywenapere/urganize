# Urganize music: a listening side (2026-11-21, v1.291.0, #1358, no flag)

Anyone who opens Urganize, signed in or not, now lands on a music side with three tabs, in this order: **Songs** (released songs, newest first), **You** (the listener's own corner) and **Search** (songs and artists; Top 10, Top 50 and Top 100 shown greyed out as "Coming soon"). **Settings** (the way into the Artist dashboard, pitches and the account) is not a tab: it is the gear at the top of You, and a link at the bottom of the laptop's side menu. The artist side is the backend: a rollout's new **Urganize music** row uploads the song.

## Decisions (Oyin, 2026-11-21)

- Listening needs **no account**. A free listener account type was discussed and is **not built yet**; nothing in this version asks anyone to sign in except opening the Artist dashboard.
- **Full songs**, MP3 and WAV, 40 MB cap (the audio cap in `asset-constants.ts`). WAV is stored and streamed as it is, **not transcoded**.
- Any team on a paid plan can publish. The paywall still covers only the dashboard side.
- A song goes live on release day (00:00 Lagos) or right away. No release date means it waits.
- The artist must tick that the rights are theirs before publishing. An explicit marker ("E") is shown. Only the artist can take a song down (no listener report yet).
- Artists see plays. A play counts after 30 seconds of listening, once per listener per track per 30 minutes.
- Existing team accounts and playlist owners land on the music side with a dismissible card saying their things moved, with Dashboard and Pitches buttons.
- **Reverses** the 17 Oct "no audio" decision.
- The root `/` redirects to `/music`; `/auth` defaults to `/music`; the install start page is `/music`. `HOME_PATH` stays `/dashboard` for onboarding, invites, the paywall and checkout. The Google callback treats both `/dashboard` and `/music` as "no real destination", so a never-onboarded Google account still goes to onboarding.

## The You tab (same day, Oyin: "make it a personal tab", then simplified)

- The You tab is **Liked songs** and nothing else: a heart on every song (list rows and the full player) adds it, newest like first. Settings is the gear at the top. Appearance stays in Settings.
- First built with followed artists and a "New from your artists" feed too; Oyin found it confusing, so Follow was cut. The followed-artist code was removed, not hidden. An older stored value that carried followed artists is still read for its liked ids.
- **Kept on this device only** (`localStorage`, `urganize.music.library`, `lib/music/library.ts`): listening needs no account, so there is no sign-in step to like a song. Likes do **not** follow someone to another phone or browser; syncing needs a listener account type and a table, and was not built. Up to 100 liked songs.
- Liked songs are fetched by id from the public list route (`?ids=`, capped at 100). A song that is taken down or not live yet drops out of the list and comes back if it goes live again.

## How it is built

- Tables `music_tracks` and `music_plays` (migration `20261121100000_music_listening.sql`, applied 2026-11-21). RLS on with no policies: every read and write goes through a service-role route.
- **"Live" is computed, never stored** (`lib/music/rules.ts`: `trackLiveAt`, `isTrackLive`, `trackStatus`) from `live_mode`, `published_at`, `taken_down_at` and the rollout's current release date. Moving the date moves the go-live. A taken-down or trashed rollout's song stops being listed.
- Audio is in the private `release-assets` bucket under `music/<releaseId>/`, uploaded straight to storage with a signed URL (the cover art flow). Listeners get a 302 to a short-lived signed URL from `/api/music/tracks/[id]/stream`, never cached.
- Public routes (`app/api/music/**`): list and search, stream, play. They never call the paywall helpers (`lib/music-public-guard.test.ts` reads the source to hold that). Artist routes (`app/api/releases/[releaseId]/music/**`) use the shared team access check; guests can look, not change.
- The listing reads at most 500 live songs and filters in memory. Move to a database search before that ceiling.
- Screens in `components/music/`, a persistent `<audio>` in `app/music/layout.tsx`. The artist scene is `components/releases/MusicSection.tsx`, a non-cacheable scene `music` in the rollout menu (Release group, after Distribute).

## Not verified

No real song has been uploaded, played, or taken down; the player, the stream redirect and the play count have only run as unit tests and a build. Looked at in a browser: Songs, Search, Settings and the sign-in sheet (empty state, phone and laptop). Do a real upload, publish, play and take-down pass on the live site.

## Redesign: two tabs, records, the circle menu (same day, v1.292.0, #1364, no flag)

Oyin approved the mocks in `docs/mocks/music-v2/mock.html` ("Yes, build it"). This supersedes the three-tab layout and the Settings gear above.

- **Top bar like the dashboard's.** The Urganize wordmark plus "Music" at the top left, two tabs (**Home** and **Collection**) with the dashboard's 17px semibold labels and green underline, a search circle and the **circle menu** (lucide `user-round-cog`) at the right. Phone: swipe left and right between the tabs (`lib/music/nav.ts`, `musicSwipeTarget`; 60px and clearly sideways, never from a slider or field). From md: the mark left, tabs centred, 72px tall. No side menu, no bottom tab bar.
- **Collection** (`/music/collection`) is the songs you hearted, newest first, with no heading or explainer. `/music/you` and `/music/settings` redirect.
- **Search** is a pushed page with Back and the field ready; the coming-soon playlists are cassette tiles.
- **The circle menu** (`MusicMenuSheet`) replaces the Dashboard and Pitches buttons and the Settings tab. Signed in: Artist dashboard, Upload a song, Playlist pitches, Appearance, Sign out. Signed out: Create my account, Sign in, Appearance, "Just listening? You don't need an account."
- **Upload, three doors.** The circle menu's Upload a song (`MusicUploadSheet`: pick a rollout from `GET /api/releases`, then the same `MusicSection` a rollout has), the dashboard Home "Upload a song" Try one tile (it replaced "What is late?", which the box above already answers; it opens `/music?upload=1`), and the existing row inside a rollout. The mock's "On Music" pill on the rollout list was left out: it needs a music lookup per rollout.
- **Back to music from the dashboard:** a headphones circle beside the avatar in `SwipeTopBar`, and an "Urganize Music" row in the avatar menu.
- **Analog feel, only where it says something true.** Songs are vinyl records (`Vinyl.tsx`): grooves, the cover as the label, a spindle hole. A record turns only while its song plays, and never with reduced motion (`.music-spin` in globals.css). The full player is a turntable with a tonearm that lifts off when paused; the position is a tick-mark dial (the native range input lies on top of it).
- **Wallpaper for everyone.** `/music` gets `data-app-shell` from the boot script for signed-out listeners too (`wallpaperForEveryone` in `lib/appearance.ts`), and `AppearanceWatcher` leaves it alone there. Music surfaces avoid opaque grounds so the picture shows.
- **Icons:** the music side imports plain lucide from `components/icons/lucide.ts` (the approved shadcn set), not the house marks in `components/icons`.
