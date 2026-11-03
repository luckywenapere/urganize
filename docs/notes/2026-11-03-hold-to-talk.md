# Hold to talk (2026-11-03, v1.246.0)

Founder approved `docs/mocks/hold-to-talk/` (Decision 25). Phones only.

**What it does.** In the AI box on a phone (`HomeAskBar`, every variant, and `ChappiConversation`'s own box), press and hold the mic: after 300ms it records (the mic grows red, the box shows the timer and "‹ Slide left to cancel"). Let go: the clip is transcribed and sent as your message. Slide 70px left first ("Let go to cancel"): the clip is thrown away. A quick tap is unchanged: tap to start, tap to stop, the words land in the box.

**Box text.** `holdToTalkPlaceholder` in `lib/hold-to-talk.ts`: "Type or hold to talk" for a chat with no messages, "Reply or hold to talk" once it has some (founder, 2026-11-03). Only on a phone and only when the mic is there (`voice.supported`, which needs `NEXT_PUBLIC_FEATURE_URGANS_VOICE=true`), so the box never promises a missing mic. A page's own text (record capture, a rollout session) still wins.

**Pieces.** `useHoldToTalk(voice, enabled)` (`components/chappi/useHoldToTalk.ts`): pointer down starts a 300ms timer; pointer up after it stops (send) or cancels; the click that ends a hold is swallowed; a release before recording has started (permission prompt) is applied once it starts; long-press menu and text selection are off on the button. `useVoiceInput` gained `start`, `stop`, `cancel` (cancel drops the clip in `onstop`). The transcript handler asks `shouldSend()` once per clip.

**Depends on the voice flag.** If `NEXT_PUBLIC_FEATURE_URGANS_VOICE` is not `true` in production, no mic shows and nothing here appears. Talk to UrgAns (the waveform button) is off in `lib/cut-features.json`.

**Not verified** on a real phone; unit tests and `tsc` only.
