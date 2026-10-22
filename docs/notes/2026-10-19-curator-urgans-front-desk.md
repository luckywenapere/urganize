# Curator UrgAns front desk (URG-381, v1.161.0, 2026-10-19)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Curators teach UrgAns their terms once (`/curator/front-desk`); artists and managers ask about a pitch from the dashboard (`/dashboard/front-desk/[pitchId]`) or the public pitch status page, UrgAns answers from those terms, and anything it can't answer escalates to the curator's inbox (`/curator/front-desk/inbox`). A daily digest email (`front_desk_digest`, run from `app/api/cron/notifications`) lists waiting questions, deduped so a question rides once and again only when it grows. Founder approved the build Oct 18, 2026 and said "Ship for everyone everything" Oct 19, 04:10 WAT.

- **Code:** `lib/front-desk/` (flag, server, answer, terms, text, digest-server, client, types), `components/front-desk/`, `app/api/front-desk/` (every handler gated on the flag plus an owner check; `privacy-guard.test.ts` scans for it).
- **Tables (migration `20261018210000_curator_front_desk.sql`, additive, applied Oct 19):** `curator_desk_terms`, `pitch_desk_questions`, `pitch_desk_answers`; RLS on with no policies (server-only access).
- **Flag:** on for every curator. `FRONT_DESK_ALL=false` (Vercel) is the off switch and falls back to the Flow Test account plus `FRONT_DESK_EMAILS`. Decided on the server from the signed-in email; the digest and public reads check the CURATOR's account the same way.
