import { redirect } from 'next/navigation';

// The release-scoped press kit is retired (2026-09-05). It was a scene on the
// workspace (`?scene=epk`), and before that its own page, so a manager's
// bookmark or a stale in-app link can still point here.
//
// Forwarded to the standing press kits list rather than deleted, and NOT to a
// release, because the kit is per artist now: there is no release-shaped
// destination left to send this to. The list names every artist, so whoever
// followed the old link lands one tap from the kit they were looking for.
//
// This is the OWNER-facing stub. The public link a journalist may hold lives at
// /epk/[token] and is deliberately still alive, handing over to /k/[slug] once
// that artist's kit is published.
export default function EpkRedirectPage() {
  redirect('/dashboard/press-kits');
}
