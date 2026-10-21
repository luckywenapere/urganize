import type { Metadata } from 'next';
import { readInitialInvite } from '@/lib/invite-metadata-server';
import InviteAcceptPageClient from '@/app/invite/accept/InviteAcceptPageClient';

// The presentable invite-link entry point (founder request, 2026-07-23):
// app.urganize.app/join/<code>, Linear-style. It used to redirect to
// /invite/accept?token=<code>, and that page showed "Loading invite" until
// JavaScript arrived. It now renders the same invite page itself with the
// invite already read on the server, so the HTML a phone gets on weak data
// holds the real invite or the real "link not available". The work (signup,
// sign-in, joining) is the one invite page and /api/invites/[token].
export const metadata: Metadata = {
  title: 'Team invite',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const token = (code || '').trim();
  const initialLoad = await readInitialInvite(token);
  return <InviteAcceptPageClient token={token} initialLoad={initialLoad} />;
}
