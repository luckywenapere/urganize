# Curator applications (2026-10-24, v1.172.0, behind NEXT_PUBLIC_FEATURE_PITCHING)

Founder approved mocks v2-apply, v2-sent and v2-admin. A playlist owner without
an invite can now apply; an admin approves or declines. Approve mints the same
single-use invite the Playlist owners page makes, so the join flow
(`/curator/join/<code>`) is unchanged.

## Pieces

- **Public form:** `/curator/apply` (`app/curator/apply/`). No sign-in. Chrome-free
  because AppShell treats every `/curator*` path as standalone. 404 with
  pitching off. Its own `loading.tsx` so the `/curator` inbox skeleton never
  flashes here.
- **Rules (pure):** `lib/curator-applications.ts` (genres, platforms, field
  checks, spam rules, display helpers), tested in `lib/curator-applications.test.ts`.
- **IO:** `lib/curator-applications-server.ts` (IP hash, playlist name read,
  row mapper, `mintCuratorInvite`, which uses `generateCuratorInviteCode` and
  `curatorInviteExpiry` from `lib/curator-invites.ts`).
- **Routes:** `POST /api/curator/apply` (public), `GET /api/admin/curator-applications`,
  `POST /api/admin/curator-applications/[applicationId]` `{ action: 'approve' | 'decline' }`
  (verifyAdmin).
- **Admin page:** `/admin/curator-applications`, listed on More under
  Operations as "Applications" (Inbox icon) with an "N new" badge, and on the
  Overview's attention rows. It is NOT a fifth sidebar tab: the admin menu is
  locked to Overview, Teams, Emails, More (founder, 2026-10-18;
  `lib/admin-sections.test.ts`).
- **Email:** template `curator_application_approved` (transactional, from
  notifications@). Sent on approve only when the contact is an email and Resend
  is configured. The approve reply always carries the link, and the admin page
  shows it with Copy, for WhatsApp contacts or a failed send.
- **Table:** `curator_applications`, migration
  `supabase/migrations/20261024150000_curator_applications.sql`.

## Traps

- **Spam guard** is quiet: a filled hidden `website` field or a form back in
  under 2.5 s gets a fake success and saves nothing. Then 5 per network per
  hour (salted SHA-256 of the IP in `ip_hash`), 3 per contact per day (429),
  and the same playlist link already `new` returns that row instead of a new
  one. There was no rate-limit infrastructure in the repo; this counts rows.
- **Playlist name** is best effort at submit time: Spotify's free oEmbed, else
  the page's og:title on Apple Music, Audiomack and Boomplay, 2.5 s timeout,
  `redirect: 'manual'` so the server never follows a link off those hosts.
  Falls back to host + path. No paid API.
- **RLS/grants:** anon has INSERT only, through a policy that pins
  `status = 'new'` and no review fields. No select/update policies; admins read
  through the service role. The migration revokes first because the
  `20261024120000` default privileges would otherwise give anon everything.
  The app inserts through the service role after the spam checks, so the anon
  policy is a ceiling, not the path.
- **Approve race:** the update is conditional on `status = 'new'`; the loser's
  freshly minted invite is revoked at once.

## Not verified

- Not run against a live database or in a browser; the migration was not
  applied (needs the founder's yes).
