# Bring your notes (2026-10-26, v1.181.0 to v1.183.0, on with NEXT_PUBLIC_FEATURE_NOTES)

Founder-approved mocks, then built in two slices. A WhatsApp chat, a file, pasted text or photos become notes the person chooses to keep, attached to rollouts, with an optional UrgAns pass and a hand-off to the planner.

## Where things are
- **Pure rules, tested:** `lib/note-import/` (`whatsapp.ts` export reader, `detect.ts` the no-AI sorter, `match.ts` rollout matching, `build.ts` preview and note body, `commit.ts` payload check, `ai-sort.ts` AI prompt, validator and apply, `photo.ts`). Tests in `note-import.test.ts` and `ai-sort.test.ts`.
- **Browser only:** `read-file.ts` (txt, md, docx via mammoth, WhatsApp zip via fflate) and `client.ts` (shrink a photo, call the two AI routes). The raw chat or file never leaves the device; only kept notes are posted.
- **Routes** (`app/api/notes/import/`): `POST` saves kept notes with one `import_id`; `DELETE [importId]` undoes the batch; `POST sort` the AI pass; `POST photo` reads one photo. All 404 with the notes flag off.
- **UI:** `components/notes/import/BringNotesDialog.tsx`, opened from the Notes page ("Bring notes", the empty state, or `/dashboard/notes?import=1`).
- **Schema:** `notes.source` and `notes.import_id` (`20261026130000_notes_import.sql`, applied 2026-10-26, backup table `notes_backup_20261026`). Notes keep their original written-at date in `created_at` and `updated_at`.

## Decisions and traps
- No staging table: the preview lives in the browser. Photos and the AI pass do send text or a picture to the gateway, which is why the AI pass is a tap with a plain line saying so, and nothing is stored.
- The AI pass only proposes. `parseSortResponse` drops unknown ids, bad kinds, rollouts the caller does not own and silly dates; `applySort` never overrides a clear rollout match. The model has no tools and chat text is told to be data.
- Routing: the sort goes through `lib/ai/routed.ts` as surface `notes_import` (floor `quick`, one hop, pin `AI_NOTES_MODEL`) and logs to `ai_usage_events` as feature `notes_import`. Photos use `readImageText` in `lib/ai/provider.ts` (the model-router guard allows the chat-completions URL there only); optional pin `NOTES_PHOTO_MODEL`.
- Daily caps per team through billing events `notes_import_sort` (60) and `notes_import_photo` (60). Nothing is charged in credits yet.
- Ambiguity only happens when two rollouts share a full title; matching is on the whole title.
- The date order of a WhatsApp export is detected from the file and defaults to day-first.

## Voice notes and the share sheet (v1.183.0)
- **Voice:** `POST /api/notes/import/voice` uses the same speech call, daily cap (`VOICE_DAILY_CAP`) and billing event as dictation (`source: 'notes_import'`). The dialog records live with `useVoiceInput` or takes audio files. WhatsApp `.opus` is renamed `.ogg` on the phone (`normalizeVoiceFile`). Each transcript stays whole as one card, dated by the file's modified time.
- **Share sheet (Android Chrome, installed web app only):** `app/manifest.ts` declares `share_target` (POST `/share-target`, multipart). `public/sw-share-target.js`, loaded by BOTH `sw.js` and `sw-offline.js`, parks the share in the Cache API (`urganize-share-v1`) and redirects to `/dashboard/notes?import=share&share=<id>`; the page reads it back with `takeShare` (`lib/note-import/share.ts`) and deletes it. Unclaimed shares are swept after a day. `app/share-target/route.ts` is only a fallback for a share that arrives before the worker has control; it cannot read the share (the session is in localStorage, not a cookie) so it opens the dialog empty.
- **Trap:** iPhone Safari has no web share targets, and the Android APK is a webview, so a native share intent there needs `expo-share-intent` and a new signed build (use the real upload key, see android-signing-key).

## Not done
- A native share intent in the Android app, a WhatsApp number to forward to, and "from your note" tags on plan tasks. Credits for the AI pass.
- Not run against a real WhatsApp export, a real photo or the live model.
