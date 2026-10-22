# Voice input for UrgAns (2026-09-25, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: let people talk to UrgAns instead of typing. There was no voice or
microphone code anywhere in the app before this. Behind
`NEXT_PUBLIC_FEATURE_URGANS_VOICE` (default off, only meaningful with
`NEXT_PUBLIC_FEATURE_CHAPPI`). **No migration.**

**Not a scope expansion** — it completes the assistant, which is already
sanctioned, and adds no new object. Founder decisions, taken first:
- **Server transcription.** The browser records a short clip and posts it to our
  own route; the model turns it into text.
- **The transcript fills the message box; nothing is sent automatically.** The
  person reads it and fixes a misheard artist name or title, then taps Send.
- **Text replies only** — UrgAns does not talk back.
- **English only.**
- **RodiumAi or nothing.** No new vendor: the route reuses the same
  `CHAPPI_API_KEY` and base UrgAns already uses. If RodiumAi has no transcription
  endpoint, voice stays off (see Activation).
- **Speaking is not metered.** Only the send counts against the 40/150 monthly
  actions, exactly as typing does. A per-team daily cap on transcriptions is the
  only guard.

### Eight things worth knowing before editing this

1. **`lib/urgans-voice.ts` is the pure, client-safe core** (the
   `lib/genre-prediction.ts` split): `pickRecordingMimeType`,
   `validateVoiceClip`, `parseTranscription`, `buildTranscriptionPrompt`,
   `mergeTranscript`. Run on both sides so the client and the route cannot
   disagree about what is acceptable. Fully unit-tested.
2. **`pickRecordingMimeType` returns null when nothing records, and that HIDES
   the mic.** A control that cannot work is worse than none. Safari/iOS only
   offer `audio/mp4`, so mp4 is in the candidate list after webm+opus — the
   order is tested, because a wrong order silently degrades quality on Chrome.
3. **`mergeTranscript` APPENDS, never replaces.** Someone who typed half a
   message and then spoke the rest gets both. `onTranscript` reads the live
   input from `useChappiStore.getState().input`, not a render closure, because a
   clip can land many seconds after recording started.
4. **The route (`app/api/urgans/transcribe/route.ts`) never meters and never
   stores.** It checks both flags before auth (404 `{"error":"Not found."}` when
   off, the plan/EPK precedent), then `requireActiveAuthenticatedUser` (blocks
   curators, applies the paywall). It writes exactly ONE billing event,
   `urgans_voice_transcription`, purely for the daily cap — never
   `recordUrgansAction`, `checkUrgansAllowance` or `'urgans_action'`.
   `lib/urgans-voice-guard.test.ts` enforces the no-metering, flag-before-auth
   and never-stores properties structurally, and both are mutation-tested.
5. **The daily cap is per TEAM, 100/24h (`VOICE_DAILY_CAP`), and fails OPEN** on
   an unreadable count, like every other counter here — wrongly refusing a real
   recording is worse than allowing one more. It reuses
   `countBillingEventsSince`, which is keyed on `workspaceId`.
6. **The mic lives in the one shared composer** (`ChappiConversation.tsx`'s
   `inputForm`, ~line 1048), so one edit covers the page, the dock and the side
   rail. Ghost style so Send stays primary; tap to start, tap to stop; while
   recording the field becomes a "Listening… 0:07" readout with a
   `motion-safe:animate-pulse` dot; while transcribing the field is disabled and
   the button spins. `Mic` was already in the icon passthrough, so
   `icons-registry.test.ts` needed no change.
7. **Native voice arrives with the next store build.** Android manifest gained
   `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`; iOS `Info.plist` gained
   `NSMicrophoneUsageDescription`. The APK on record today has neither, so the
   mic hits the `NotAllowedError` message ("Allow the microphone to talk to
   UrgAns.") there — safe, and the same "needs the next binary" state as push
   and recap share.

### Verified

`vitest run` on the new suites (22 + 6 cases) plus the copy guard and
icons-registry, all green; `eslint .` clean on every touched file; `tsc --noEmit`
clean apart from the documented pre-existing `confirmed-action.test.ts` errors;
`next build` green **by exit code** in both flag states, with `/auth`,
`/onboarding`, `/settings`, `/dashboard` and `/dashboard/urgans` all still
`○ Static`. Runtime probes on `next start`, rebuilding between states: flag off,
`POST /api/urgans/transcribe` returns **404** `{"error":"Not found."}` while
`/api/releases` returns **401**; flag on, it returns **401**. Two mutations
(the no-metering guard, the MIME order) each killed exactly their own test.

### Not verified

**Nothing has run against a real RodiumAi endpoint, a real session, a real
microphone or a phone.** This sandbox cannot mint a session, has no route to
either urganize domain, and the pane has no mic. The recorder, the permission
messages and the three composer states rest on unit tests, the build and the
route probes.

### Activation

1. **Probe RodiumAi FIRST**, with the real `rd_sk_…` key: check
   `GET https://api.rodiumai.io/v1/models` for a transcription model and
   `POST /v1/audio/transcriptions` with a short clip. **If the endpoint does not
   exist, stop — voice stays off** (founder call: one vendor, or nothing).
2. Set `URGANS_TRANSCRIBE_MODEL`, then `NEXT_PUBLIC_FEATURE_URGANS_VOICE=true`,
   with a commit that rebuilds `apps/web` (the `turbo-ignore` trap).
3. Changelog entry + minor version bump at the flip, not at merge (the EPK
   precedent).
4. Manual pass: desktop Chrome, iPhone Safari, Android Chrome, then the next
   store build of the native app.
