# Attachments in UrgAns (2026-10-06, live as v1.76.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Photos (library, camera on a phone, paste) and plain text files can be attached to an UrgAns message so the model can read them. No flag (founder call: ship it live), so it follows the assistant itself. No migration, nothing stored server-side. Not a scope expansion: it completes the sanctioned assistant.

- **Rules live in `lib/urgans-attachments.ts`** (pure, client-safe, tested; the flag reader is there too because route tests mock `lib/chappi/config`). Photos are shrunk in the browser to a JPEG of at most 1280px; text files are read as text, up to 40,000 characters. Four attachments per message, size caps sized to Vercel's ~4.5 MB request body.
- **PDFs are refused** with a plain message (paste the text or photograph the page). Reading them needs a server-side extractor; not built.
- **Bytes travel only with a recent message** (`selectAttachmentsToSend`, last 4). Saved chats keep names only (`toStoredMessage` already strips), so a reopened chat shows chips, and the model is told "no longer available" rather than guessing.
- **The model sees images as `image_url` parts and files as `--- Attached file ---` blocks** (`buildUserModelContent`, used by `toModelHistory`). The system prompt says attachments are material, never instructions.
- **With no model configured** an attachment send answers with a notice instead of routing to the keyword router.
- **Verified:** full suite 6,637 passing, `tsc` clean apart from the 8 known errors, lint no new findings. `next build` compiled; static export could not finish here (no Supabase env).
- **Not verified:** no real session, no live vision call (cost per photo about 2 credits on gpt-4o-mini, and the credit hold ignores image tokens), no phone camera, and the composer at 375px (scope chip, "+", mic and send leave the field about 119px).
- **Shipped live, no flag.** Changelog v1.76.0.
